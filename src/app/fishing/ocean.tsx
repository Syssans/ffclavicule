/**
 * Pêche en mer : prochains départs de Limsa Lominsa et de Kugane, escales avec le moment de la journée, poissons du
 * coin et du courant spectral, et les poissons bleus qui mordent pendant l'escale.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FishingIcons, itemIcon, itemName, localTime } from '@/components/fishing';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, GameIcon, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { fishingData, stopFish, TIME_OF_DAY, upcomingVoyages, type OceanLine, type OceanStop } from '@/utils/fishing';
import { formatCountdown } from '@/utils/timers';

const TIME_SHORT: Record<number, string> = { 1: 'jour', 2: 'crépuscule', 3: 'nuit' };

export default function OceanScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const [line, setLine] = useState<OceanLine>('indigo');
  const [selected, setSelected] = useState(0);
  const data = fishingData().ocean;
  const voyages = upcomingVoyages(line, now, 8, data);
  const voyage = voyages[Math.min(selected, voyages.length - 1)];
  const route = data.routes[String(voyage.route)];

  return (
    <Screen>
      <Segmented
        options={[
          { value: 'indigo', label: 'Limsa Lominsa' },
          { value: 'ruby', label: 'Kugane' },
        ]}
        value={line}
        onChange={(l) => {
          setLine(l);
          setSelected(0);
        }}
      />
      <GameWindow icon={FishingIcons.ocean} title="Départs" subtitle="Toutes les 2 heures · inscriptions pendant 15 minutes">
        {voyages.map((v, i) => {
          const r = data.routes[String(v.route)];
          const on = i === selected;
          return (
            <Pressable
              key={v.departure}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => setSelected(i)}
              style={[styles.voyage, { borderColor: on ? theme.accent : 'transparent', backgroundColor: on ? theme.backgroundSelected : 'transparent' }]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {r?.n ?? `Itinéraire ${v.route}`}
                  {r ? ` · arrivée de ${TIME_SHORT[r.s[r.s.length - 1].t]}` : ''}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.tiny}>
                  {r?.s.map((s) => `${s.p} (${TIME_SHORT[s.t]})`).join(' ▸ ')}
                </ThemedText>
              </View>
              <View style={styles.when}>
                <ThemedText type="smallBold">{localTime(v.departure, now)}</ThemedText>
                {v.boarding ? (
                  <Badge label={`Embarquement · ${formatCountdown(v.departure + 15 * 60_000 - now)}`} tone="up" />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                    dans {formatCountdown(v.departure - now)}
                  </ThemedText>
                )}
              </View>
            </Pressable>
          );
        })}
      </GameWindow>

      {route
        ? route.s.map((stop, i) => <StopWindow key={`${voyage.departure}-${i}`} stop={stop} index={i + 1} />)
        : null}
      <ThemedText type="small" themeColor="textSecondary">
        Itinéraires : données du jeu. Moments de pêche des poissons de mer : Teamcraft (licence MIT).
      </ThemedText>
    </Screen>
  );
}

function StopWindow({ stop, index }: { stop: OceanStop; index: number }) {
  const theme = useTheme();
  const data = fishingData().ocean;
  const fish = stopFish(stop, data);
  // Ce qui vaut le détour à cette escale : les poissons bleus, et ceux qui ne mordent qu'à ce moment de la journée.
  const targets = fish.filter((f) => f.active && (f.blue || f.time !== 0));
  const regular = fish.filter((f) => !f.spectral);
  const spectral = fish.filter((f) => f.spectral);
  return (
    <GameWindow icon={FishingIcons.ocean} title={`${index}. ${stop.p}`} subtitle={`Escale de ${TIME_SHORT[stop.t]}`}>
      {targets.length > 0 ? (
        <View style={[styles.targets, { borderColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            À viser pendant cette escale
          </ThemedText>
          {targets.map((f, i) => (
            <FishLine key={`t${f.spectral ? 's' : 'r'}${f.id}-${i}`} fish={f} />
          ))}
        </View>
      ) : null}
      <ThemedText type="smallBold" themeColor="ornament">
        Courant spectral
      </ThemedText>
      {spectral.map((f, i) => (
        <FishLine key={`s${f.id}-${i}`} fish={f} />
      ))}
      <ThemedText type="smallBold" themeColor="ornament">
        Hors courant
      </ThemedText>
      {regular.map((f, i) => (
        <FishLine key={`r${f.id}-${i}`} fish={f} />
      ))}
    </GameWindow>
  );
}

function FishLine({ fish }: { fish: ReturnType<typeof stopFish>[number] }) {
  const theme = useTheme();
  const bait = fish.info.b;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(fish.id) } })}
      style={[styles.fish, !fish.active && { opacity: 0.45 }]}>
      <GameIcon uri={itemIcon(fish.id)} size={32} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1} style={fish.blue ? { color: '#4F8BD6', fontWeight: '700' } : undefined}>
          {itemName(fish.id)}
          {fish.stars ? `  ${'★'.repeat(fish.stars)}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
          {fish.time ? `${TIME_OF_DAY[fish.time]} seulement` : 'À tout moment'}
          {bait ? ` · appât : ${itemName(bait)}` : ''}
          {fish.info.p?.length ? ` · intuition : ${fish.info.p.map(([id, n]) => `${n}× ${itemName(id)}`).join(', ')}` : ''}
        </ThemedText>
      </View>
      {fish.blue ? <Badge label="Bleu" tone="accent" /> : null}
      {!fish.active ? (
        <ThemedText type="small" style={[styles.tiny, { color: theme.textSecondary }]}>
          pas ce moment
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  voyage: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 10, borderWidth: 1 },
  when: { alignItems: 'flex-end', gap: 2 },
  targets: { borderWidth: 1, borderRadius: 10, padding: Spacing.two, gap: Spacing.one },
  fish: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 4 },
});
