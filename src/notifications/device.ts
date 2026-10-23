/**
 * Notifications sur le téléphone : autorisation, programmation des rappels du jeu, jeton pour les alertes
 * de prix envoyées par le service.
 */
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { planReminders, type ReminderSettings } from '@/notifications/reminders';

export const notificationsSupported = Platform.OS !== 'web';

/** Afficher les notifications même quand l'appli est ouverte. */
export function configureNotifications() {
  if (!notificationsSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

/** Demande l'autorisation si besoin ; vrai si les notifications sont permises. */
export async function ensurePermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Remplace les rappels programmés par ceux des réglages (à chaque ouverture et chaque changement). */
export async function applyReminders(settings: ReminderSettings, region: 'eu' | 'na'): Promise<number> {
  if (!notificationsSupported) return 0;
  const planned = planReminders(settings, region);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith('rappel-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (planned.length === 0) return 0;
  if (!(await ensurePermission())) throw new Error('Notifications refusées : autorise-les pour Clavicule dans les Réglages de l’iPhone.');
  for (const p of planned) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, sound: 'default' },
      trigger:
        p.trigger.type === 'daily'
          ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: p.trigger.hour, minute: p.trigger.minute }
          : {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: p.trigger.weekday,
              hour: p.trigger.hour,
              minute: p.trigger.minute,
            },
    });
  }
  return planned.length;
}

/** Projet Expo (EAS) de l'appli : nécessaire pour recevoir les notifications envoyées par le service. */
export function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Jeton de ce téléphone pour les notifications à distance (alertes de prix). */
export async function getPushToken(): Promise<string> {
  if (!notificationsSupported) throw new Error('Les alertes de prix ne marchent que sur le téléphone.');
  const projectId = easProjectId();
  if (!projectId) {
    throw new Error('L’appli n’est pas encore liée à un projet Expo : lance une fois « npx eas-cli@latest init » dans le dossier du projet.');
  }
  if (!(await ensurePermission())) throw new Error('Notifications refusées : autorise-les pour Clavicule dans les Réglages de l’iPhone.');
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
