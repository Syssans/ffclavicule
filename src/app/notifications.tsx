/** Notifications : alertes de prix du marché (envoyées par le service) et rappels du jeu (programmés sur le téléphone). */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { alertStates, forgetDevice, registerDevice, sendTestPush, uploadAlerts } from '@/api/notify';
import { MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Empty, ErrorBox, Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { ensurePermission, getPushToken, notificationsSupported } from '@/notifications/device';
import { LEADS, OCEAN_HOURS, oceanLocalLabel, REMINDERS, type ReminderKey } from '@/notifications/reminders';
import { useTheme } from '@/hooks/use-theme';
import { useNotificationStore, type PriceAlert } from '@/store/notification-store';
import { formatAgo, formatGil } from '@/utils/format';

const REMINDER_ICONS: Record<ReminderKey, number> = {
  roulettes: MenuIcons.journal,
  gc: MenuIcons.devises,
  weekly: MenuIcons.calendrier,
  cactpot: MenuIcons.goldSaucer,
  fashion: MenuIcons.mode,
  leves: MenuIcons.actions,
  ocean: MenuIcons.peche,
};

function leadLabel(lead: number): string {
  return lead === 0 ? 'Au moment' : lead >= 60 ? `${lead / 60} h avant` : `${lead} min avant`;
}

export function describeAlert(a: PriceAlert): string {
  return `${a.condition === 'below' ? '≤' : '≥'} ${formatGil(a.price)} · ${a.scope}${a.hq ? ' · HQ' : ''}`;
}

export default function NotificationsScreen() {
  return (
    <Screen>
      {!notificationsSupported ? (
        <Card>
          <ThemedText type="small">Les notifications ne marchent que dans l’appli sur le téléphone, pas dans le navigateur.</ThemedText>
        </Card>
      ) : null}
      <MarketAlerts />
      <GameReminders />
    </Screen>
  );
}

function MarketAlerts() {
  const theme = useTheme();
  const alerts = useNotificationStore((s) => s.alerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const setPushSecret = useNotificationStore((s) => s.setPushSecret);
  const saveAlert = useNotificationStore((s) => s.saveAlert);

  const activate = useMutation({
    mutationFn: async () => {
      const token = await getPushToken();
      const created = await registerDevice(token);
      await uploadAlerts(created, useNotificationStore.getState().alerts, token);
      setPushSecret(created);
    },
  });
  const test = useMutation({ mutationFn: () => sendTestPush(secret!) });
  const states = useQuery({
    queryKey: ['notify', 'state', secret, alerts.length],
    queryFn: () => alertStates(secret!),
    enabled: Boolean(secret),
    refetchInterval: 60_000,
  });
  const stop = async () => {
    // Même si le service ne répond pas, ce téléphone arrête d'utiliser les alertes.
    if (secret) await forgetDevice(secret).catch(() => undefined);
    setPushSecret(null);
  };

  const sorted = [...alerts].sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr'));
  return (
    <Section title="Alertes du marché">
      {!secret ? (
        <Card>
          <View style={styles.head}>
            <MenuIcon id={MenuIcons.devises} size={40} />
            <ThemedText type="small" style={styles.flex}>
              Choisis un objet, un serveur et un prix : tu reçois une notification dès qu’une vente passe sous ton seuil (ou au-dessus),
              même appli fermée. Prix vérifiés toutes les 10 minutes, autant d’alertes que tu veux.
            </ThemedText>
          </View>
          <Button label={activate.isPending ? 'Activation…' : 'Activer les alertes du marché'} onPress={() => activate.mutate()} disabled={activate.isPending} />
          {activate.error ? <ErrorBox error={activate.error} /> : null}
        </Card>
      ) : (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            Alertes actives sur ce téléphone, vérifiées toutes les 10 minutes.
            {states.data?.disabled ? ' Le service n’arrive plus à joindre ce téléphone : désactive puis réactive les alertes.' : ''}
          </ThemedText>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label={test.isSuccess ? 'Notification envoyée' : 'Notification d’essai'} variant="secondary" onPress={() => test.mutate()} />
            </View>
            <View style={styles.flex}>
              <Button label="Désactiver" variant="danger" onPress={stop} />
            </View>
          </View>
          {test.error ? <ErrorBox error={test.error} /> : null}
        </Card>
      )}

      {sorted.length === 0 ? (
        <Empty>Aucune alerte. Crée-en une ici, ou depuis la fiche d’un objet du marché.</Empty>
      ) : (
        <Card style={styles.list}>
          {sorted.map((a, i) => {
            const state = states.data?.state[a.id];
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/alert', params: { alertId: a.id } })}
                style={({ pressed }) => [styles.alertRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
                {a.icon ? <Image source={a.icon} style={styles.icon} /> : <View style={[styles.icon, { backgroundColor: theme.backgroundSelected }]} />}
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {a.itemName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {describeAlert(a)}
                  </ThemedText>
                  {state?.checkedAt ? (
                    <ThemedText type="small" style={{ color: state.triggered ? theme.accent : theme.textSecondary }} numberOfLines={1}>
                      {state.lastPrice ? `Actuellement ${formatGil(state.lastPrice)}` : 'Aucune vente'} · vu {formatAgo(Date.parse(state.checkedAt))}
                    </ThemedText>
                  ) : null}
                </View>
                <Switch value={a.enabled} onValueChange={(enabled) => saveAlert({ ...a, enabled })} trackColor={{ true: theme.accent }} />
              </Pressable>
            );
          })}
        </Card>
      )}
      <Button label="Ajouter une alerte" variant={secret ? 'primary' : 'secondary'} onPress={() => router.push('/alert')} />
    </Section>
  );
}

function GameReminders() {
  const theme = useTheme();
  const reminders = useNotificationStore((s) => s.reminders);
  const oceanHours = useNotificationStore((s) => s.oceanHours);
  const setReminder = useNotificationStore((s) => s.setReminder);
  const setOceanHours = useNotificationStore((s) => s.setOceanHours);
  const [denied, setDenied] = useState(false);

  const toggle = async (key: ReminderKey, enabled: boolean) => {
    if (enabled && notificationsSupported && !(await ensurePermission())) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setReminder(key, { enabled });
  };

  return (
    <Section title="Rappels du jeu">
      <ThemedText type="small" themeColor="textSecondary">
        Programmés sur ton téléphone, à ton heure locale : ils marchent même hors connexion. Active seulement ceux qui te servent.
      </ThemedText>
      {denied ? (
        <Card>
          <ThemedText type="small" style={{ color: theme.danger }}>
            Notifications refusées : autorise-les pour Clavicule (ou Expo Go) dans les Réglages de l’iPhone, puis réessaie.
          </ThemedText>
        </Card>
      ) : null}
      {REMINDERS.map((r) => {
        const setting = reminders[r.key];
        return (
          <Card key={r.key}>
            <View style={styles.head}>
              <MenuIcon id={REMINDER_ICONS[r.key]} size={36} />
              <View style={styles.flex}>
                <ThemedText type="smallBold">{r.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.detail}
                </ThemedText>
              </View>
              <Switch value={setting.enabled} onValueChange={(v) => toggle(r.key, v)} trackColor={{ true: theme.accent }} />
            </View>
            {setting.enabled ? (
              <>
                <View style={styles.chips}>
                  {LEADS.map((lead) => (
                    <Chip key={lead} label={leadLabel(lead)} selected={setting.lead === lead} onPress={() => setReminder(r.key, { lead })} />
                  ))}
                </View>
                {r.key === 'ocean' ? (
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
                            label={oceanLocalLabel(h)}
                            selected={on}
                            onPress={() => setOceanHours(on ? oceanHours.filter((x) => x !== h) : [...oceanHours, h])}
                          />
                        );
                      })}
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </Card>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  list: { gap: 0, paddingVertical: Spacing.one },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  icon: { width: 40, height: 40, borderRadius: 8 },
});
