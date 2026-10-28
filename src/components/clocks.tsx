/** Heure d'Éorzéa (avec les heures locale et du serveur) et tableau des réinitialisations du jeu. */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, ProgressBar } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { cycleProgress, formatCountdown, formatEorzeaTime, upcomingResets } from '@/utils/timers';

const clock = (at: number, utc = false) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(utc ? { timeZone: 'UTC' } : {}) });

/** Heure d'Éorzéa en grand, heures locale et du serveur (les réinitialisations suivent l'heure UTC). */
export function Clocks({ now }: { now: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.clock, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      <MenuIcon id={MenuIcons.calendrier} size={44} />
      <View style={styles.flex}>
        <ThemedText type="small" themeColor="textSecondary">
          Heure d’Éorzéa
        </ThemedText>
        <ThemedText type="display" style={[styles.clockTime, { color: theme.ornament }]}>
          {formatEorzeaTime(now)}
        </ThemedText>
      </View>
      <View style={styles.side}>
        <ThemedText type="small" themeColor="textSecondary">
          Locale <ThemedText type="smallBold">{clock(now)}</ThemedText>
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Serveur <ThemedText type="smallBold">{clock(now, true)}</ThemedText>
        </ThemedText>
      </View>
    </View>
  );
}

/** Réinitialisations et rendez-vous du jeu : icône, compte à rebours et avancée du cycle. */
export function ResetBoard({ now }: { now: number }) {
  const theme = useTheme();
  const region = useAppStore((s) => s.region);
  return (
    <GameWindow icon={GameIcons.calendar} title="Réinitialisations" subtitle="À l’heure du serveur">
      {upcomingResets(now, region).map((r, i) => (
        <View
          key={r.key}
          style={[styles.reset, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          accessible
          accessibilityLabel={`${r.label} : ${r.live ? `${r.live}, encore ${formatCountdown(r.at - now)}` : `dans ${formatCountdown(r.at - now)}`}`}>
          <MenuIcon id={r.icon} size={40} />
          <View style={styles.flex}>
            <View style={styles.resetHead}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                {r.label}
              </ThemedText>
              <ThemedText type="smallBold" style={[styles.countdown, { color: r.live ? theme.accent : theme.ornament }]}>
                {formatCountdown(r.at - now)}
              </ThemedText>
            </View>
            <ThemedText type="small" numberOfLines={1} style={[styles.resetDetail, { color: r.live ? theme.accent : theme.textSecondary }]}>
              {r.live ?? r.detail}
            </ThemedText>
            <ProgressBar value={cycleProgress(r, now)} />
          </View>
        </View>
      ))}
      <Button label="Me prévenir" variant="secondary" onPress={() => router.push({ pathname: '/notifications', params: { tab: 'jeu' } })} />
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: 1 },
  clockTime: { fontSize: 30, lineHeight: 36 },
  side: { alignItems: 'flex-end', gap: Spacing.half },
  reset: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  resetHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  resetDetail: { fontSize: 12, lineHeight: 16, marginBottom: 4 },
  countdown: { fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
});
