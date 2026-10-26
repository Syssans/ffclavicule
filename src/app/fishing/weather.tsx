/** Météo d'Éorzéa : la météo actuelle de chaque zone et ses prochaines périodes, calculées comme le jeu. */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { FishingIcons, localTime, WeatherIcon, weatherName } from '@/components/fishing';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { fishingData, forecast, periodStart, WEATHER_PERIOD } from '@/utils/fishing';
import { fold } from '@/utils/inventory';
import { formatCountdown } from '@/utils/timers';

export default function WeatherScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const [text, setText] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const period = periodStart(now);

  const regions = useMemo(() => {
    const words = fold(text.trim()).split(/\s+/).filter(Boolean);
    const groups = new Map<string, { id: string; name: string; rates: [number, number][] }[]>();
    // Une zone peut avoir plusieurs territoires (mêmes noms) : on n'en garde qu'un par nom.
    const seen = new Set<string>();
    for (const [id, z] of Object.entries(fishingData().zones)) {
      if (seen.has(z.n)) continue;
      seen.add(z.n);
      if (words.length && !words.every((w) => fold(`${z.n} ${z.r}`).includes(w))) continue;
      const list = groups.get(z.r) ?? [];
      list.push({ id, name: z.n, rates: z.w });
      groups.set(z.r, list);
    }
    return [...groups.entries()].map(([region, zones]) => ({ region, zones: zones.sort((a, b) => a.name.localeCompare(b.name, 'fr')) }));
  }, [text]);

  return (
    <Screen>
      <ThemedText type="small" themeColor="textSecondary">
        La météo change toutes les 8 heures d’Éorzéa (23 min 20 s). Prochain changement dans {formatCountdown(period + WEATHER_PERIOD - now)}. Touche
        une zone pour ses prochaines périodes.
      </ThemedText>
      <Input value={text} onChangeText={setText} placeholder="Chercher une zone" clearButtonMode="while-editing" accessibilityLabel="Chercher une zone" />
      {regions.map(({ region, zones }) => (
        <GameWindow key={region} icon={FishingIcons.weather} title={region || 'Autres'}>
          {zones.map((z, i) => {
            const periods = forecast(z.rates, period, open === z.id ? 9 : 3);
            return (
              <Pressable
                key={z.id}
                accessibilityRole="button"
                accessibilityLabel={`${z.name}, ${weatherName(periods[0].weather)}`}
                onPress={() => setOpen(open === z.id ? null : z.id)}
                style={[styles.zone, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <View style={styles.zoneHead}>
                  <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                    {z.name}
                  </ThemedText>
                  {periods.slice(0, 3).map((p, k) => (
                    <View key={p.start} style={[styles.mini, k === 0 && { backgroundColor: theme.backgroundSelected }]}>
                      <WeatherIcon id={p.weather} size={26} />
                    </View>
                  ))}
                </View>
                {open === z.id ? (
                  <View style={styles.periods}>
                    {periods.map((p) => (
                      <View key={p.start} style={styles.period}>
                        <WeatherIcon id={p.weather} size={30} />
                        <ThemedText type="small" numberOfLines={1} style={styles.tiny}>
                          {weatherName(p.weather)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                          {p.start <= now ? 'Maintenant' : localTime(p.start, now)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </GameWindow>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
  zone: { paddingVertical: Spacing.two, gap: Spacing.two },
  zoneHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  mini: { borderRadius: 8, padding: 2 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  period: { flexBasis: '33%', alignItems: 'center', gap: 2 },
});
