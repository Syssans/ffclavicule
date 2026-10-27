/**
 * Visionneuse de carte : la texture du jeu (2048 × 2048) qu'on déplace et zoome au doigt (pincer, glisser,
 * toucher deux fois), avec les points des calques par-dessus. Les icônes gardent leur taille à l'écran quel que
 * soit le zoom ; les noms apparaissent à mesure qu'on zoome, comme dans le jeu.
 */
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, Platform, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  GestureDetector,
  useCompetingGestures,
  useExclusiveGestures,
  useLongPressGesture,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDecay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { gameIconUrl } from '@/api/xivapi';
import { DisplayFont } from '@/constants/theme';
import { MAP_SIZE, nearestPoint, placeLabels, visibleRank, type MapPoint } from '@/utils/map';

const ICON = 26;
const LABEL_WIDTH = 170;
/** Zoom maximal par rapport à la carte entière. */
const MAX_ZOOM = 12;
/** Distance (à l'écran) à laquelle un toucher attrape un point. */
const TOUCH_RADIUS = 24;

export interface MapViewerHandle {
  /** Centre la carte sur un point (pixels de la carte), en zoomant au besoin. */
  focus: (x: number, y: number, zoom?: number) => void;
  zoomBy: (factor: number) => void;
  reset: () => void;
}

interface Props {
  /** Image de la carte : fichier livré avec l'appli ou adresse. */
  image: number | { uri: string };
  points: MapPoint[];
  selectedId?: string | null;
  /** Repère posé par l'utilisateur (appui long). */
  pin?: { x: number; y: number } | null;
  onTap: (point: MapPoint | null, x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  /** Carte affichée en entier au départ, ou centrée sur ce point. */
  initialFocus?: { x: number; y: number; zoom?: number } | null;
  /** Remplir l'écran au départ (carte du monde, plus large que haute) au lieu de montrer la carte entière. */
  initialCover?: boolean;
}

/** Bornes du déplacement : la carte couvre l'écran, ou reste centrée si elle est plus petite que lui. */
function clampAxis(value: number, content: number, view: number): number {
  'worklet';
  if (content <= view) return (view - content) / 2;
  return Math.min(0, Math.max(view - content, value));
}

export const MapViewer = forwardRef<MapViewerHandle, Props>(function MapViewer(
  { image, points, selectedId, pin, onTap, onLongPress, initialFocus, initialCover = false },
  ref,
) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fit = size.w && size.h ? Math.min(size.w, size.h) / MAP_SIZE : 1;
  const [zoom, setZoom] = useState(1);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const minScale = useSharedValue(1);
  const maxScale = useSharedValue(MAX_ZOOM);

  const moveTo = useCallback(
    (x: number, y: number, target: number, animate = true) => {
      const s = Math.min(maxScale.get(), Math.max(minScale.get(), target));
      const nx = clampAxis(w.get() / 2 - x * s, MAP_SIZE * s, w.get());
      const ny = clampAxis(h.get() / 2 - y * s, MAP_SIZE * s, h.get());
      const timing = { duration: 320 };
      scale.set(animate ? withTiming(s, timing) : s);
      tx.set(animate ? withTiming(nx, timing) : nx);
      ty.set(animate ? withTiming(ny, timing) : ny);
      setZoom(s);
    },
    [h, maxScale, minScale, scale, tx, ty, w],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === size.w && height === size.h) return;
    const first = size.w === 0;
    setSize({ w: width, h: height });
    const fitScale = Math.min(width, height) / MAP_SIZE;
    w.set(width);
    h.set(height);
    minScale.set(fitScale);
    maxScale.set(Math.max(fitScale * MAX_ZOOM, 1.5));
    if (first && initialFocus) moveTo(initialFocus.x, initialFocus.y, fitScale * (initialFocus.zoom ?? 4), false);
    else if (first) moveTo(MAP_SIZE / 2, MAP_SIZE / 2, initialCover ? Math.max(width, height) / MAP_SIZE : fitScale, false);
    else moveTo((width / 2 - tx.get()) / scale.get(), (height / 2 - ty.get()) / scale.get(), scale.get(), false);
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: (x, y, factor = 4) => moveTo(x, y, Math.max(scale.get(), minScale.get() * factor)),
      zoomBy: (factor) => moveTo((w.get() / 2 - tx.get()) / scale.get(), (h.get() / 2 - ty.get()) / scale.get(), scale.get() * factor),
      reset: () => moveTo(MAP_SIZE / 2, MAP_SIZE / 2, minScale.get()),
    }),
    [h, minScale, moveTo, scale, tx, ty, w],
  );

  const handleTap = useCallback(
    (x: number, y: number, radius: number) => {
      onTap(nearestPoint(points, x, y, radius), x, y);
    },
    [onTap, points],
  );
  const handleLongPress = useCallback((x: number, y: number) => onLongPress?.(x, y), [onLongPress]);

  // Gestes (Gesture Handler 3, sur le fil de l'interface) : pincer et glisser ensemble, toucher deux fois pour
  // zoomer, toucher pour choisir un point, appui long pour poser un repère.
  // Pincer et glisser agissent ensemble, chacun par petits pas depuis l'événement précédent : le pincement zoome
  // autour du point entre les doigts, le glissement (un ou deux doigts) déplace. Ainsi ils s'additionnent au lieu de
  // se disputer la position de la carte. Un nouveau geste arrête l'élan du précédent.
  const stopMotion = () => {
    'worklet';
    cancelAnimation(scale);
    cancelAnimation(tx);
    cancelAnimation(ty);
  };

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      stopMotion();
    },
    onUpdate: (e) => {
      'worklet';
      const before = scale.get();
      const after = Math.min(maxScale.get(), Math.max(minScale.get(), before * e.scaleChange));
      const factor = after / before;
      scale.set(after);
      // Le point de la carte sous les doigts reste sous les doigts.
      tx.set(clampAxis(e.focalX - (e.focalX - tx.get()) * factor, MAP_SIZE * after, w.get()));
      ty.set(clampAxis(e.focalY - (e.focalY - ty.get()) * factor, MAP_SIZE * after, h.get()));
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(setZoom, scale.get());
    },
  });

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      stopMotion();
    },
    onUpdate: (e) => {
      'worklet';
      tx.set(clampAxis(tx.get() + e.changeX, MAP_SIZE * scale.get(), w.get()));
      ty.set(clampAxis(ty.get() + e.changeY, MAP_SIZE * scale.get(), h.get()));
    },
    onDeactivate: (e) => {
      'worklet';
      const content = MAP_SIZE * scale.get();
      if (content > w.get()) tx.set(withDecay({ velocity: e.velocityX, clamp: [w.get() - content, 0] }));
      if (content > h.get()) ty.set(withDecay({ velocity: e.velocityY, clamp: [h.get() - content, 0] }));
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    maxDistance: 16,
    onActivate: (e) => {
      'worklet';
      const s = Math.min(maxScale.get(), scale.get() * 2.2);
      const cx = (e.x - tx.get()) / scale.get();
      const cy = (e.y - ty.get()) / scale.get();
      const timing = { duration: 280 };
      scale.set(withTiming(s, timing));
      tx.set(withTiming(clampAxis(w.get() / 2 - cx * s, MAP_SIZE * s, w.get()), timing));
      ty.set(withTiming(clampAxis(h.get() / 2 - cy * s, MAP_SIZE * s, h.get()), timing));
      scheduleOnRN(setZoom, s);
    },
  });

  const tap = useTapGesture({
    maxDistance: 10,
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(handleTap, (e.x - tx.get()) / scale.get(), (e.y - ty.get()) / scale.get(), TOUCH_RADIUS / scale.get());
    },
  });

  const longPress = useLongPressGesture({
    minDuration: 450,
    onActivate: (e) => {
      'worklet';
      scheduleOnRN(handleLongPress, (e.x - tx.get()) / scale.get(), (e.y - ty.get()) / scale.get());
    },
  });

  const moveGestures = useSimultaneousGestures(pinch, pan);
  const tapGestures = useExclusiveGestures(doubleTap, tap);
  const gesture = useCompetingGestures(moveGestures, tapGestures, longPress);

  // Les transformations s'appliquent autour du centre de la carte : on compense pour zoomer depuis le coin.
  const contentStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.get() - (MAP_SIZE / 2) * (1 - scale.get()) },
      { translateY: ty.get() - (MAP_SIZE / 2) * (1 - scale.get()) },
      { scale: scale.get() },
    ],
  }));
  // Un seul style partagé par tous les points : ils gardent leur taille à l'écran.
  const counterStyle = useAnimatedStyle<ViewStyle>(() => ({
    transform: [{ scale: 1 / scale.get() }],
  }));

  const rank = visibleRank(zoom, fit);
  const labels = useMemo(() => placeLabels(points, zoom, rank, selectedId, ICON, LABEL_WIDTH), [points, rank, selectedId, zoom]);
  const ordered = useMemo(
    // Les grands noms dessous, le point choisi au-dessus de tout.
    () => [...points].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId) || b.rank - a.rank),
    [points, selectedId],
  );

  return (
    <View style={styles.viewport} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {size.w > 0 ? (
            <Animated.View style={[styles.content, contentStyle]}>
              <Image
                source={image}
                style={styles.image}
                contentFit="cover"
                cachePolicy="disk"
                transition={250}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
              {ordered.map((p) => (
                <Marker key={p.id} point={p} selected={p.id === selectedId} showLabel={labels.has(p.id)} counterStyle={counterStyle} />
              ))}
              {pin ? <Pin x={pin.x} y={pin.y} counterStyle={counterStyle} /> : null}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>
      {!loaded && !failed ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color="#E8D9A8" />
        </View>
      ) : null}
      {failed ? (
        <View pointerEvents="none" style={styles.loading}>
          <Text style={styles.failed}>Carte indisponible (pas de réseau ?)</Text>
        </View>
      ) : null}
    </View>
  );
});

type CounterStyle = ReturnType<typeof useAnimatedStyle<ViewStyle>>;

const Marker = memo(function Marker({
  point,
  selected,
  showLabel,
  counterStyle,
}: {
  point: MapPoint;
  selected: boolean;
  showLabel: boolean;
  counterStyle: CounterStyle;
}) {
  const big = point.icon === 0 && point.rank === 0;
  const textOnly = point.icon === 0;
  const label = point.label && (showLabel || textOnly) ? point.label : null;
  // Les petits noms sans icône n'apparaissent qu'avec le zoom.
  if (textOnly && !showLabel) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, { left: point.x, top: point.y }, counterStyle]}>
      {point.icon ? (
        <View style={[styles.iconBox, selected && styles.iconSelected]}>
          <Image source={{ uri: gameIconUrl(point.icon) }} style={styles.icon} cachePolicy="disk" />
        </View>
      ) : null}
      {label ? (
        // Le texte vit dans une boîte de largeur fixe : sur le web, un texte limité en lignes ne dépasse pas son parent
        // (ici un point de taille nulle).
        <View style={[styles.labelBox, labelPosition(textOnly ? 0 : point.orientation, big)]}>
          <Text
            numberOfLines={2}
            style={[
              styles.label,
              big && styles.labelBig,
              selected && styles.labelSelected,
              { textAlign: labelAlign(textOnly ? 0 : point.orientation) },
            ]}>
            {label}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
});

function labelPosition(orientation: number, big: boolean) {
  const width = big ? LABEL_WIDTH + 60 : LABEL_WIDTH;
  switch (orientation) {
    case 1:
      return { right: ICON / 2 + 2, top: -9, width };
    case 2:
      return { left: ICON / 2 + 2, top: -9, width };
    case 3:
      return { left: -width / 2, bottom: ICON / 2, width };
    case 4:
      return { left: -width / 2, top: ICON / 2, width };
    default:
      return { left: -width / 2, top: big ? -12 : -9, width };
  }
}

function labelAlign(orientation: number): 'left' | 'right' | 'center' {
  return orientation === 1 ? 'right' : orientation === 2 ? 'left' : 'center';
}

function Pin({ x, y, counterStyle }: { x: number; y: number; counterStyle: CounterStyle }) {
  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, { left: x, top: y }, counterStyle]}>
      <View style={styles.pin}>
        <View style={styles.pinDot} />
      </View>
    </Animated.View>
  );
}

const shadow = Platform.select({
  web: { textShadow: '0 0 3px #000, 0 0 2px #000' } as object,
  default: {
    textShadowColor: 'rgba(0,0,0,0.95)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 0 },
  },
});

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden', backgroundColor: '#1A1712' },
  content: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: MAP_SIZE,
    height: MAP_SIZE,
  },
  image: { width: MAP_SIZE, height: MAP_SIZE },
  anchor: { position: 'absolute', width: 0, height: 0, overflow: 'visible' },
  iconBox: {
    position: 'absolute',
    left: -ICON / 2,
    top: -ICON / 2,
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: {
    backgroundColor: 'rgba(232,201,120,0.35)',
    borderWidth: 2,
    borderColor: '#F3D98B',
    transform: [{ scale: 1.35 }],
  },
  icon: { width: ICON, height: ICON },
  labelBox: { position: 'absolute' },
  label: {
    color: '#FFF8E6',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    ...shadow,
  },
  labelBig: {
    fontFamily: DisplayFont.bold,
    fontSize: 15,
    lineHeight: 20,
    color: '#F6E7B8',
  },
  labelSelected: { color: '#FFE08A' },
  pin: {
    position: 'absolute',
    left: -11,
    top: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: '#FFE08A',
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFE08A' },
  loading: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  failed: { color: '#E8D9A8', fontSize: 14 },
});
