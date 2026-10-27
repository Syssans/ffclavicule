/** Éléments de la pêche : état d'un poisson (ouvert, bientôt), ligne de poisson, icône de météo, données partagées. */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { useMainCharacter } from '@/components/home';
import { MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, GameIcon } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { fishingData, fishStatus, type FishEntry, type FishStatus } from '@/utils/fishing';
import { formatCountdown } from '@/utils/timers';

export const FishingIcons = { fisher: 62118, ocean: 61756, weather: 60201, log: 24 } as const;

export function itemIcon(id: number): string | null {
  const icon = fishingData().items[String(id)]?.i;
  return icon ? gameIconUrl(icon) : null;
}

export function itemName(id: number): string {
  return fishingData().items[String(id)]?.n ?? `Objet ${id}`;
}

export function zoneOf(fish: FishEntry) {
  const d = fishingData();
  const spot = d.spots[String(fish.s)];
  const zone = spot ? d.zones[String(spot.t)] : undefined;
  return { spot, zone };
}

/** État de chaque poisson, recalculé une fois par minute. */
export function useFishStatuses(now: number): Map<number, FishStatus> {
  const minute = Math.floor(now / 60_000) * 60_000;
  return useMemo(() => {
    const out = new Map<number, FishStatus>();
    for (const f of fishingData().fish) out.set(f.id, fishStatus(f, zoneOf(f).zone?.w, minute));
    return out;
  }, [minute]);
}

/** Poissons attrapés par le personnage principal (carnet lu par le plugin), ou null sans plugin. */
export function useCaughtFish() {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  const caught = useMemo(() => {
    const cols = query.data?.collections;
    if (!cols) return null;
    const fish = cols.filter((c) => c.key === 'fish' || c.key === 'spearfish');
    if (fish.length === 0) return null;
    return { ids: new Set(fish.flatMap((c) => c.owned.map((o) => o.id))), total: fish.reduce((s, c) => s + c.total, 0) };
  }, [query.data]);
  return { caught, linked: Boolean(link), loading: Boolean(link) && query.isPending, name: main?.name ?? null };
}

export function statusLabel(status: FishStatus | undefined, now: number): { text: string; tone: 'up' | 'accent' | 'neutral' } {
  if (!status || status.kind === 'unknown') return { text: '?', tone: 'neutral' };
  if (status.kind === 'always') return { text: 'Toujours', tone: 'neutral' };
  if (status.kind === 'open') return { text: `Ouvert · ${formatCountdown(status.until - now)}`, tone: 'up' };
  return { text: `Dans ${formatCountdown(status.at - now)}`, tone: 'accent' };
}

/** Rang de tri : ouverts d'abord (ceux qui ferment le plus tôt), puis les plus proches, puis les toujours ouverts. */
export function statusRank(status: FishStatus | undefined): number {
  if (!status) return Number.MAX_SAFE_INTEGER;
  if (status.kind === 'open') return status.until - 1e15;
  if (status.kind === 'soon') return status.at;
  if (status.kind === 'always') return 1e15;
  return Number.MAX_SAFE_INTEGER;
}

export function FishRow({
  fish,
  status,
  now,
  caught,
  first,
}: {
  fish: FishEntry;
  status?: FishStatus;
  now: number;
  caught?: boolean | null;
  first?: boolean;
}) {
  const theme = useTheme();
  const { spot, zone } = zoneOf(fish);
  const label = statusLabel(status, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${itemName(fish.id)}, ${zone?.n ?? ''}, ${label.text}`}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(fish.id) } })}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={itemIcon(fish.id)} size={40} dimmed={caught === true} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1} style={fish.big ? { color: theme.ornament, fontWeight: '700' } : undefined}>
          {itemName(fish.id)}
          {caught ? '  ✓' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
          {zone?.n ?? '—'} · {spot?.n ?? ''}
        </ThemedText>
        {fish.w?.length ? (
          <View style={styles.weathers}>
            {fish.pw?.length ? (
              <>
                {fish.pw.map((w) => (
                  <WeatherIcon key={`p${w}`} id={w} size={16} />
                ))}
                <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                  ▸
                </ThemedText>
              </>
            ) : null}
            {fish.w.map((w) => (
              <WeatherIcon key={w} id={w} size={16} />
            ))}
            {fish.h[0] !== 0 || fish.h[1] !== 24 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                {` ${fish.h[0]} h – ${fish.h[1]} h`}
              </ThemedText>
            ) : null}
          </View>
        ) : fish.h[0] !== 0 || fish.h[1] !== 24 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
            {fish.h[0]} h – {fish.h[1]} h (Éorzéa)
          </ThemedText>
        ) : null}
      </View>
      <Badge label={label.text} tone={label.tone} />
    </Pressable>
  );
}

export function WeatherIcon({ id, size = 24 }: { id: number; size?: number }) {
  const w = fishingData().weathers[String(id)];
  return w ? <MenuIcon id={w.i} size={size} /> : null;
}

export function weatherName(id: number): string {
  return fishingData().weathers[String(id)]?.n ?? '—';
}

/** Heure locale lisible : « 14:05 », « demain 02:10 », « mer. 18:40 ». */
export function localTime(ms: number, now: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const day = new Date(now);
  if (d.toDateString() === day.toDateString()) return time;
  const tomorrow = new Date(now + 86_400_000);
  if (d.toDateString() === tomorrow.toDateString()) return `demain ${time}`;
  return `${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  weathers: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
});
