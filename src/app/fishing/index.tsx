/** Module Pêche : heure d'Éorzéa, gros poissons ouverts et bientôt, et les entrées du module. */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FishingIcons, FishRow, statusRank, useCaughtFish, useFishStatuses } from '@/components/fishing';
import { GameWindow, MenuEntry, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Empty, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { fishingData, periodStart, upcomingVoyages, WEATHER_PERIOD } from '@/utils/fishing';
import { formatCountdown, formatEorzeaTime } from '@/utils/timers';

export default function FishingScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const statuses = useFishStatuses(now);
  const { caught } = useCaughtFish();
  const data = fishingData();

  const big = useMemo(() => data.fish.filter((f) => f.big), [data]);
  const sorted = [...big].sort((a, b) => statusRank(statuses.get(a.id)) - statusRank(statuses.get(b.id)));
  const open = sorted.filter((f) => statuses.get(f.id)?.kind === 'open' && !caught?.ids.has(f.id));
  const soon = sorted.filter((f) => statuses.get(f.id)?.kind === 'soon' && !caught?.ids.has(f.id)).slice(0, 6);
  const [voyage] = upcomingVoyages('indigo', now, 1, data.ocean);

  return (
    <Screen>
      <View style={[styles.clock, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
        <MenuIcon id={MenuIcons.calendrier} size={40} />
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            Heure d’Éorzéa
          </ThemedText>
          <ThemedText type="display" style={[styles.time, { color: theme.ornament }]}>
            {formatEorzeaTime(now)}
          </ThemedText>
        </View>
        <View style={styles.side}>
          <ThemedText type="small" themeColor="textSecondary">
            Météo suivante
          </ThemedText>
          <ThemedText type="smallBold">{formatCountdown(periodStart(now) + WEATHER_PERIOD - now)}</ThemedText>
        </View>
      </View>

      <GameWindow
        icon={FishingIcons.fisher}
        title="Gros poissons"
        subtitle={open.length ? `${open.length} ouvert${open.length > 1 ? 's' : ''}` : null}>
        {open.length === 0 ? <Empty>Aucun gros poisson ouvert pour l’instant.</Empty> : null}
        {open.slice(0, 8).map((f, i) => (
          <FishRow key={f.id} fish={f} status={statuses.get(f.id)} now={now} caught={caught?.ids.has(f.id)} first={i === 0} />
        ))}
      </GameWindow>

      {soon.length > 0 ? (
        <GameWindow icon={MenuIcons.calendrier} title="Bientôt">
          {soon.map((f, i) => (
            <FishRow key={f.id} fish={f} status={statuses.get(f.id)} now={now} caught={caught?.ids.has(f.id)} first={i === 0} />
          ))}
        </GameWindow>
      ) : null}

      <MenuEntry icon={FishingIcons.fisher} title="Tous les poissons" onPress={() => router.push('/fishing/list')} />
      <MenuEntry
        icon={MenuIcons.peche}
        title="Carnet de pêche"
        status={caught ? `${caught.ids.size} / ${caught.total}` : null}
        onPress={() => router.push('/fishing/log')}
      />
      <MenuEntry
        icon={FishingIcons.ocean}
        title="Pêche en mer"
        status={voyage.boarding ? 'Embarquement en cours' : `Départ dans ${formatCountdown(voyage.departure - now)}`}
        onPress={() => router.push('/fishing/ocean')}
      />
      <MenuEntry icon={FishingIcons.weather} title="Météo d’Éorzéa" onPress={() => router.push('/fishing/weather')} />
      <ThemedText type="small" themeColor="textSecondary">
        Fenêtres et appâts : FF14 Fish Tracker et Teamcraft (licence MIT). Météo et pêche en mer : données du jeu. Mis à jour le{' '}
        {new Date(data.updatedAt).toLocaleDateString('fr-FR')}.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: 1 },
  time: { fontSize: 28, lineHeight: 34 },
  side: { alignItems: 'flex-end' },
});
