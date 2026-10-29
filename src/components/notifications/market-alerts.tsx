/** Alertes de prix du marché : envoyées par le service même appli fermée, autant qu'on veut. */
import { useMutation, useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { alertStates, forgetDevice, registerDevice, sendTestPush, uploadAlerts } from '@/api/notify';
import { GameWindow } from '@/components/game-ui';
import { describeAlert } from '@/components/notifications-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, ErrorBox, GameIcon } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getPushToken } from '@/notifications/device';
import { GameIcons } from '@/constants/game-icons';
import { useNotificationStore } from '@/store/notification-store';
import { useTodayStore } from '@/store/today-store';
import { formatAgo, formatGil } from '@/utils/format';

export function MarketAlerts() {
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
    // Le rappel « Aujourd'hui » passe par la même inscription : il s'arrête aussi.
    useTodayStore.getState().setReminder({ daily: false, weekly: false });
  };

  const sorted = [...alerts].sort((a, b) => a.itemName.localeCompare(b.itemName, 'fr'));
  const active = alerts.filter((a) => a.enabled).length;

  // Tant que les alertes ne sont pas activées sur ce téléphone, on ne propose que de les activer.
  if (!secret) {
    return (
      <>
        <Button label={activate.isPending ? 'Activation…' : 'Activer les alertes de prix'} onPress={() => activate.mutate()} disabled={activate.isPending} />
        {activate.error ? <ErrorBox error={activate.error} /> : null}
      </>
    );
  }

  return (
    <>
      {states.data?.disabled ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          Le service n’arrive plus à joindre ce téléphone : désactive puis réactive les alertes.
        </ThemedText>
      ) : null}
      <GameWindow
        icon={GameIcons.gil}
        title="Mes alertes"
        subtitle={alerts.length ? `${active} sur ${alerts.length}` : null}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Ajouter une alerte" hitSlop={8} onPress={() => router.push('/alert')}>
            <ThemedText type="subtitle" style={{ color: theme.accent }}>
              +
            </ThemedText>
          </Pressable>
        }>
        {sorted.length === 0 ? (
          <Empty>Aucune alerte.</Empty>
        ) : (
          sorted.map((a, i) => {
            const state = states.data?.state[a.id];
            return (
              <Pressable
                key={a.id}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/alert', params: { alertId: a.id } })}
                style={({ pressed }) => [styles.alertRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
                <GameIcon uri={a.icon} size={40} dimmed={!a.enabled} />
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
          })
        )}
      </GameWindow>
      <Button label="Ajouter une alerte" onPress={() => router.push('/alert')} />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label={test.isSuccess ? 'Envoyée' : 'Notification d’essai'} variant="secondary" onPress={() => test.mutate()} />
        </View>
        <View style={styles.flex}>
          <Button label="Désactiver" variant="danger" onPress={stop} />
        </View>
      </View>
      {test.error ? <ErrorBox error={test.error} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: Spacing.two },
  alertRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
});
