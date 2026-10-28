/**
 * Centre de notifications, en un seul écran : l'autorisation si elle manque, puis deux onglets, les
 * rappels du jeu (programmés sur le téléphone) et les alertes de prix (envoyées par le service, même appli fermée).
 *
 * Paramètre : tab (« jeu » ou « marche ») pour ouvrir directement l'un des deux.
 */
import * as Notifications from 'expo-notifications';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { GameReminders } from '@/components/notifications/game-reminders';
import { MarketAlerts } from '@/components/notifications/market-alerts';
import { WebNotice } from '@/components/notifications-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen, Segmented } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { ensurePermission, notificationsSupported } from '@/notifications/device';

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

  return (
    <Screen>
      {!notificationsSupported ? <WebNotice /> : null}
      {/* L'autorisation n'apparaît que lorsqu'il y a quelque chose à faire. */}
      {permission === 'ask' ? <Button label="Autoriser les notifications" onPress={requestPermission} /> : null}
      {permission === 'denied' ? (
        <View style={styles.denied}>
          <ThemedText type="small" themeColor="textSecondary">
            Notifications refusées dans les Réglages de l’iPhone.
          </ThemedText>
          <Button label="Ouvrir les Réglages" variant="secondary" onPress={() => Linking.openSettings()} />
        </View>
      ) : null}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'jeu', label: 'Rappels du jeu', icon: GameIcons.roulettes },
          { value: 'marche', label: 'Alertes de prix', icon: GameIcons.marketBoard },
        ]}
      />
      {tab === 'jeu' ? <GameReminders /> : <MarketAlerts />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  denied: { gap: Spacing.two },
});
