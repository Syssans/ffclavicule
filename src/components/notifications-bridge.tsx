/**
 * Tourne en permanence à la racine de l'appli : reprogramme les rappels du jeu (au démarrage et à chaque
 * changement de réglage), envoie la liste des alertes de prix au service quand elle change, et ouvre la
 * bonne page quand on touche une notification.
 */
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { uploadAlerts } from '@/api/notify';
import { applyReminders, configureNotifications, notificationsSupported } from '@/notifications/device';
import { useAppStore } from '@/store/app-store';
import { useNotificationStore } from '@/store/notification-store';

configureNotifications();

export function NotificationsBridge() {
  const reminders = useNotificationStore((s) => s.reminders);
  const oceanHours = useNotificationStore((s) => s.oceanHours);
  const alerts = useNotificationStore((s) => s.alerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const region = useAppStore((s) => s.region);

  useEffect(() => {
    applyReminders({ reminders, oceanHours }, region).catch(() => undefined);
  }, [reminders, oceanHours, region]);

  useEffect(() => {
    if (!secret) return;
    const timer = setTimeout(() => uploadAlerts(secret, alerts).catch(() => undefined), 800);
    return () => clearTimeout(timer);
  }, [alerts, secret]);

  useEffect(() => {
    if (!notificationsSupported) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => undefined);
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);

  return null;
}
