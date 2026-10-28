/**
 * Centre de notifications, en un seul écran : l'état des notifications sur ce téléphone, puis deux onglets, les
 * rappels du jeu (programmés sur le téléphone) et les alertes de prix (envoyées par le service, même appli fermée).
 *
 * Paramètre : tab (« jeu » ou « marche ») pour ouvrir directement l'un des deux.
 */
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { GameWindow } from '@/components/game-ui';
import { GameReminders } from '@/components/notifications/game-reminders';
import { MarketAlerts } from '@/components/notifications/market-alerts';
import { WebNotice } from '@/components/notifications-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Screen, Segmented } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { ensurePermission, notificationsSupported } from '@/notifications/device';
import { REMINDERS } from '@/notifications/reminders';
import { useNotificationStore } from '@/store/notification-store';

type Tab = 'jeu' | 'marche';
type Permission = 'granted' | 'ask' | 'denied' | 'unknown';

/** Autorisation des notifications, relue à chaque retour dans l'appli (on a pu la changer dans les Réglages). */
function usePermission(): [Permission, () => Promise<void>] {
  const [status, setStatus] = useState<Permission>('unknown');
  useEffect(() => {
    if (!notificationsSupported) return;
    const read = () =>
      Notifications.getPermissionsAsync()
        .then((p) => setStatus(p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'denied'))
        .catch(() => setStatus('unknown'));
    read();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') read();
    });
    return () => sub.remove();
  }, []);
  const request = async () => {
    setStatus((await ensurePermission()) ? 'granted' : 'denied');
  };
  return [status, request];
}

export default function NotificationsScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const requested: Tab = params.tab === 'marche' ? 'marche' : 'jeu';
  const [seen, setSeen] = useState(requested);
  const [tab, setTab] = useState<Tab>(requested);
  if (seen !== requested) {
    setSeen(requested);
    setTab(requested);
  }

  const [permission, requestPermission] = usePermission();
  const alerts = useNotificationStore((s) => s.alerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const reminders = useNotificationStore((s) => s.reminders);
  const activeAlerts = secret ? alerts.filter((a) => a.enabled).length : 0;
  const activeReminders = REMINDERS.filter((r) => reminders[r.key]?.enabled).length;

  return (
    <Screen>
      {!notificationsSupported ? (
        <WebNotice />
      ) : (
        <GameWindow
          icon={GameIcons.calendar}
          title="Sur ce téléphone"
          subtitle={
            permission === 'granted'
              ? 'Notifications autorisées'
              : permission === 'denied'
                ? 'Notifications refusées'
                : permission === 'ask'
                  ? 'Notifications pas encore autorisées'
                  : 'Lecture de l’autorisation…'
          }>
          <View style={styles.summary}>
            <Badge label={`${activeReminders} rappel${activeReminders > 1 ? 's' : ''} du jeu`} tone={activeReminders ? 'accent' : 'neutral'} />
            <Badge
              label={secret ? `${activeAlerts} alerte${activeAlerts > 1 ? 's' : ''} de prix` : 'Alertes de prix non activées'}
              tone={activeAlerts ? 'accent' : 'neutral'}
            />
          </View>
          {permission === 'ask' ? <Button label="Autoriser les notifications" onPress={requestPermission} /> : null}
          {permission === 'denied' ? (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                Sans autorisation, rien ne s’affiche : autorise Clavicule dans les Réglages de l’iPhone (Notifications).
              </ThemedText>
              <Button label="Ouvrir les Réglages" variant="secondary" onPress={() => Linking.openSettings()} />
            </>
          ) : null}
        </GameWindow>
      )}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'jeu', label: 'Rappels du jeu', icon: GameIcons.roulettes },
          { value: 'marche', label: 'Alertes de prix', icon: GameIcons.marketBoard },
        ]}
      />
      <ThemedText type="small" themeColor="textSecondary" style={styles.lead}>
        {tab === 'jeu'
          ? 'Roulettes, chasses, Cactpot, pêche en mer, servants… Programmés sur ton téléphone, à ton heure locale, même hors connexion.'
          : 'Un objet, un serveur, un prix : le service Clavicule vérifie les ventes toutes les 10 minutes et te prévient, même appli fermée.'}
      </ThemedText>
      {tab === 'jeu' ? <GameReminders /> : <MarketAlerts />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  lead: { marginTop: -Spacing.one },
});
