/**
 * Carte interactive : une seule carte pour tout le jeu. On part du monde, on descend dans une région puis une zone
 * (ou une ville, un donjon…), et chaque carte montre ses calques : lieux, éthérites, repères du jeu, aléas, quêtes,
 * points de récolte, coins de pêche et trésors.
 *
 * Paramètres : map (numéro de carte), x et y (point à montrer, en pixels de la carte), t (pour recentrer).
 */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { type ComponentRef, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { questsOnMap } from '@/api/map';
import { WeatherIcon, weatherName } from '@/components/fishing';
import { ChipBar, MapChip, MapColors, PointCard, CardButton, CardText, RoundButton } from '@/components/map/map-overlays';
import { MapViewer, type MapViewerHandle } from '@/components/map/map-viewer';
import { PointDetails } from '@/components/map/point-details';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useMapStore } from '@/store/map-store';
import { fishingData, forecast, periodStart } from '@/utils/fishing';
import {
  breadcrumb,
  canonicalMap,
  dutyName,
  floorsOf,
  formatCoords,
  getMap,
  LAYERS,
  layerCounts,
  mapData,
  mapImageUrl,
  mapPoints,
  nearestPoint,
  toGameCoords,
  WORLD_MAP,
  type MapPoint,
} from '@/utils/map';

type Params = { map?: string; x?: string; y?: string; t?: string };

interface MapView {
  mapId: number;
  focus: { x: number; y: number } | null;
  /** Change à chaque ouverture, pour remettre la visionneuse à zéro. */
  key: string;
}

function viewFromParams(params: Params, fallback: number): MapView {
  const requested = Number(params.map);
  const mapId = Number.isFinite(requested) && getMap(requested) ? canonicalMap(requested) : getMap(fallback) ? fallback : WORLD_MAP;
  const x = Number(params.x);
  const y = Number(params.y);
  const focus = params.x && params.y && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  return {
    mapId,
    focus,
    key: `${mapId}|${params.x ?? ''}|${params.y ?? ''}|${params.t ?? ''}`,
  };
}

export default function MapScreen() {
  const params = useLocalSearchParams<Params>();
  const insets = useSafeAreaInsets();
  const now = useNow(10_000);
  const layers = useMapStore((s) => s.layers);
  const toggleLayer = useMapStore((s) => s.toggleLayer);
  const lastMap = useMapStore((s) => s.lastMap);
  const setLastMap = useMapStore((s) => s.setLastMap);
  const viewer = useRef<MapViewerHandle>(null);
  // Sous iOS 26, la barre de titre est en verre et la carte passe dessous : on décale ce qui est posé en haut.
  const headerHeight = useHeaderHeight();
  const root = useRef<ComponentRef<typeof View>>(null);
  const [underHeader, setUnderHeader] = useState(0);
  const measureHeader = useCallback(() => {
    root.current?.measureInWindow((_x, y) => setUnderHeader(Math.max(0, Math.round(headerHeight - y))));
  }, [headerHeight]);

  // La carte affichée suit les paramètres (ouverture depuis l'atlas, une fiche de poisson…) puis la navigation.
  const paramKey = `${params.map ?? ''}|${params.x ?? ''}|${params.y ?? ''}|${params.t ?? ''}`;
  const [seenParams, setSeenParams] = useState(paramKey);
  const [view, setView] = useState<MapView>(() => viewFromParams(params, lastMap));
  const [selected, setSelected] = useState<MapPoint | null>(null);
  const [pin, setPin] = useState<{ x: number; y: number } | null>(null);
  if (seenParams !== paramKey) {
    setSeenParams(paramKey);
    setView(viewFromParams(params, lastMap));
    setSelected(null);
    setPin(null);
  }

  const mapId = view.mapId;
  const map = getMap(mapId)!;
  const trail = useMemo(() => breadcrumb(mapId), [mapId]);
  const floors = useMemo(() => floorsOf(mapId), [mapId]);
  const counts = useMemo(() => layerCounts(mapId), [mapId]);
  const overworld = map.k === 'zone' || map.k === 'city' || map.k === 'housing';

  const quests = useQuery({
    queryKey: ['map', 'quests', mapId],
    queryFn: () => questsOnMap(mapId),
    enabled: layers.includes('quests') && overworld,
    staleTime: 24 * 3600_000,
  });

  const points = useMemo(() => {
    const out = mapPoints(mapId, layers);
    if (layers.includes('quests') && quests.data) out.push(...quests.data);
    return out;
  }, [layers, mapId, quests.data]);

  // Point à montrer à l'ouverture : on le sélectionne s'il correspond à un point de la carte.
  const focusPoint = useMemo(() => {
    if (!view.focus) return null;
    return nearestPoint(points, view.focus.x, view.focus.y, 6);
  }, [points, view.focus]);
  const shownSelected = selected ?? focusPoint;

  const openMap = useCallback(
    (id: number) => {
      const target = canonicalMap(id);
      if (!getMap(target)) return;
      setView({ mapId: target, focus: null, key: `${target}|${Date.now()}` });
      setSelected(null);
      setPin(null);
      setLastMap(target);
    },
    [setLastMap],
  );

  const onTap = useCallback(
    (point: MapPoint | null) => {
      setPin(null);
      // Sur le monde et les régions, toucher un nom ouvre directement la carte.
      if (point?.data.type === 'marker' && point.data.kind === 2 && (map.k === 'world' || map.k === 'region')) {
        openMap(point.data.link);
        return;
      }
      setSelected(point);
    },
    [map.k, openMap],
  );

  const onLongPress = useCallback((x: number, y: number) => {
    setSelected(null);
    setPin({ x, y });
  }, []);

  const weather = useMemo(() => {
    const zone = overworld ? fishingData().zones[String(map.t)] : undefined;
    return zone ? forecast(zone.w, periodStart(now), 2) : null;
  }, [map.t, now, overworld]);

  const title = map.k === 'instance' ? dutyName(map) : map.n;
  const subtitle =
    map.k === 'instance' ? [contentName(map.c), map.l ? `niv. ${map.l}` : null, map.il ? `iNiv. ${map.il}` : null].filter(Boolean).join(' · ') : null;

  return (
    <View ref={root} style={styles.screen} onLayout={measureHeader}>
      <Stack.Screen
        options={{
          title,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel="Atlas et recherche" hitSlop={10} onPress={() => router.push('/map/browse')}>
              <Text style={styles.headerButton}>Atlas</Text>
            </Pressable>
          ),
        }}
      />
      <MapViewer
        key={view.key}
        ref={viewer}
        imageUrl={mapImageUrl(map)}
        points={points}
        selectedId={shownSelected?.id ?? null}
        pin={pin}
        onTap={onTap}
        onLongPress={onLongPress}
        initialFocus={view.focus ? { ...view.focus, zoom: 4 } : null}
        initialCover={map.k === 'world'}
      />

      {/* Haut : fil d'Ariane, étages, météo. */}
      <View style={[styles.top, { top: underHeader + Spacing.two }]} pointerEvents="box-none">
        <ChipBar>
          {trail.map(({ id, map: m }, i) => (
            <MapChip
              key={id}
              label={`${i > 0 ? '› ' : ''}${m.k === 'instance' ? dutyName(m) : m.n}`}
              selected={id === mapId}
              onPress={() => (id === mapId ? viewer.current?.reset() : openMap(id))}
            />
          ))}
        </ChipBar>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {floors.length > 1 ? (
          <ChipBar>
            {floors.map((id, i) => {
              const floor = getMap(id)!;
              return (
                <MapChip
                  key={id}
                  label={floor.s && floor.s !== floor.n ? floor.s : `Partie ${i + 1}`}
                  selected={id === mapId}
                  onPress={() => openMap(id)}
                />
              );
            })}
          </ChipBar>
        ) : null}
        {weather ? (
          <View style={styles.weather}>
            <WeatherIcon id={weather[0].weather} size={22} />
            <Text style={styles.weatherText}>
              {weatherName(weather[0].weather)}
              <Text style={styles.weatherNext}> puis {weatherName(weather[1].weather)}</Text>
            </Text>
          </View>
        ) : null}
      </View>

      {/* Zoom. */}
      <View style={[styles.zoom, { top: underHeader + 150 }]} pointerEvents="box-none">
        <RoundButton label="+" accessibilityLabel="Zoomer" onPress={() => viewer.current?.zoomBy(1.8)} />
        <RoundButton label="−" accessibilityLabel="Dézoomer" onPress={() => viewer.current?.zoomBy(1 / 1.8)} />
        <RoundButton label="⤢" accessibilityLabel="Carte entière" onPress={() => viewer.current?.reset()} />
      </View>

      {/* Bas : fiche du point, calques. */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Spacing.two }]} pointerEvents="box-none">
        {shownSelected ? (
          <View style={styles.cardWrap}>
            <PointDetails map={map} point={shownSelected} now={now} onOpenMap={openMap} onClose={() => setSelected(null)} />
          </View>
        ) : pin ? (
          <View style={styles.cardWrap}>
            <PointCard icon={60442} title="Repère" subtitle={formatCoords(toGameCoords(map, pin.x, pin.y))} onClose={() => setPin(null)}>
              <CardText muted>Les coordonnées s’affichent comme dans le jeu (commande /coord ou drapeau sur la carte).</CardText>
              <CardButton label="Centrer ici" onPress={() => viewer.current?.focus(pin.x, pin.y, 4)} />
            </PointCard>
          </View>
        ) : null}
        <ChipBar>
          {LAYERS.map((layer) => {
            const on = layers.includes(layer.key);
            const empty = layer.key === 'quests' ? !overworld : !counts[layer.key];
            const loading = layer.key === 'quests' && on && quests.isFetching;
            return (
              <MapChip
                key={layer.key}
                icon={layer.icon}
                label={loading ? `${layer.label}…` : layer.label}
                selected={on}
                dimmed={empty}
                accessibilityLabel={`Calque ${layer.label}${on ? ', affiché' : ', masqué'}`}
                onPress={() => toggleLayer(layer.key)}
              />
            );
          })}
        </ChipBar>
      </View>
    </View>
  );
}

function contentName(type: number | undefined): string | null {
  if (type === undefined) return null;
  return mapData().contentTypes[String(type)]?.n ?? null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#1A1712' },
  headerButton: { color: MapColors.gold, fontSize: 16, fontWeight: '700' },
  top: {
    position: 'absolute',
    top: Spacing.two,
    left: 0,
    right: 0,
    gap: Spacing.one,
  },
  subtitle: {
    color: MapColors.text,
    fontSize: 13,
    marginHorizontal: Spacing.two,
    alignSelf: 'flex-start',
    backgroundColor: MapColors.panelSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginHorizontal: Spacing.two,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: MapColors.panelSoft,
    borderWidth: 1,
    borderColor: MapColors.border,
  },
  weatherText: { color: MapColors.text, fontSize: 13, fontWeight: '600' },
  weatherNext: { color: MapColors.muted, fontWeight: '400' },
  zoom: {
    position: 'absolute',
    right: Spacing.two,
    top: 150,
    gap: Spacing.two,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    gap: Spacing.two,
  },
  cardWrap: { marginHorizontal: Spacing.two },
});
