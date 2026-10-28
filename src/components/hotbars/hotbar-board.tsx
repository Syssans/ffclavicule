/**
 * Barres d'actions reconstruites comme en jeu : cases sombres à liseré, icônes des actions, barres dans leur forme
 * (12×1 … 1×12), en liste ou à leur place dans l'ATH.
 *
 * Toucher une case la choisit (puis une autre pour échanger). Appui long sur une action : elle se détache et suit
 * le doigt ; la case visée s'allume en or, et lâcher échange les deux cases (ou déplace, si la case visée est vide).
 */
import { Image } from 'expo-image';
import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { HotbarSlot, HudElement } from '@/api/hud';
import { gameIconUrl } from '@/api/xivapi';
import { LIST, listLayout, screenLayout, slotAt, slotBox, type BarPlacement } from '@/utils/hotbar-board';
import type { HudScreen, SlotRef, Slots } from '@/utils/hud';

export interface BoardBar {
  id: number;
  shared: boolean;
  slots: Slots;
  shape?: number;
  /** Masquée dans la disposition d'ATH actuelle. */
  hidden?: boolean;
  /** Élément de l'ATH (position, taille), pour la disposition « à l'écran ». */
  element?: HudElement;
}

/** Couleurs des cases, prises au jeu. */
export const SLOT_COLORS = {
  panel: '#0E1118',
  slot: '#1A1C22',
  rim: '#57503F',
  rimLight: '#8A7A55',
  gold: '#E8C987',
  changed: 'rgba(232,201,135,0.55)',
  text: '#D9D2C3',
  muted: 'rgba(217,210,195,0.55)',
};

export function HotbarBoard({
  bars,
  mode,
  screen,
  maxHeight = 600,
  picked = null,
  isChanged,
  interactive = true,
  onTap,
  onDrop,
  onDragChange,
}: {
  bars: BoardBar[];
  mode: 'list' | 'screen';
  screen?: HudScreen;
  maxHeight?: number;
  picked?: SlotRef | null;
  isChanged?: (ref: SlotRef) => boolean;
  interactive?: boolean;
  onTap?: (ref: SlotRef | null) => void;
  onDrop?: (from: SlotRef, to: SlotRef) => void;
  /** Début et fin d'un glisser (pour bloquer le défilement de la page pendant ce temps). */
  onDragChange?: (dragging: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));

  const layout = useMemo(() => {
    if (mode === 'list') return listLayout(bars, width);
    const placed = bars.filter((b) => b.element).map((b) => ({ id: b.id, element: b.element! }));
    return screen ? screenLayout(placed, screen, width, maxHeight) : { placements: [], height: 0 };
  }, [bars, mode, screen, width, maxHeight]);
  const byBar = useMemo(() => new Map(bars.map((b) => [b.id, b])), [bars]);

  // Glisser-déposer : la case de départ, la case visée, et l'icône qui suit le doigt.
  const [dragFrom, setDragFrom] = useState<SlotRef | null>(null);
  const dragRef = useRef<SlotRef | null>(null);
  const [hover, setHover] = useState<SlotRef | null>(null);
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const ghostOn = useSharedValue(0);

  const slotOf = useCallback((ref: SlotRef | null): HotbarSlot | null => (ref ? (byBar.get(ref.bar)?.slots[ref.slot] ?? null) : null), [byBar]);

  const handleTap = useCallback((x: number, y: number) => onTap?.(slotAt(layout.placements, x, y)), [layout, onTap]);
  const startDrag = useCallback(
    (x: number, y: number) => {
      const from = slotAt(layout.placements, x, y);
      // Une case vide ne se déplace pas.
      if (!from || !slotOf(from)) return;
      dragRef.current = from;
      setDragFrom(from);
      setHover(from);
      ghostOn.set(1);
      onDragChange?.(true);
    },
    [layout, slotOf, ghostOn, onDragChange],
  );
  const moveDrag = useCallback(
    (x: number, y: number) => {
      if (!dragRef.current) return;
      const at = slotAt(layout.placements, x, y);
      setHover((h) => (h?.bar === at?.bar && h?.slot === at?.slot ? h : at));
    },
    [layout],
  );
  const endDrag = useCallback(
    (x: number, y: number) => {
      ghostOn.set(0);
      const from = dragRef.current;
      dragRef.current = null;
      setDragFrom(null);
      setHover(null);
      if (!from) return;
      onDragChange?.(false);
      const to = slotAt(layout.placements, x, y);
      if (to && (from.bar !== to.bar || from.slot !== to.slot)) onDrop?.(from, to);
    },
    [layout, ghostOn, onDrop, onDragChange],
  );

  const cancelDrag = useCallback(() => {
    ghostOn.set(0);
    if (dragRef.current) onDragChange?.(false);
    dragRef.current = null;
    setDragFrom(null);
    setHover(null);
  }, [ghostOn, onDragChange]);

  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(handleTap, e.x, e.y);
    },
  });
  const drag = usePanGesture({
    activateAfterLongPress: 220,
    onActivate: (e) => {
      'worklet';
      gx.set(e.x);
      gy.set(e.y);
      scheduleOnRN(startDrag, e.x, e.y);
    },
    onUpdate: (e) => {
      'worklet';
      gx.set(e.x);
      gy.set(e.y);
      scheduleOnRN(moveDrag, e.x, e.y);
    },
    // Geste interrompu (appel, notification…) : la case reste où elle était.
    onFinalize: () => {
      'worklet';
      scheduleOnRN(cancelDrag);
    },
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) scheduleOnRN(cancelDrag);
      else scheduleOnRN(endDrag, e.x, e.y);
    },
  });
  const gesture = useCompetingGestures(drag, tap);

  const dragged = slotOf(dragFrom);
  const ghostSize = Math.max(52, (layout.placements[0]?.size ?? 40) * 1.5);
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.get(),
    // Au-dessus du doigt, pour qu'il ne cache pas l'icône.
    transform: [{ translateX: gx.get() - ghostSize / 2 }, { translateY: gy.get() - ghostSize * 1.25 }],
  }));

  const content = (
    <View style={[styles.board, { height: layout.height }]} onLayout={onLayout} collapsable={false}>
      {mode === 'list'
        ? layout.placements.map((p) => {
            const bar = byBar.get(p.bar)!;
            return (
              <Text key={`t${p.bar}`} style={[styles.title, { top: p.y - LIST.title }]} numberOfLines={1}>
                Barre {p.bar + 1}
                {bar.shared ? <Text style={styles.titleMuted}> · commune à tous les jobs</Text> : null}
                {bar.hidden ? <Text style={styles.titleMuted}> · masquée en jeu</Text> : null}
              </Text>
            );
          })
        : null}
      {layout.placements.map((p) =>
        byBar.get(p.bar)!.slots.map((slot, index) => {
          const ref = { bar: p.bar, slot: index };
          const same = (r: SlotRef | null) => r?.bar === p.bar && r.slot === index;
          return (
            <SlotView
              key={`${p.bar}-${index}`}
              placement={p}
              index={index}
              slot={slot}
              picked={same(picked)}
              target={dragFrom !== null && same(hover) && !same(dragFrom)}
              lifted={same(dragFrom)}
              changed={isChanged?.(ref) ?? false}
              dimmed={picked !== null && !same(picked)}
            />
          );
        }),
      )}
      {dragged ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.ghost, { width: ghostSize, height: ghostSize, borderRadius: ghostSize * 0.18 }, ghostStyle]}>
          {dragged.icon ? <Image source={gameIconUrl(dragged.icon)} style={styles.fill} contentFit="cover" /> : null}
        </Animated.View>
      ) : null}
    </View>
  );

  return interactive ? <GestureDetector gesture={gesture}>{content}</GestureDetector> : content;
}

function SlotView({
  placement,
  index,
  slot,
  picked,
  target,
  lifted,
  changed,
  dimmed,
}: {
  placement: BarPlacement;
  index: number;
  slot: HotbarSlot | null;
  picked: boolean;
  target: boolean;
  lifted: boolean;
  changed: boolean;
  dimmed: boolean;
}) {
  const box = slotBox(placement, index);
  const radius = Math.max(3, box.size * 0.16);
  const ring = target || picked ? SLOT_COLORS.gold : changed ? SLOT_COLORS.changed : SLOT_COLORS.rim;
  return (
    <View
      accessible
      accessibilityLabel={`Barre ${placement.bar + 1}, case ${index + 1} : ${slot?.name ?? 'vide'}`}
      style={[
        styles.slot,
        {
          left: box.x,
          top: box.y,
          width: box.size,
          height: box.size,
          borderRadius: radius,
          borderColor: ring,
          borderWidth: target || picked ? 2 : 1,
          borderStyle: changed && !target && !picked ? 'dashed' : 'solid',
          opacity: lifted ? 0.25 : dimmed ? 0.55 : 1,
        },
        target && styles.glow,
      ]}>
      {slot?.icon ? (
        <Image source={gameIconUrl(slot.icon)} style={[styles.fill, { borderRadius: radius - 1 }]} contentFit="cover" />
      ) : slot ? (
        <Text style={[styles.name, { fontSize: Math.max(7, box.size * 0.18) }]} numberOfLines={3}>
          {slot.name}
        </Text>
      ) : (
        // Case vide : le creux du jeu, un peu plus sombre au centre.
        <View style={[styles.empty, { borderRadius: radius - 1 }]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { width: '100%' },
  title: { position: 'absolute', left: 0, right: 0, color: SLOT_COLORS.text, fontSize: 12, lineHeight: 16, fontWeight: '700' },
  titleMuted: { color: SLOT_COLORS.muted, fontWeight: '500' },
  slot: { position: 'absolute', backgroundColor: SLOT_COLORS.slot, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  glow: { shadowColor: SLOT_COLORS.gold, shadowOpacity: 0.9, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  fill: { width: '100%', height: '100%' },
  empty: { position: 'absolute', top: 2, left: 2, right: 2, bottom: 2, backgroundColor: '#121318', borderWidth: 1, borderColor: 'rgba(0,0,0,0.6)' },
  name: { color: SLOT_COLORS.text, textAlign: 'center', paddingHorizontal: 1 },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: SLOT_COLORS.gold,
    backgroundColor: SLOT_COLORS.slot,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
