/**
 * Visionneuse de carte : la texture du jeu (2048 × 2048) qu'on déplace et zoome au doigt (pincer, glisser,
 * toucher deux fois), avec les points des calques par-dessus.
 *
 * Seule l'image de la carte est agrandie. Les icônes et les noms sont dessinés par-dessus, à leur taille réelle à
 * l'écran (chacun suit la carte), pour rester nets à tous les zooms ; seuls ceux qui sont à l'écran sont dessinés.
 */
import { Image } from 'expo-image';
import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, type LayoutChangeEvent, Platform, StyleSheet, Text, View } from 'react-native';
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
import Animated, {
  cancelAnimation,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { gameIconUrl } from '@/api/xivapi';
import { DisplayFont } from '@/constants/theme';
import { MAP_SIZE, nearestPoint, placeLabels, visibleRank, type MapFrame, type MapPoint } from '@/utils/map';

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
  /** Point à montrer à l'ouverture (centré, zoomé). */
  initialFocus?: { x: number; y: number; zoom?: number } | null;
  /** Partie utile de la carte, cadrée à l'ouverture (sinon la carte entière). */
  frame?: MapFrame | null;
  /** Remplir l'écran au départ (carte du monde, plus large que haute) au lieu de montrer la carte entière. */
  initialCover?: boolean;
  /** Bandes de l'écran couvertes par les commandes (barre de titre et puces en haut, calques en bas). */
  insets?: { top: number; bottom: number };
}

interface Camera {
  s: number;
  x: number;
  y: number;
}

/**
 * Bornes du déplacement sur un axe : la carte couvre la partie visible [start, end], ou y reste centrée si elle est
 * plus petite qu'elle.
 */
function clampAxis(value: number, content: number, start: number, end: number): number {
  'worklet';
  const view = end - start;
  if (content <= view) return start + (view - content) / 2;
  return Math.min(start, Math.max(end - content, value));
}

export const MapViewer = forwardRef<MapViewerHandle, Props>(function MapViewer(
  { image, points, selectedId, pin, onTap, onLongPress, initialFocus, frame, initialCover = false, insets = { top: 0, bottom: 0 } },
  ref,
) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const fit = size.w && size.h ? Math.min(size.w, Math.max(1, size.h - insets.top - insets.bottom)) / MAP_SIZE : 1;
  // Position de la carte côté React (pour choisir les points à dessiner), mise à jour par paliers pendant les gestes.
  const [camera, setCamera] = useState<Camera>({ s: 1, x: 0, y: 0 });

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const minScale = useSharedValue(1);
  const maxScale = useSharedValue(MAX_ZOOM);
  const padTop = useSharedValue(insets.top);
  const padBottom = useSharedValue(insets.bottom);
  if (padTop.get() !== insets.top) padTop.set(insets.top);
  if (padBottom.get() !== insets.bottom) padBottom.set(insets.bottom);

  const clampX = (value: number, s: number) => {
    'worklet';
    return clampAxis(value, MAP_SIZE * s, 0, w.get());
  };
  const clampY = (value: number, s: number) => {
    'worklet';
    return clampAxis(value, MAP_SIZE * s, padTop.get(), h.get() - padBottom.get());
  };

  /** Centre la partie visible de l'écran sur (x, y) au zoom demandé. */
  const moveTo = useCallback(
    (x: number, y: number, target: number, animate = true) => {
      const s = Math.min(maxScale.get(), Math.max(minScale.get(), target));
      const centerY = padTop.get() + (h.get() - padTop.get() - padBottom.get()) / 2;
      const nx = clampX(w.get() / 2 - x * s, s);
      const ny = clampY(centerY - y * s, s);
      const timing = { duration: 320 };
      scale.set(animate ? withTiming(s, timing) : s);
      tx.set(animate ? withTiming(nx, timing) : nx);
      ty.set(animate ? withTiming(ny, timing) : ny);
      setCamera({ s, x: nx, y: ny });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [h, maxScale, minScale, padBottom, padTop, scale, tx, ty, w],
  );

  /** Point de la carte au centre de la partie visible. */
  const viewCenter = () => {
    const centerY = padTop.get() + (h.get() - padTop.get() - padBottom.get()) / 2;
    return [(w.get() / 2 - tx.get()) / scale.get(), (centerY - ty.get()) / scale.get()] as const;
  };

  /** Cadrage de départ : le point demandé, sinon la partie utile de la carte, sinon la carte entière. */
  const placeInitial = (width: number, height: number, withFocus: boolean, animate: boolean) => {
    const visibleHeight = Math.max(1, height - padTop.get() - padBottom.get());
    const fitScale = Math.min(width, visibleHeight) / MAP_SIZE;
    if (withFocus && initialFocus) {
      moveTo(initialFocus.x, initialFocus.y, fitScale * (initialFocus.zoom ?? 4), animate);
    } else if (frame) {
      // La partie utile de la carte remplit l'écran visible.
      const s = Math.min(width / (frame.x1 - frame.x0), visibleHeight / (frame.y1 - frame.y0));
      moveTo((frame.x0 + frame.x1) / 2, (frame.y0 + frame.y1) / 2, s, animate);
    } else {
      moveTo(MAP_SIZE / 2, MAP_SIZE / 2, initialCover ? Math.max(width, height) / MAP_SIZE : fitScale, animate);
    }
  };

  // Tant qu'on n'a pas touché la carte, le cadrage de départ suit les commandes posées dessus (mesurées après elle).
  const touched = useRef(false);
  const markTouched = useCallback(() => {
    touched.current = true;
  }, []);

  const setLimits = (width: number, height: number) => {
    const fitScale = Math.min(width, Math.max(1, height - padTop.get() - padBottom.get())) / MAP_SIZE;
    w.set(width);
    h.set(height);
    minScale.set(fitScale);
    maxScale.set(Math.max(fitScale * MAX_ZOOM, 1.5));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === size.w && height === size.h) return;
    const first = size.w === 0;
    setSize({ w: width, h: height });
    setLimits(width, height);
    if (first || !touched.current) {
      placeInitial(width, height, true, false);
    } else {
      const [cx, cy] = viewCenter();
      moveTo(cx, cy, scale.get(), false);
    }
  };

  useEffect(() => {
    if (!size.w || touched.current) return;
    setLimits(size.w, size.h);
    placeInitial(size.w, size.h, true, false);
    // Seul un changement des bandes couvertes doit recadrer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top, insets.bottom]);

  useImperativeHandle(
    ref,
    () => ({
      focus: (x, y, factor = 4) => moveTo(x, y, Math.max(scale.get(), minScale.get() * factor)),
      zoomBy: (factor) => {
        const [cx, cy] = viewCenter();
        moveTo(cx, cy, scale.get() * factor);
      },
      reset: () => placeInitial(w.get(), h.get(), false, true),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minScale, moveTo, scale],
  );

  const tappableRef = useRef<MapPoint[]>(points);
  const handleTap = useCallback(
    (x: number, y: number, radius: number) => {
      onTap(nearestPoint(tappableRef.current, x, y, radius), x, y);
    },
    [onTap],
  );
  const handleLongPress = useCallback((x: number, y: number) => onLongPress?.(x, y), [onLongPress]);

  // Gestes (Gesture Handler 3, sur le fil de l'interface) : pincer et glisser ensemble, toucher deux fois pour
  // zoomer, toucher pour choisir un point, appui long pour poser un repère.
  // Pincer et glisser agissent ensemble, chacun par petits pas depuis l'événement précédent : le pincement zoome
  // autour du point entre les doigts, le glissement (un ou deux doigts) déplace. Ainsi ils s'additionnent au lieu de
  // se disputer la position de la carte. Un nouveau geste arrête l'élan du précédent.
  const stopMotion = () => {
    'worklet';
    scheduleOnRN(markTouched);
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
      tx.set(clampX(e.focalX - (e.focalX - tx.get()) * factor, after));
      ty.set(clampY(e.focalY - (e.focalY - ty.get()) * factor, after));
    },
  });

  const pan = usePanGesture({
    onBegin: () => {
      'worklet';
      stopMotion();
    },
    onUpdate: (e) => {
      'worklet';
      tx.set(clampX(tx.get() + e.changeX, scale.get()));
      ty.set(clampY(ty.get() + e.changeY, scale.get()));
    },
    onDeactivate: (e) => {
      'worklet';
      const content = MAP_SIZE * scale.get();
      const top = padTop.get();
      const bottom = h.get() - padBottom.get();
      if (content > w.get()) tx.set(withDecay({ velocity: e.velocityX, clamp: [w.get() - content, 0] }));
      if (content > bottom - top) ty.set(withDecay({ velocity: e.velocityY, clamp: [bottom - content, top] }));
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
      const centerY = padTop.get() + (h.get() - padTop.get() - padBottom.get()) / 2;
      tx.set(withTiming(clampX(w.get() / 2 - cx * s, s), timing));
      ty.set(withTiming(clampY(centerY - cy * s, s), timing));
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
  // La position côté React suit la carte par paliers (un tiers d'écran, ou un cran de zoom) : assez pour choisir les
  // points à dessiner et les noms à afficher, sans recalculer à chaque image.
  useAnimatedReaction(
    () => {
      const s = scale.get();
      const stepX = Math.max(1, w.get() / 3);
      const stepY = Math.max(1, h.get() / 3);
      return `${Math.round(Math.log(s) * 8)}|${Math.round(tx.get() / stepX)}|${Math.round(ty.get() / stepY)}`;
    },
    (current, previous) => {
      if (current !== previous) scheduleOnRN(setCamera, { s: scale.get(), x: tx.get(), y: ty.get() });
    },
  );

  const zoomRatio = camera.s / fit;
  const rank = visibleRank(camera.s, fit);
  // Points à dessiner : ceux de ce niveau de zoom, à l'écran ou juste autour (la position côté React avance par
  // tiers d'écran : la marge couvre ce pas).
  const drawn = useMemo(() => {
    const marginX = size.w * 0.4;
    const marginY = size.h * 0.4;
    return points.filter((p) => {
      if (p.id === selectedId) return true;
      if (p.minZoom && zoomRatio < p.minZoom) return false;
      const sx = p.x * camera.s + camera.x;
      const sy = p.y * camera.s + camera.y;
      return sx > -marginX && sx < size.w + marginX && sy > -marginY && sy < size.h + marginY;
    });
  }, [camera, points, selectedId, size, zoomRatio]);
  const labels = useMemo(() => placeLabels(drawn, camera.s, rank, selectedId, ICON, LABEL_WIDTH), [drawn, camera.s, rank, selectedId]);
  const ordered = useMemo(
    // Les grands noms dessous, le point choisi au-dessus de tout.
    () => [...drawn].sort((a, b) => Number(a.id === selectedId) - Number(b.id === selectedId) || b.rank - a.rank),
    [drawn, selectedId],
  );
  // Un toucher n'attrape que les points dessinés à ce zoom.
  const tappable = useMemo(() => points.filter((p) => !p.minZoom || zoomRatio >= p.minZoom), [points, zoomRatio]);
  useEffect(() => {
    tappableRef.current = tappable;
  }, [tappable]);

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
            </Animated.View>
          ) : null}
          {size.w > 0 ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              {ordered.map((p) => (
                <Marker key={p.id} point={p} selected={p.id === selectedId} showLabel={labels.has(p.id)} scale={scale} tx={tx} ty={ty} />
              ))}
              {pin ? <Pin x={pin.x} y={pin.y} scale={scale} tx={tx} ty={ty} /> : null}
            </View>
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

interface Follow {
  scale: SharedValue<number>;
  tx: SharedValue<number>;
  ty: SharedValue<number>;
}

/** Style qui garde un point de l'écran collé à une position de la carte (pixels de la carte). */
function useFollow(x: number, y: number, { scale, tx, ty }: Follow) {
  return useAnimatedStyle(() => ({
    transform: [{ translateX: x * scale.get() + tx.get() }, { translateY: y * scale.get() + ty.get() }],
  }));
}

const Marker = memo(function Marker({
  point,
  selected,
  showLabel,
  ...follow
}: {
  point: MapPoint;
  selected: boolean;
  showLabel: boolean;
} & Follow) {
  const style = useFollow(point.x, point.y, follow);
  const big = point.icon === 0 && point.rank === 0;
  const textOnly = point.icon === 0;
  const label = point.label && showLabel ? point.label : null;
  // Les petits noms sans icône n'apparaissent qu'avec le zoom.
  if (textOnly && !showLabel) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, style]}>
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

function Pin({ x, y, ...follow }: { x: number; y: number } & Follow) {
  const style = useFollow(x, y, follow);
  return (
    <Animated.View pointerEvents="none" style={[styles.anchor, style]}>
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
  anchor: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, overflow: 'visible' },
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
