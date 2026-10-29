/** Briques de la liste « Aujourd'hui » : coche, ligne de tâche, pastille de mission aléatoire, résumé. */
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { MenuIcon, ProgressRing } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { TodaySummary } from '@/hooks/use-today';
import { countdown, type TaskState } from '@/shared/today';

/** Icône du jeu de chaque tâche. */
export const TASK_ICONS: Record<string, number> = {
  tribes: GameIcons.allies,
  map: GameIcons.treasure,
  huntDaily: GameIcons.hunts,
  miniCactpot: GameIcons.mgp,
  gc: GameIcons.grandCompany,
  wondrous: GameIcons.wondrous,
  deliveries: GameIcons.deliveries,
  tomestones: GameIcons.tomestone,
  raids: GameIcons.raids,
  huntElite: GameIcons.hunts,
  fashion: GameIcons.fashion,
  jumbo: GameIcons.goldSaucer,
};

export const taskIcon = (key: string) => TASK_ICONS[key] ?? GameIcons.roulettes;

/** Rond de coche : vide, ou plein et doré une fois la tâche faite. */
export function Check({ done, size = 26 }: { done: boolean; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.check,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: done ? theme.accent : theme.frame,
          backgroundColor: done ? theme.accent : 'transparent',
        },
      ]}>
      {done ? (
        <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
          <Path d="M5 12.5l4.5 4.5L19 7.5" stroke={theme.accentText} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </View>
  );
}

/** Une tâche : icône, nom, détail (« 4/9 »), coche. Touchable pour cocher, sauf quand le jeu dit qu'elle est faite. */
export function TaskRow({ state, first, onToggle }: { state: TaskState; first?: boolean; onToggle: () => void }) {
  const theme = useTheme();
  const locked = state.done && state.fromGame;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state.done, disabled: locked }}
      accessibilityLabel={[state.task.label, state.detail].filter(Boolean).join(', ')}
      disabled={locked}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        pressed && { opacity: 0.6 },
      ]}>
      <MenuIcon id={taskIcon(state.task.key)} size={34} dimmed={state.done} />
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={1} style={state.done ? { color: theme.textSecondary } : undefined}>
          {state.task.label}
        </ThemedText>
        {state.detail ? (
          <ThemedText type="small" numberOfLines={1} style={[styles.detail, { color: state.done ? theme.textSecondary : theme.ornament }]}>
            {state.detail}
          </ThemedText>
        ) : null}
      </View>
      <Check done={state.done} />
    </Pressable>
  );
}

/** Missions aléatoires : une pastille par mission, dorée une fois faite. */
export function RoulettePills({ states, onToggle }: { states: TaskState[]; onToggle: (state: TaskState) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.pills}>
      {states.map((s) => {
        const locked = s.done && s.fromGame;
        return (
          <Pressable
            key={s.task.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: s.done, disabled: locked }}
            accessibilityLabel={s.task.label}
            disabled={locked}
            onPress={() => onToggle(s)}
            style={({ pressed }) => [
              styles.pill,
              s.done ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.frame, backgroundColor: theme.background },
              pressed && { opacity: 0.6 },
            ]}>
            <ThemedText type="smallBold" numberOfLines={1} style={[styles.pillText, { color: s.done ? theme.accentText : theme.text }]}>
              {s.done ? '✓ ' : ''}
              {s.task.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Anneau d'avancée d'une section : « 4/9 » au centre. */
export function SectionRing({ done, total, size = 64 }: { done: number; total: number; size?: number }) {
  const theme = useTheme();
  const complete = total > 0 && done === total;
  return (
    <ProgressRing value={total ? done / total : 0} size={size} stroke={size > 56 ? 6 : 5}>
      {complete ? (
        <Check done size={size * 0.42} />
      ) : (
        <ThemedText type="smallBold" style={{ fontSize: size * 0.24, lineHeight: size * 0.3, color: theme.text }}>
          {done}/{total}
        </ThemedText>
      )}
    </ProgressRing>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  check: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, minHeight: 52 },
  detail: { fontSize: 13, lineHeight: 17 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pillText: { fontSize: 13, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 20, lineHeight: 26 },
  cardRings: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  cardSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTime: { fontVariant: ['tabular-nums'] },
});

/** Entrée de « Aujourd'hui » dans les Guides : l'avancée du jour et de la semaine. */
export function TodayCard({ daily, weekly, now, onPress }: { daily: TodaySummary; weekly: TodaySummary; now: number; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Aujourd’hui : ${daily.done} sur ${daily.total} aujourd’hui, ${weekly.done} sur ${weekly.total} cette semaine`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <ThemedText type="display" style={[styles.cardTitle, { color: theme.ornament }]}>
        Aujourd’hui
      </ThemedText>
      <View style={styles.cardRings}>
        {[daily, weekly].map((s) => (
          <View key={s.section} style={styles.cardSide}>
            <SectionRing done={s.done} total={s.total} size={52} />
            <View style={styles.flex}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {s.section === 'daily' ? 'Jour' : 'Semaine'}
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.cardTime}>
                {countdown(s.resetAt - now)}
              </ThemedText>
            </View>
          </View>
        ))}
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </View>
    </Pressable>
  );
}
