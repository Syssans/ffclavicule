/** Rappels du jeu, activables un par un, rangés comme dans le jeu : chaque jour, chaque semaine, Gold Saucer… */
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { GameWindow, MenuIcon } from '@/components/game-ui';
import { leadLabel } from '@/components/notifications-ui';
import { ThemedText } from '@/components/themed-text';
import { Card, Chip } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { ensurePermission, notificationsSupported } from '@/notifications/device';
import {
  CATEGORIES,
  describeSchedule,
  LEADS,
  OCEAN_HOURS,
  oceanLocalLabel,
  REMINDERS,
  type ReminderInfo,
  type ReminderKey,
} from '@/notifications/reminders';
import { useAppStore } from '@/store/app-store';
import { useNotificationStore } from '@/store/notification-store';

export function GameReminders() {
  const theme = useTheme();
  const reminders = useNotificationStore((s) => s.reminders);
  const setReminder = useNotificationStore((s) => s.setReminder);
  const [denied, setDenied] = useState(false);

  const toggle = async (keys: ReminderKey[], enabled: boolean) => {
    if (enabled && notificationsSupported && !(await ensurePermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    for (const key of keys) setReminder(key, { enabled });
  };

  return (
    <>
      {denied ? (
        <Card>
          <ThemedText type="small" style={{ color: theme.danger }}>
            Notifications refusées : autorise-les pour Clavicule (ou Expo Go) dans les Réglages de l’iPhone, puis réessaie.
          </ThemedText>
        </Card>
      ) : null}

      {CATEGORIES.map((category) => {
        const items = REMINDERS.filter((r) => r.category === category.key);
        const active = items.filter((r) => reminders[r.key]?.enabled).length;
        const all = active === items.length;
        return (
          <GameWindow
            key={category.key}
            icon={category.icon}
            title={category.label}
            subtitle={`${category.detail} · ${active}/${items.length} actif${active > 1 ? 's' : ''}`}
            right={
              items.length > 1 ? (
                <Chip label={all ? 'Aucun' : 'Tous'} onPress={() => toggle(items.map((r) => r.key), !all)} />
              ) : null
            }>
            {items.map((info, i) => (
              <ReminderRow key={info.key} info={info} first={i === 0} onToggle={(enabled) => toggle([info.key], enabled)} />
            ))}
          </GameWindow>
        );
      })}
    </>
  );
}

function ReminderRow({ info, first, onToggle }: { info: ReminderInfo; first: boolean; onToggle: (enabled: boolean) => void }) {
  const theme = useTheme();
  const now = useNow(60_000);
  const region = useAppStore((s) => s.region);
  const linked = useAppStore((s) => Object.keys(s.privateLinks).length > 0);
  const setting = useNotificationStore((s) => s.reminders[info.key]);
  const setReminder = useNotificationStore((s) => s.setReminder);
  const oceanHours = useNotificationStore((s) => s.oceanHours);
  const setOceanHours = useNotificationStore((s) => s.setOceanHours);
  const enabled = setting?.enabled ?? false;
  const unavailable = info.category === 'plugin' && !linked;

  return (
    <View style={[styles.item, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled, disabled: unavailable }}
        accessibilityLabel={`${info.label}, ${info.detail}`}
        disabled={unavailable}
        onPress={() => onToggle(!enabled)}
        style={styles.itemHead}>
        <MenuIcon id={info.icon} size={40} dimmed={!enabled} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {info.label}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {unavailable ? 'Connecte d’abord le plugin à un personnage' : `${info.detail} · ${describeSchedule(info, region, now)}`}
          </ThemedText>
        </View>
        <Switch value={enabled} disabled={unavailable} onValueChange={onToggle} trackColor={{ true: theme.accent }} />
      </Pressable>
      {enabled ? (
        <View style={styles.options}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Prévenir : ${leadLabel(setting.lead)}. Toucher pour changer.`}
            onPress={() => setReminder(info.key, { lead: LEADS[(LEADS.indexOf(setting.lead) + 1) % LEADS.length] })}
            style={({ pressed }) => [styles.lead, { borderColor: theme.accent, backgroundColor: theme.backgroundSelected }, pressed && { opacity: 0.7 }]}>
            <MenuIcon id={GameIcons.calendar} size={18} />
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              {leadLabel(setting.lead)} ▸
            </ThemedText>
          </Pressable>
          {info.key === 'ocean' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Départs à annoncer (heure locale) :
              </ThemedText>
              <View style={styles.chips}>
                {OCEAN_HOURS.map((h) => {
                  const on = oceanHours.includes(h);
                  return (
                    <Chip
                      key={h}
                      label={oceanLocalLabel(h, now)}
                      selected={on}
                      onPress={() => setOceanHours(on ? oceanHours.filter((x) => x !== h) : [...oceanHours, h])}
                    />
                  );
                })}
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  item: { paddingVertical: Spacing.two, gap: Spacing.two },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  options: { gap: Spacing.one, paddingLeft: 40 + Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  lead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.two, paddingVertical: 4 },
});
