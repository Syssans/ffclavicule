/** Heure d'Éorzéa (avec les heures locale et du serveur) et tableau des réinitialisations du jeu. */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatCountdown, formatEorzeaTime, upcomingResets } from '@/utils/timers';

const clock = (at: number, utc = false) =>
  new Date(at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', ...(utc ? { timeZone: 'UTC' } : {}) });

/** Bandeau de nuit : l'heure d'Éorzéa au centre, l'heure locale et celle du serveur de part et d'autre. */
export function Clocks({ now }: { now: number }) {
  return (
    <LinearGradient colors={['#222B47', '#0B0F1C']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.clock}>
      <ClockSide label="Locale" time={clock(now)} />
      <View style={styles.center} accessible accessibilityLabel={`Heure d’Éorzéa ${formatEorzeaTime(now)}`}>
        <ThemedText type="small" style={styles.eyebrow}>
          ÉORZÉA
        </ThemedText>
        <ThemedText type="display" style={styles.clockTime}>
          {formatEorzeaTime(now)}
        </ThemedText>
      </View>
      <ClockSide label="Serveur" time={clock(now, true)} />
    </LinearGradient>
  );
}

function ClockSide({ label, time }: { label: string; time: string }) {
  return (
    <View style={styles.side} accessible accessibilityLabel={`Heure ${label.toLowerCase()} ${time}`}>
      <ThemedText type="small" style={styles.sideLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.sideTime}>
        {time}
      </ThemedText>
    </View>
  );
}

/** Réinitialisations et rendez-vous du jeu : icône, compte à rebours et avancée du cycle. */
export function ResetBoard({ now }: { now: number }) {
  const theme = useTheme();
  const region = useAppStore((s) => s.region);
  return (
    <GameWindow icon={GameIcons.calendar} title="Réinitialisations">
      {upcomingResets(now, region).map((r, i) => (
        <View
          key={r.key}
          style={[styles.reset, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          accessible
          accessibilityLabel={`${r.label} : ${r.live ? `${r.live}, encore ${formatCountdown(r.at - now)}` : `dans ${formatCountdown(r.at - now)}`}`}>
          <MenuIcon id={r.icon} size={32} />
          <View style={styles.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {r.label}
            </ThemedText>
            {r.live ? (
              <ThemedText type="small" numberOfLines={1} style={[styles.live, { color: theme.accent }]}>
                {r.live}
              </ThemedText>
            ) : null}
          </View>
          <ThemedText type="smallBold" style={[styles.countdown, { color: r.live ? theme.accent : theme.ornament }]}>
            {formatCountdown(r.at - now)}
          </ThemedText>
        </View>
      ))}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, borderRadius: 18 },
  center: { flex: 1, alignItems: 'center' },
  eyebrow: { color: '#C9B27A', fontSize: 11, lineHeight: 14, letterSpacing: 3 },
  clockTime: { color: '#F3DC9A', fontSize: 44, lineHeight: 52, fontVariant: ['tabular-nums'] },
  side: { width: 72, alignItems: 'center', gap: 2 },
  sideLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 16 },
  sideTime: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] },
  reset: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  live: { fontSize: 12, lineHeight: 16 },
  countdown: { fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'] },
});
