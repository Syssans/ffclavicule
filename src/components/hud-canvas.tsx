/**
 * Écran du jeu en miniature : un cadre par élément de l'ATH, à faire glisser du doigt.
 * Le déplacement reste local pendant le geste ; la position n'est remontée qu'au lâcher.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

import type { HudElement } from '@/api/hud';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { clampRect, elementRect, hitTest, positionFor, snap, type HudScreen, type Rect } from '@/utils/hud';

const GROUP_COLORS: Record<HudElement['group'], string> = {
  hotbar: '#D9B36C',
  main: '#7FA7E8',
  gauge: '#E58A8A',
  content: '#8FD1A5',
  pvp: '#C49BE8',
};

/** Écart (en points du téléphone) en deçà duquel un cadre s'aimante au centre ou au bord. */
const SNAP_POINTS = 6;
/** Marge autour des petits cadres pour les attraper au doigt. */
const TOUCH_SLOP = 6;

interface Grab {
  hash: number;
  rect: Rect;
  pageX: number;
  pageY: number;
}

interface Drag {
  hash: number;
  rect: Rect;
  guideX?: number;
  guideY?: number;
}

export function HudCanvas({
  elements,
  screen,
  selected,
  modified,
  onSelect,
  onMove,
  onPreviewPress,
}: {
  elements: HudElement[];
  screen: HudScreen;
  selected: number | null;
  modified: Set<number>;
  onSelect: (hash: number) => void;
  onMove: (hash: number, position: { x: number; y: number }) => void;
  /** Aperçu seulement : un toucher appelle cette fonction (ouverture de l'éditeur plein écran) au lieu de déplacer. */
  onPreviewPress?: () => void;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const k = width > 0 ? width / screen.width : 0;

  const rects = useMemo(() => elements.map((e) => ({ hash: e.hash, rect: elementRect(e, screen) })), [elements, screen]);

  const hitAt = (event: GestureResponderEvent) => {
    if (!k) return null;
    const { locationX, locationY } = event.nativeEvent;
    return hitTest(rects, locationX / k, locationY / k, TOUCH_SLOP / k);
  };

  const begin = (event: GestureResponderEvent) => {
    const hash = hitAt(event);
    if (hash === null) return;
    const rect = rects.find((r) => r.hash === hash)!.rect;
    setGrab({ hash, rect, pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY });
    onSelect(hash);
  };

  const move = (event: GestureResponderEvent) => {
    if (!grab || !k) return;
    const dx = event.nativeEvent.pageX - grab.pageX;
    const dy = event.nativeEvent.pageY - grab.pageY;
    if (!drag && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    const moved = clampRect({ ...grab.rect, x: grab.rect.x + dx / k, y: grab.rect.y + dy / k }, screen);
    const { guideX, guideY, ...rect } = snap(moved, screen, SNAP_POINTS / k);
    setDrag({ hash: grab.hash, rect, guideX, guideY });
  };

  const end = () => {
    if (grab && drag && drag.hash === grab.hash) {
      const element = elements.find((e) => e.hash === grab.hash);
      if (element) onMove(grab.hash, positionFor(element, screen, drag.rect.x, drag.rect.y));
    }
    setGrab(null);
    setDrag(null);
  };

  const cancel = () => {
    setGrab(null);
    setDrag(null);
  };

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      onLayout={onLayout}
      style={[styles.canvas, { aspectRatio: screen.width / screen.height, borderColor: theme.border }]}
      accessibilityLabel="Aperçu de l’écran du jeu">
      <View style={[styles.centerLine, { left: '50%', top: 0, bottom: 0, width: StyleSheet.hairlineWidth }]} />
      <View style={[styles.centerLine, { top: '50%', left: 0, right: 0, height: StyleSheet.hairlineWidth }]} />
      {k > 0
        ? rects.map(({ hash, rect }) => {
            const element = elements.find((e) => e.hash === hash)!;
            const r = drag?.hash === hash ? drag.rect : rect;
            const isSelected = hash === selected;
            const color = GROUP_COLORS[element.group];
            return (
              <View
                key={hash}
                pointerEvents="none"
                style={[
                  styles.box,
                  {
                    left: r.x * k,
                    top: r.y * k,
                    width: Math.max(4, r.w * k),
                    height: Math.max(4, r.h * k),
                    borderColor: isSelected ? '#FFFFFF' : color,
                    backgroundColor: `${color}${isSelected ? '66' : '33'}`,
                    borderStyle: element.visible ? 'solid' : 'dashed',
                    opacity: element.visible ? Math.max(0.45, element.opacity / 255) : 0.5,
                    borderWidth: isSelected ? 2 : 1,
                    zIndex: isSelected ? 2 : 1,
                  },
                ]}>
                {r.w * k > 28 && r.h * k > 10 ? (
                  <ThemedText numberOfLines={1} style={styles.label}>
                    {modified.has(hash) ? '• ' : ''}
                    {element.name}
                  </ThemedText>
                ) : null}
              </View>
            );
          })
        : null}
      {drag?.guideX !== undefined ? (
        <View pointerEvents="none" style={[styles.guide, { left: drag.guideX * k - 0.5, top: 0, bottom: 0, width: 1 }]} />
      ) : null}
      {drag?.guideY !== undefined ? (
        <View pointerEvents="none" style={[styles.guide, { top: drag.guideY * k - 0.5, left: 0, right: 0, height: 1 }]} />
      ) : null}
      {onPreviewPress ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onPreviewPress}
          accessibilityRole="button"
          accessibilityLabel="Modifier l’ATH en plein écran"
        />
      ) : (
      /* Calque transparent au-dessus des cadres : il reçoit le doigt, seulement s'il tombe sur un cadre (sinon la page défile). */
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={(event) => hitAt(event) !== null}
        onResponderTerminationRequest={() => false}
        onResponderGrant={begin}
        onResponderMove={move}
        onResponderRelease={end}
        onResponderTerminate={cancel}
      />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: '100%',
    backgroundColor: '#10151F',
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  centerLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.12)' },
  guide: { position: 'absolute', backgroundColor: '#FFE08A', zIndex: 3 },
  box: { position: 'absolute', borderRadius: 2, overflow: 'hidden', justifyContent: 'center' },
  label: { fontSize: 8, lineHeight: 10, color: '#FFFFFF', paddingHorizontal: 2 },
});
