/**
 * Partie « Pêche » de la fiche d'un objet : où (zone, coin, coordonnées), quand (heures d'Éorzéa, météo), avec quoi
 * (appât, mooching, ferrage, touche), intuition et légendes, prochaines fenêtres et météo de la zone.
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FishingIcons, itemIcon, itemName, localTime, statusLabel, useCaughtFish, WeatherIcon, weatherName, zoneOf } from '@/components/fishing';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Empty, GameIcon } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { fishingData, fishStatus, forecast, nextWindows } from '@/utils/fishing';
import { itemByName } from '@/utils/items-index';
import { findFishingSpot } from '@/utils/map';
import { formatCountdown } from '@/utils/timers';

const HOOKSETS: Record<string, string> = { Precision: 'Ferrage précis', Powerful: 'Ferrage puissant' };
const TUGS: Record<string, string> = { light: 'Touche légère (!)', medium: 'Touche moyenne (!!)', heavy: 'Touche forte (!!!)' };
const GIGS: Record<string, string> = { Small: 'Petit harpon', Normal: 'Harpon normal', Large: 'Grand harpon' };
const LURES: Record<string, string> = { AmbitiousLure: 'Leurre ambitieux', ModestLure: 'Leurre modeste' };

/** Le poisson de cet objet, s'il est suivi par les données de pêche. */
export function isFish(id: number): boolean {
  return fishingData().fish.some((f) => f.id === id);
}

export function FishSection({ id }: { id: number }) {
  const theme = useTheme();
  const now = useNow(1000);
  const fish = fishingData().fish.find((f) => f.id === id);
  const { caught } = useCaughtFish();
  const minute = Math.floor(now / 60_000) * 60_000;
  const { spot, zone } = fish ? zoneOf(fish) : { spot: undefined, zone: undefined };
  const windows = useMemo(() => (fish ? nextWindows(fish, zone?.w, minute, 5) : []), [fish, zone, minute]);
  const status = fish ? fishStatus(fish, zone?.w, now) : undefined;

  if (!fish) return null;
  const label = statusLabel(status, now);
  const allDay = fish.h[0] === 0 && fish.h[1] === 24;
  const data = fishingData();
  const mapSpot = typeof fish.s === 'number' ? findFishingSpot(fish.s) : null;

  return (
    <>
      <GameWindow
        icon={FishingIcons.fisher}
        title="Lieu"
        subtitle={`${zone?.n ?? '—'} · ${spot?.n ?? ''}${spot?.c ? ` (X ${spot.c[0]} · Y ${spot.c[1]})` : ''}`}>
        <View style={styles.badges}>
          <Badge label={label.text} tone={label.tone} />
          {caught ? (
            <Badge label={caught.ids.has(fish.id) ? 'Attrapé' : 'Pas encore attrapé'} tone={caught.ids.has(fish.id) ? 'up' : 'neutral'} />
          ) : null}
          {fish.big ? <Badge label="Gros poisson" tone="accent" /> : null}
          {fish.g ? <Badge label={GIGS[fish.g] ?? 'Harpon'} /> : null}
          {fish.co ? <Badge label="Collectionnable" /> : null}
          {fish.pt ? <Badge label={`Patch ${fish.pt}`} /> : null}
        </View>
        {mapSpot ? (
          <Button
            label="Voir sur la carte"
            variant="secondary"
            onPress={() => router.push({ pathname: '/map', params: { map: String(mapSpot.mapId), x: String(mapSpot.x), y: String(mapSpot.y) } })}
          />
        ) : null}
      </GameWindow>

      <GameWindow icon={MenuIcons.calendrier} title="Quand">
        <Line label="Heures d’Éorzéa" value={allDay ? 'Toute la journée' : `${fish.h[0]} h – ${fish.h[1]} h`} />
        {fish.pw?.length ? (
          <View style={styles.line}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              Météo juste avant
            </ThemedText>
            <Weathers ids={fish.pw} />
          </View>
        ) : null}
        <View style={styles.line}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Météo
          </ThemedText>
          {fish.w?.length ? <Weathers ids={fish.w} /> : <ThemedText type="smallBold">Toutes</ThemedText>}
        </View>
        {status?.kind !== 'always' ? (
          <ThemedText type="smallBold" style={{ color: theme.ornament, marginTop: Spacing.one }}>
            Prochaines fenêtres
          </ThemedText>
        ) : null}
        {status?.kind === 'always' ? (
          <Empty>{fish.p?.length ? 'Toujours disponible, une fois l’intuition obtenue.' : 'Toujours disponible.'}</Empty>
        ) : windows.length === 0 ? (
          <Empty>Aucune fenêtre trouvée dans les mois à venir.</Empty>
        ) : null}
        {status?.kind !== 'always'
          ? windows.map((w, i) => (
              <View key={w.start} style={[styles.window, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {w.start <= now ? 'Maintenant' : localTime(w.start, now)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {Math.round((w.end - w.start) / 60_000)} min
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: w.start <= now ? theme.success : theme.ornament, minWidth: 80, textAlign: 'right' }}>
                  {w.start <= now ? `encore ${formatCountdown(w.end - now)}` : formatCountdown(w.start - now)}
                </ThemedText>
              </View>
            ))
          : null}
      </GameWindow>

      {fish.b?.length || fish.hk || fish.tg || fish.lu ? (
        <GameWindow icon={FishingIcons.fisher} title="Comment">
          {fish.b?.length ? (
            <View style={styles.chain}>
              {[...fish.b, fish.id].map((itemId, i) => (
                <View key={`${itemId}-${i}`} style={styles.chainStep}>
                  {i > 0 ? (
                    <ThemedText type="smallBold" style={{ color: theme.ornament }}>
                      ▸
                    </ThemedText>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={itemName(itemId)}
                    onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(itemId) } })}
                    style={styles.chainItem}>
                    <GameIcon uri={itemIcon(itemId)} size={36} />
                    <ThemedText type="small" numberOfLines={2} style={styles.chainName}>
                      {itemName(itemId)}
                    </ThemedText>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          {fish.hk ? <Line label="Ferrage" value={HOOKSETS[fish.hk] ?? fish.hk} /> : null}
          {fish.tg ? <Line label="Touche" value={TUGS[fish.tg] ?? fish.tg} /> : null}
          {fish.lu ? <Line label="Leurre" value={LURES[fish.lu] ?? fish.lu} /> : null}
          {fish.fe ? <Line label="Œil du pêcheur" value="Utile hors fenêtre" /> : null}
          {fish.sn ? <Line label="Accroche" value="Nécessaire" /> : null}
        </GameWindow>
      ) : null}

      {fish.p?.length ? (
        <GameWindow
          icon={FishingIcons.fisher}
          title="Intuition"
          subtitle={`Attrape d’abord ceux-ci${fish.il ? ` : intuition pendant ${Math.round(fish.il / 60)} min` : ''}`}>
          {fish.p.map(([pid, count]) => (
            <Pressable
              key={pid}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(pid) } })}
              style={styles.predator}>
              <GameIcon uri={itemIcon(pid)} size={32} />
              <ThemedText type="small" style={styles.flex}>
                {itemName(pid)}
              </ThemedText>
              <ThemedText type="smallBold">×{count}</ThemedText>
            </Pressable>
          ))}
        </GameWindow>
      ) : null}

      {fish.fl ? <FolkloreBook name={data.folklore[String(fish.fl)]} /> : null}

      {zone ? (
        <GameWindow icon={FishingIcons.weather} title={`Météo · ${zone.n}`}>
          <View style={styles.forecast}>
            {forecast(zone.w, now, 6).map((p) => (
              <View key={p.start} style={styles.period}>
                <WeatherIcon id={p.weather} size={32} />
                <ThemedText type="small" numberOfLines={1} style={styles.tiny}>
                  {weatherName(p.weather)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                  {p.start <= now ? 'Maintenant' : localTime(p.start, now)}
                </ThemedText>
              </View>
            ))}
          </View>
        </GameWindow>
      ) : null}
      <View style={styles.footer}>
        <MenuIcon id={FishingIcons.fisher} size={18} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
          Conditions : FF14 Fish Tracker (licence MIT).
        </ThemedText>
      </View>
    </>
  );
}

function Weathers({ ids }: { ids: number[] }) {
  return (
    <View style={styles.weathers}>
      {ids.map((w) => (
        <View key={w} style={styles.weather}>
          <WeatherIcon id={w} size={22} />
          <ThemedText type="small">{weatherName(w)}</ThemedText>
        </View>
      ))}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

/** Livre de légendes à lire avant que ce poisson morde, avec un lien vers sa fiche (où l'obtenir). */
function FolkloreBook({ name }: { name?: string }) {
  const book = name ? itemByName(name) : null;
  return (
    <GameWindow icon={MenuIcons.objetsPrecieux} title="Livre de légendes requis" subtitle={name ?? null}>
      <ThemedText type="small" themeColor="textSecondary">
        Ce poisson ne mord qu’une fois ce livre lu. Il s’échange contre des assignats de récolteur, chez l’échangeur d’assignats des grandes cités ;
        utilise-le ensuite depuis ton inventaire. Il débloque aussi les autres poissons légendaires de la région.
      </ThemedText>
      {book ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(book.id) } })}
          style={styles.predator}>
          <GameIcon uri={book.icon} size={32} />
          <ThemedText type="small" style={styles.flex}>
            Fiche du livre
          </ThemedText>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </Pressable>
      ) : null}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  weathers: { alignItems: 'flex-end', gap: 2 },
  weather: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chain: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  chainStep: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  chainItem: { alignItems: 'center', width: 72, gap: 2 },
  chainName: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  predator: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 4 },
  window: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  forecast: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  period: { flexBasis: '33%', alignItems: 'center', gap: 2 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
