/** Centre de notifications : deux entrées bien séparées, le marché et les rappels du jeu. */
import { router } from 'expo-router';

import { MenuEntry } from '@/components/game-ui';
import { WebNotice } from '@/components/notifications-ui';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { notificationsSupported } from '@/notifications/device';
import { GameIcons } from '@/constants/game-icons';
import { REMINDERS } from '@/notifications/reminders';
import { useNotificationStore } from '@/store/notification-store';

export default function NotificationsScreen() {
  const alerts = useNotificationStore((s) => s.alerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const reminders = useNotificationStore((s) => s.reminders);
  const activeAlerts = alerts.filter((a) => a.enabled).length;
  const activeReminders = REMINDERS.filter((r) => reminders[r.key]?.enabled).length;

  return (
    <Screen>
      {!notificationsSupported ? <WebNotice /> : null}
      <MenuEntry
        icon={GameIcons.marketBoard}
        title="Marché"
        subtitle="Prévenu quand un objet passe sous (ou au-dessus d’)un prix, sur le serveur de ton choix."
        status={!secret ? 'Non activées' : `${activeAlerts} alerte${activeAlerts > 1 ? 's' : ''} active${activeAlerts > 1 ? 's' : ''}`}
        onPress={() => router.push('/notifications/marche')}
      />
      <MenuEntry
        icon={GameIcons.roulettes}
        title="Rappels du jeu"
        subtitle="Roulettes, chasses, Cactpot, pêche en mer, servants… un par un."
        status={activeReminders ? `${activeReminders} rappel${activeReminders > 1 ? 's' : ''} actif${activeReminders > 1 ? 's' : ''}` : 'Aucun rappel'}
        onPress={() => router.push('/notifications/jeu')}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Les alertes du marché passent par ton service Clavicule ; les rappels du jeu restent sur ton téléphone.
      </ThemedText>
    </Screen>
  );
}
