/**
 * Notifications sur le téléphone : autorisation, programmation des rappels du jeu, jeton pour les alertes
 * de prix envoyées par le service.
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';

import { planReminders, type PlannedReminder, type ReminderSettings, type VentureReturn } from '@/notifications/reminders';

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
export async function applyReminders(settings: ReminderSettings, region: 'eu' | 'na', ventures: VentureReturn[] = []): Promise<number> {
  if (!notificationsSupported) return 0;
  const planned = planReminders(settings, region, Date.now(), undefined, ventures);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith('rappel-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (planned.length === 0) return 0;
  if (!(await ensurePermission())) throw new Error('Notifications refusées : autorise-les pour Clavicule dans les Réglages de l’iPhone.');
  for (const p of planned) {
    const attachment = p.icon ? await attachmentFor(p.icon, p.id) : null;
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: {
        title: p.title,
        body: p.body,
        sound: 'default',
        data: p.url ? { url: p.url } : {},
        ...(attachment ? { attachments: [attachment] } : {}),
      },
      trigger: toTrigger(p.trigger),
    });
  }
  return planned.length;
}

/** Remplace les rappels de la chasse (ouverture des fenêtres de réapparition) ; sans demander l'autorisation. */
export async function applyHuntReminders(planned: { id: string; title: string; body: string; at: number; url: string; icon: number }[]): Promise<void> {
  if (!notificationsSupported) return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled.filter((n) => n.identifier.startsWith('chasse-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  if (planned.length === 0 || !(await Notifications.getPermissionsAsync()).granted) return;
  for (const p of planned) {
    const attachment = await attachmentFor(p.icon, p.id);
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, sound: 'default', data: { url: p.url }, ...(attachment ? { attachments: [attachment] } : {}) },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at },
    });
  }
}

/**
 * Image d'un rappel, à droite de la notification : l'icône du jeu, téléchargée une fois et gardée sur le téléphone,
 * puis copiée pour chaque notification (iOS range la pièce jointe à part et la retire du dossier). Sans réseau la
 * première fois, la notification part sans image.
 */
async function attachmentFor(icon: number, id: string): Promise<Notifications.NotificationContentAttachmentIos | null> {
  if (Platform.OS !== 'ios') return null;
  try {
    const dir = new Directory(Paths.cache, 'rappels');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const source = new File(dir, `icone-${icon}.png`);
    if (!source.exists) await File.downloadFileAsync(gameIconUrl(icon), source);
    const copy = new File(dir, `${id}.png`);
    if (copy.exists) copy.delete();
    await source.copy(copy);
    return { identifier: id, url: copy.uri, type: 'public.png' };
  } catch {
    return null;
  }
}

function toTrigger(trigger: PlannedReminder['trigger']): Notifications.NotificationTriggerInput {
  if (trigger.type === 'daily') return { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: trigger.hour, minute: trigger.minute };
  if (trigger.type === 'weekly') {
    return { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: trigger.weekday, hour: trigger.hour, minute: trigger.minute };
  }
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger.at };
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
