/**
 * « Aujourd'hui » : les tâches du jour et de la semaine. Avec le plugin, elles se cochent toutes seules ; sinon
 * (et pour celles que le jeu ne dit pas), d'un toucher. Rappel facultatif avant chaque réinitialisation.
 */
import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { registerDevice } from '@/api/notify';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { RoulettePills, SectionRing, TaskRow, taskIcon } from '@/components/today/task-ui';
import { Button, ErrorBox, Screen, Segmented } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { useToday, type TodaySummary } from '@/hooks/use-today';
import { getPushToken, notificationsSupported } from '@/notifications/device';
import { countdown, TASKS, type TaskState, type TodaySection } from '@/shared/today';
import { useNotificationStore } from '@/store/notification-store';
import { useTodayStore } from '@/store/today-store';

const SECTIONS: Record<TodaySection, { title: string; icon: number }> = {
  daily: { title: 'Chaque jour', icon: GameIcons.roulettes },
  weekly: { title: 'Chaque semaine', icon: GameIcons.calendar },
};

export default function TodayScreen() {
  const now = useNow(30_000);
  const today = useToday(now);
  const [editing, setEditing] = useState(false);
  const theme = useTheme();

  return (
    <View style={styles.page}>
      <Stack.Screen
        options={{
          title: 'Aujourd’hui',
          headerRight: () => (
            <Pressable accessibilityRole="button" hitSlop={12} onPress={() => setEditing((e) => !e)}>
              <ThemedText type="smallBold" style={{ color: theme.accent }}>
                {editing ? 'OK' : 'Modifier'}
              </ThemedText>
            </Pressable>
          ),
        }}
      />
      {editing ? <EditList /> : <TodayList today={today} now={now} />}
    </View>
  );
}

function TodayList({ today, now }: { today: ReturnType<typeof useToday>; now: number }) {
  const setChecked = useTodayStore((s) => s.setChecked);
  const toggle = (s: TaskState) => setChecked(s.task.key, !s.done);
  return (
    <Screen>
      <Summary daily={today.daily} weekly={today.weekly} now={now} />
      {[today.daily, today.weekly].map((section) =>
        section.total ? <SectionWindow key={section.section} summary={section} now={now} onToggle={toggle} /> : null,
      )}
      {!today.linked && today.main ? (
        <Button
          label="Connecter le plugin pour tout cocher seul"
          variant="secondary"
          onPress={() => router.push({ pathname: '/connect', params: { id: String(today.main!.id), name: today.main!.name } })}
        />
      ) : null}
      {today.pluginOutdated ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Mets à jour le plugin pour que la liste se coche toute seule.
        </ThemedText>
      ) : null}
      {today.linked ? <ReminderWindow /> : null}
      {today.progress ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Lu en jeu à {new Date(today.progress.updatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
        </ThemedText>
      ) : null}
    </Screen>
  );
}

/** Bandeau : l'avancée du jour et de la semaine, et le temps avant chaque réinitialisation. */
function Summary({ daily, weekly, now }: { daily: TodaySummary; weekly: TodaySummary; now: number }) {
  return (
    <LinearGradient colors={['#222B47', '#0B0F1C']} style={styles.summary}>
      {[daily, weekly].map((s) => (
        <View key={s.section} style={styles.summarySide} accessible accessibilityLabel={`${SECTIONS[s.section].title} : ${s.done} sur ${s.total}`}>
          <SectionRing done={s.done} total={s.total} size={72} />
          <View style={styles.flex}>
            <ThemedText type="small" style={styles.summaryLabel}>
              {s.section === 'daily' ? 'JOUR' : 'SEMAINE'}
            </ThemedText>
            <ThemedText type="smallBold" style={styles.summaryTime}>
              {countdown(s.resetAt - now)}
            </ThemedText>
          </View>
        </View>
      ))}
    </LinearGradient>
  );
}

function SectionWindow({ summary, now, onToggle }: { summary: TodaySummary; now: number; onToggle: (s: TaskState) => void }) {
  const theme = useTheme();
  const roulettes = summary.states.filter((s) => s.task.group === 'roulettes');
  const others = summary.states.filter((s) => s.task.group !== 'roulettes');
  const info = SECTIONS[summary.section];
  return (
    <GameWindow
      icon={info.icon}
      title={info.title}
      right={
        <ThemedText type="smallBold" style={[styles.countdown, { color: theme.ornament }]}>
          {countdown(summary.resetAt - now)}
        </ThemedText>
      }>
      {roulettes.length ? (
        <View style={styles.roulettes}>
          <View style={styles.groupHead}>
            <MenuIcon id={GameIcons.roulettes} size={28} />
            <ThemedText type="smallBold" style={styles.flex}>
              Missions aléatoires
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {roulettes.filter((s) => s.done).length}/{roulettes.length}
            </ThemedText>
          </View>
          <RoulettePills states={roulettes} onToggle={onToggle} />
        </View>
      ) : null}
      {others.map((s, i) => (
        <TaskRow key={s.task.key} state={s} first={i === 0 && !roulettes.length} onToggle={() => onToggle(s)} />
      ))}
    </GameWindow>
  );
}

/** Choix des tâches suivies. */
function EditList() {
  const theme = useTheme();
  const tracked = useTodayStore((s) => s.tracked);
  const toggleTracked = useTodayStore((s) => s.toggleTracked);
  return (
    <Screen>
      {(['daily', 'weekly'] as const).map((section) => (
        <GameWindow key={section} icon={SECTIONS[section].icon} title={SECTIONS[section].title}>
          {TASKS.filter((t) => t.section === section).map((t, i) => (
            <View key={t.key} style={[styles.editRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <MenuIcon id={taskIcon(t.key)} size={30} />
              <ThemedText type="small" style={styles.flex} numberOfLines={1}>
                {t.group === 'roulettes' ? `Mission : ${t.label.toLowerCase()}` : t.label}
              </ThemedText>
              <Switch
                accessibilityLabel={t.label}
                value={tracked.includes(t.key)}
                onValueChange={() => toggleTracked(t.key)}
                trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
              />
            </View>
          ))}
        </GameWindow>
      ))}
    </Screen>
  );
}

const LEADS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '1 h' },
  { value: '120', label: '2 h' },
  { value: '180', label: '3 h' },
];

/** Rappel envoyé par le service avant la réinitialisation, s'il reste quelque chose à faire. */
function ReminderWindow() {
  const theme = useTheme();
  const reminder = useTodayStore((s) => s.reminder);
  const setReminder = useTodayStore((s) => s.setReminder);
  const secret = useNotificationStore((s) => s.pushSecret);
  const setPushSecret = useNotificationStore((s) => s.setPushSecret);
  // Première fois : le téléphone s'inscrit auprès du service (comme pour les alertes de prix).
  const enable = useMutation({
    mutationFn: async (patch: Partial<typeof reminder>) => {
      if (!secret) setPushSecret(await registerDevice(await getPushToken()));
      setReminder(patch);
    },
  });
  if (!notificationsSupported) return null;
  const set = (patch: Partial<typeof reminder>, on: boolean) => (on ? enable.mutate(patch) : setReminder(patch));
  const active = Boolean(secret) && (reminder.daily || reminder.weekly);
  return (
    <GameWindow icon={GameIcons.calendar} title="Rappel">
      {(
        [
          ['daily', 'Avant la réinitialisation du jour'],
          ['weekly', 'Avant celle du mardi'],
        ] as const
      ).map(([key, label], i) => (
        <View key={key} style={[styles.editRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
          <ThemedText type="small" style={styles.flex}>
            {label}
          </ThemedText>
          <Switch
            accessibilityLabel={label}
            value={Boolean(secret) && reminder[key]}
            disabled={enable.isPending}
            onValueChange={(on) => set({ [key]: on }, on)}
            trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
          />
        </View>
      ))}
      {active ? <Segmented options={LEADS} value={String(reminder.lead)} onChange={(v) => setReminder({ lead: Number(v) })} /> : null}
      {enable.error ? <ErrorBox error={enable.error} /> : null}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  center: { textAlign: 'center' },
  summary: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, borderRadius: 18 },
  summarySide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  summaryLabel: { color: '#C9B27A', fontSize: 11, lineHeight: 14, letterSpacing: 2 },
  summaryTime: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontVariant: ['tabular-nums'] },
  countdown: { fontSize: 15, lineHeight: 20, fontVariant: ['tabular-nums'] },
  roulettes: { gap: Spacing.two, paddingBottom: Spacing.two },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
});
