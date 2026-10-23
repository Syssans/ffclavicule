/**
 * Tourne en permanence à la racine de l'appli : reprogramme les rappels du jeu (au démarrage et à chaque
 * changement de réglage), envoie la liste des alertes de prix au service quand elle change, et ouvre la
 * bonne page quand on touche une notification.
 */
import { useQueries } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';

import { uploadAlerts } from '@/api/notify';
import { getPrivate } from '@/api/private';
import { applyReminders, configureNotifications, notificationsSupported } from '@/notifications/device';
import type { VentureReturn } from '@/notifications/reminders';
import { useAppStore } from '@/store/app-store';
import { useNotificationStore } from '@/store/notification-store';

configureNotifications();

export function NotificationsBridge() {
  const reminders = useNotificationStore((s) => s.reminders);
  const oceanHours = useNotificationStore((s) => s.oceanHours);
  const alerts = useNotificationStore((s) => s.alerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const region = useAppStore((s) => s.region);
  const links = useAppStore((s) => s.privateLinks);

  // Missions des servants : heures de retour relevées par le plugin, pour chaque personnage connecté.
  const wantVentures = reminders.ventures?.enabled ?? false;
  const snapshots = useQueries({
    queries: Object.entries(links).map(([id, link]) => ({
      queryKey: ['private', Number(id), link.token],
      queryFn: () => getPrivate(Number(id), link.token),
      enabled: wantVentures,
      staleTime: 5 * 60_000,
    })),
  });
  const ventureKey = snapshots
    .flatMap((q) => (q.data ? q.data.retainers.map((r) => `${q.data!.name}:${r.name}:${r.ventureComplete}`) : []))
    .join('|');
  const ventures = useMemo<VentureReturn[]>(
    () =>
      Object.keys(links).flatMap((id, i) =>
        (snapshots[i]?.data?.retainers ?? []).filter((r) => r.ventureComplete > 0).map((r) => ({ characterId: Number(id), retainer: r.name, at: r.ventureComplete })),
      ),
    // ventureKey résume les données utiles : on ne reprogramme que si une heure de retour change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ventureKey, links],
  );

  useEffect(() => {
    applyReminders({ reminders, oceanHours }, region, ventures).catch(() => undefined);
  }, [reminders, oceanHours, region, ventures]);

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
