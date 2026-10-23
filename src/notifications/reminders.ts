/**
 * Rappels du jeu (réinitialisations, roulettes, pêche en mer…) : leurs horaires sont fixes, en heure UTC.
 * Chaque rappel devient une notification locale répétée (chaque jour ou chaque semaine) à l'heure locale du
 * téléphone, programmée par le téléphone lui-même : rien ne passe par un serveur.
 */
import { nextUtc } from '@/utils/timers';

export type ReminderKey = 'roulettes' | 'gc' | 'weekly' | 'cactpot' | 'fashion' | 'leves' | 'ocean';

export interface ReminderSetting {
  enabled: boolean;
  /** Minutes d'avance sur l'événement (0 : au moment même). */
  lead: number;
}

export interface ReminderSettings {
  reminders: Record<ReminderKey, ReminderSetting>;
  /** Départs de pêche en mer à annoncer (heures UTC paires, 0 à 22). */
  oceanHours: number[];
}

export interface ReminderInfo {
  key: ReminderKey;
  label: string;
  detail: string;
}

export const REMINDERS: ReminderInfo[] = [
  { key: 'roulettes', label: 'Roulettes et réinitialisation quotidienne', detail: 'Roulettes, défis du jour, tribus, mini Cactpot' },
  { key: 'gc', label: 'Grande Compagnie', detail: 'Approvisionnement et ravitaillement' },
  { key: 'weekly', label: 'Réinitialisation hebdomadaire', detail: 'Mémoquartz, raids, Aventures imaginaires, commandes' },
  { key: 'cactpot', label: 'Jumbo Cactpot', detail: 'Tirage au Gold Saucer' },
  { key: 'fashion', label: 'Défilé de mode', detail: 'Nouveau thème au Gold Saucer' },
  { key: 'leves', label: 'Mandats', detail: 'Nouvelles autorisations (toutes les 12 h)' },
  { key: 'ocean', label: 'Pêche en mer', detail: 'Embarquement à Limsa Lominsa (15 min pour s’inscrire)' },
];

/** Avances proposées, en minutes. */
export const LEADS = [0, 5, 15, 30, 60];

/** Départs de pêche en mer : toutes les 2 heures, aux heures paires UTC. */
export const OCEAN_HOURS = Array.from({ length: 12 }, (_, i) => i * 2);

export const DEFAULT_SETTINGS: ReminderSettings = {
  reminders: {
    roulettes: { enabled: false, lead: 0 },
    gc: { enabled: false, lead: 0 },
    weekly: { enabled: false, lead: 0 },
    cactpot: { enabled: false, lead: 30 },
    fashion: { enabled: false, lead: 0 },
    leves: { enabled: false, lead: 0 },
    ocean: { enabled: false, lead: 15 },
  },
  oceanHours: OCEAN_HOURS,
};

export type ReminderTrigger = { type: 'daily'; hour: number; minute: number } | { type: 'weekly'; weekday: number; hour: number; minute: number };

export interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  trigger: ReminderTrigger;
}

/** Heure locale d'un instant ; weekday de 1 (dimanche) à 7, comme les notifications. */
export interface LocalClock {
  hour: number;
  minute: number;
  weekday: number;
}

export function deviceClock(at: number): LocalClock {
  const d = new Date(at);
  return { hour: d.getHours(), minute: d.getMinutes(), weekday: d.getDay() + 1 };
}

function withLead(lead: number): string {
  return lead === 0 ? 'maintenant' : lead >= 60 ? `dans ${lead / 60} h` : `dans ${lead} min`;
}

/**
 * Notifications à programmer. Les heures UTC du jeu sont converties en heure locale ; à refaire à chaque
 * ouverture de l'appli pour suivre les changements d'heure.
 */
export function planReminders(
  settings: ReminderSettings,
  region: 'eu' | 'na',
  now = Date.now(),
  toLocal: (at: number) => LocalClock = deviceClock,
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  const daily = (id: string, utcHour: number, lead: number, title: string, body: string) => {
    const local = toLocal(nextUtc(now, utcHour) - lead * 60_000);
    planned.push({ id, title, body, trigger: { type: 'daily', hour: local.hour, minute: local.minute } });
  };
  const weekly = (id: string, utcHour: number, utcWeekday: number, lead: number, title: string, body: string) => {
    const local = toLocal(nextUtc(now, utcHour, utcWeekday) - lead * 60_000);
    planned.push({ id, title, body, trigger: { type: 'weekly', weekday: local.weekday, hour: local.hour, minute: local.minute } });
  };
  const r = settings.reminders;

  if (r.roulettes.enabled) {
    daily('rappel-roulettes', 15, r.roulettes.lead, 'Réinitialisation quotidienne', `Roulettes et défis du jour : ${withLead(r.roulettes.lead)}.`);
  }
  if (r.gc.enabled) daily('rappel-gc', 20, r.gc.lead, 'Grande Compagnie', `Approvisionnement et ravitaillement renouvelés ${withLead(r.gc.lead)}.`);
  if (r.weekly.enabled) {
    weekly('rappel-hebdo', 8, 2, r.weekly.lead, 'Réinitialisation hebdomadaire', `Mémoquartz, raids et Aventures imaginaires : ${withLead(r.weekly.lead)}.`);
  }
  if (r.cactpot.enabled) {
    const [hour, weekday] = region === 'eu' ? [19, 6] : [2, 0];
    weekly('rappel-cactpot', hour, weekday, r.cactpot.lead, 'Jumbo Cactpot', `Tirage au Gold Saucer ${withLead(r.cactpot.lead)} : vérifie tes billets.`);
  }
  if (r.fashion.enabled) {
    weekly('rappel-mode', 8, 5, r.fashion.lead, 'Défilé de mode', `Nouveau thème ${withLead(r.fashion.lead)} au Gold Saucer.`);
  }
  if (r.leves.enabled) {
    for (const hour of [0, 12]) daily(`rappel-mandats-${hour}`, hour, r.leves.lead, 'Mandats', `Nouvelles autorisations de mandats ${withLead(r.leves.lead)}.`);
  }
  if (r.ocean.enabled) {
    for (const hour of settings.oceanHours.filter((h) => OCEAN_HOURS.includes(h))) {
      daily(`rappel-peche-${hour}`, hour, r.ocean.lead, 'Pêche en mer', `Embarquement ${withLead(r.ocean.lead)} au port de Limsa Lominsa (inscriptions pendant 15 min).`);
    }
  }
  return planned;
}

/** Heure locale d'un départ de pêche en mer (pour choisir lesquels annoncer). */
export function oceanLocalLabel(utcHour: number, now = Date.now(), toLocal: (at: number) => LocalClock = deviceClock): string {
  const { hour, minute } = toLocal(nextUtc(now, utcHour));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
