/**
 * Rappels du jeu (roulettes, contrats de chasse, Jumbo Cactpot, pêche en mer…), activables un par un. Leurs
 * horaires sont fixes, en heure UTC. Chaque rappel devient une notification locale répétée (chaque jour ou chaque
 * semaine) à l'heure locale du téléphone, programmée par le téléphone lui-même : rien ne passe par un serveur.
 * Les rappels qui tombent à la même minute sont réunis en une seule notification.
 */
import { GameIcons } from '@/constants/game-icons';
import { nextUtc } from '@/utils/timers';

export { GameIcons };

export type ReminderKey =
  | 'roulettes'
  | 'allies'
  | 'huntDaily'
  | 'gc'
  | 'leves'
  | 'tomestones'
  | 'raids'
  | 'wondrous'
  | 'deliveries'
  | 'huntElite'
  | 'challenge'
  | 'carnival'
  | 'island'
  | 'miniCactpot'
  | 'jumboCactpot'
  | 'fashionTheme'
  | 'fashionJudging'
  | 'ocean'
  | 'ventures';

export type ReminderCategory = 'daily' | 'weekly' | 'goldSaucer' | 'ocean' | 'plugin';

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

/** Quand tombe un rappel, en heure UTC (jour de la semaine : 0 = dimanche). */
export type Schedule =
  | { kind: 'daily'; hours: number[] }
  | { kind: 'weekly'; weekday: number; hour: number }
  | { kind: 'cactpot' }
  | { kind: 'ocean' }
  | { kind: 'ventures' };

export interface ReminderInfo {
  key: ReminderKey;
  label: string;
  detail: string;
  /** Icône du jeu (ui/icon). */
  icon: number;
  category: ReminderCategory;
  schedule: Schedule;
  /** Texte de la notification, après « … » : ce qui se passe. */
  what: string;
}

const DAILY: Schedule = { kind: 'daily', hours: [15] };
const WEEKLY: Schedule = { kind: 'weekly', weekday: 2, hour: 8 };

export const REMINDERS: ReminderInfo[] = [
  // Chaque jour, à la réinitialisation quotidienne (15 h UTC) sauf mention contraire.
  { key: 'roulettes', category: 'daily', icon: GameIcons.roulettes, schedule: DAILY, label: 'Missions aléatoires', detail: 'Bonus quotidiens des roulettes', what: 'bonus des roulettes renouvelés' },
  { key: 'allies', category: 'daily', icon: GameIcons.allies, schedule: DAILY, label: 'Quêtes des peuples alliés', detail: 'Nouvelles autorisations du jour', what: 'nouvelles quêtes des peuples alliés' },
  { key: 'huntDaily', category: 'daily', icon: GameIcons.hunts, schedule: DAILY, label: 'Contrats de chasse', detail: 'Contrats quotidiens', what: 'nouveaux contrats de chasse quotidiens' },
  { key: 'gc', category: 'daily', icon: GameIcons.grandCompany, schedule: { kind: 'daily', hours: [20] }, label: 'Grande Compagnie', detail: 'Approvisionnement et ravitaillement', what: 'nouvelles commandes d’approvisionnement et de ravitaillement' },
  { key: 'leves', category: 'daily', icon: GameIcons.leves, schedule: { kind: 'daily', hours: [0, 12] }, label: 'Mandats', detail: 'Nouvelles autorisations toutes les 12 h', what: 'nouvelles autorisations de mandats' },
  // Chaque semaine, à la réinitialisation du mardi (8 h UTC).
  { key: 'tomestones', category: 'weekly', icon: GameIcons.tomestone, schedule: WEEKLY, label: 'Mémoquartz', detail: 'Nouveau plafond hebdomadaire', what: 'plafond de mémoquartz remis à zéro' },
  { key: 'raids', category: 'weekly', icon: GameIcons.raids, schedule: WEEKLY, label: 'Raids', detail: 'Butin hebdomadaire de nouveau disponible', what: 'butin des raids de nouveau disponible' },
  { key: 'wondrous', category: 'weekly', icon: GameIcons.wondrous, schedule: WEEKLY, label: 'Aventures imaginaires', detail: 'Nouveau carnet de Khloe', what: 'nouveau carnet de Khloe' },
  { key: 'deliveries', category: 'weekly', icon: GameIcons.deliveries, schedule: WEEKLY, label: 'Commandes spéciales', detail: 'Livraisons de la semaine', what: 'nouvelles commandes spéciales' },
  { key: 'huntElite', category: 'weekly', icon: GameIcons.hunts, schedule: WEEKLY, label: 'Contrats de chasse d’élite', detail: 'Contrats hebdomadaires', what: 'nouveaux contrats de chasse d’élite' },
  { key: 'challenge', category: 'weekly', icon: GameIcons.challengeLog, schedule: WEEKLY, label: 'Carnet d’objectifs', detail: 'Objectifs de la semaine', what: 'nouveaux objectifs de la semaine' },
  { key: 'carnival', category: 'weekly', icon: GameIcons.carnival, schedule: WEEKLY, label: 'La Grande Mascarade', detail: 'Cibles de la semaine', what: 'nouvelles cibles de la Grande Mascarade' },
  { key: 'island', category: 'weekly', icon: GameIcons.island, schedule: WEEKLY, label: 'Félicité insulaire', detail: 'Nouvelle semaine d’ateliers', what: 'nouvelle semaine d’ateliers sur ton île' },
  // Gold Saucer.
  { key: 'miniCactpot', category: 'goldSaucer', icon: GameIcons.mgp, schedule: DAILY, label: 'Mini Cactpot', detail: 'Trois tickets par jour', what: 'nouveaux tickets de Mini Cactpot' },
  { key: 'jumboCactpot', category: 'goldSaucer', icon: GameIcons.goldSaucer, schedule: { kind: 'cactpot' }, label: 'Jumbo Cactpot', detail: 'Tirage de la semaine', what: 'tirage du Jumbo Cactpot : vérifie tes billets' },
  { key: 'fashionTheme', category: 'goldSaucer', icon: GameIcons.fashion, schedule: WEEKLY, label: 'Défilé de mode : thème', detail: 'Annonce du nouveau thème (mardi)', what: 'nouveau thème du Défilé de mode' },
  { key: 'fashionJudging', category: 'goldSaucer', icon: GameIcons.fashion, schedule: { kind: 'weekly', weekday: 5, hour: 8 }, label: 'Défilé de mode : jugement', detail: 'Ouverture des notes (vendredi)', what: 'jugement du Défilé de mode ouvert' },
  // Pêche en mer : un rappel par départ choisi.
  { key: 'ocean', category: 'ocean', icon: GameIcons.ocean, schedule: { kind: 'ocean' }, label: 'Pêche en mer', detail: 'Embarquement à Limsa Lominsa (15 min pour s’inscrire)', what: 'embarquement au port de Limsa Lominsa' },
  // Avec le plugin : heures de retour connues grâce au relevé des servants.
  { key: 'ventures', category: 'plugin', icon: GameIcons.retainers, schedule: { kind: 'ventures' }, label: 'Missions des servants', detail: 'Quand un servant revient de mission', what: 'mission terminée' },
];

export const CATEGORIES: { key: ReminderCategory; label: string; detail: string; icon: number }[] = [
  { key: 'daily', label: 'Chaque jour', detail: 'Réinitialisation quotidienne', icon: GameIcons.roulettes },
  { key: 'weekly', label: 'Chaque semaine', detail: 'Réinitialisation du mardi', icon: GameIcons.calendar },
  { key: 'goldSaucer', label: 'Gold Saucer', detail: 'Cactpot et Défilé de mode', icon: GameIcons.goldSaucer },
  { key: 'ocean', label: 'Pêche en mer', detail: 'Départs toutes les deux heures', icon: GameIcons.ocean },
  { key: 'plugin', label: 'Avec le plugin', detail: 'Grâce au relevé de tes servants', icon: GameIcons.retainers },
];

/** Avances proposées, en minutes. */
export const LEADS = [0, 5, 15, 30, 60];

/** Départs de pêche en mer : toutes les 2 heures, aux heures paires UTC. */
export const OCEAN_HOURS = Array.from({ length: 12 }, (_, i) => i * 2);

export const DEFAULT_SETTINGS: ReminderSettings = {
  reminders: Object.fromEntries(
    REMINDERS.map((r) => [r.key, { enabled: false, lead: r.key === 'jumboCactpot' ? 30 : r.key === 'ocean' ? 15 : 0 }]),
  ) as Record<ReminderKey, ReminderSetting>,
  oceanHours: OCEAN_HOURS,
};

/** Anciens réglages (rappels par grandes familles) : chaque famille active les rappels qu'elle couvrait. */
const LEGACY: Record<string, ReminderKey[]> = {
  roulettes: ['roulettes', 'allies', 'miniCactpot'],
  weekly: ['tomestones', 'raids', 'wondrous', 'deliveries'],
  cactpot: ['jumboCactpot'],
  fashion: ['fashionJudging'],
};

/** À n'appliquer qu'une fois, aux réglages enregistrés avant le détail des rappels. */
export function migrateReminders(saved: Record<string, ReminderSetting> | undefined): Record<ReminderKey, ReminderSetting> {
  const out = { ...DEFAULT_SETTINGS.reminders };
  for (const [key, setting] of Object.entries(saved ?? {})) {
    if (key in out) out[key as ReminderKey] = { ...out[key as ReminderKey], ...setting };
    if (setting?.enabled) for (const target of LEGACY[key] ?? []) out[target] = { enabled: true, lead: setting.lead };
  }
  return out;
}

export type ReminderTrigger =
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number }
  | { type: 'date'; at: number };

export interface PlannedReminder {
  id: string;
  title: string;
  body: string;
  trigger: ReminderTrigger;
  /** Page ouverte quand on touche la notification. */
  url?: string;
  /** Icône du jeu jointe à la notification (l'image du rappel). */
  icon?: number;
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

export function withLead(lead: number): string {
  return lead === 0 ? 'maintenant' : lead >= 60 ? `dans ${lead / 60} h` : `dans ${lead} min`;
}

/** Heure UTC du tirage du Jumbo Cactpot : samedi 19 h en Europe, dimanche 2 h en Amérique du Nord. */
export function cactpotDraw(region: 'eu' | 'na'): { weekday: number; hour: number } {
  return region === 'eu' ? { weekday: 6, hour: 19 } : { weekday: 0, hour: 2 };
}

/** Mission d'un servant, telle que relevée par le plugin. */
export interface VentureReturn {
  characterId: number;
  retainer: string;
  /** Instant du retour, en secondes. */
  at: number;
}

/** iOS garde au plus 64 notifications programmées par appli. */
const MAX_SCHEDULED = 60;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Notifications à programmer. Les heures UTC du jeu sont converties en heure locale ; à refaire à chaque
 * ouverture de l'appli pour suivre les changements d'heure.
 */
export function planReminders(
  settings: ReminderSettings,
  region: 'eu' | 'na',
  now = Date.now(),
  toLocal: (at: number) => LocalClock = deviceClock,
  ventures: VentureReturn[] = [],
): PlannedReminder[] {
  // Rappels répétés, regroupés par minute de déclenchement.
  const groups = new Map<string, { trigger: ReminderTrigger; items: ReminderInfo[]; lead: number; label?: string }>();
  const add = (trigger: ReminderTrigger, info: ReminderInfo, lead: number, label?: string) => {
    const id =
      trigger.type === 'daily'
        ? `rappel-j-${pad(trigger.hour)}${pad(trigger.minute)}`
        : trigger.type === 'weekly'
          ? `rappel-s-${trigger.weekday}-${pad(trigger.hour)}${pad(trigger.minute)}`
          : `rappel-d-${trigger.at}`;
    const group = groups.get(id) ?? { trigger, items: [], lead, label };
    group.items.push(info);
    groups.set(id, group);
  };
  const daily = (utcHour: number, lead: number): ReminderTrigger => {
    const local = toLocal(nextUtc(now, utcHour) - lead * 60_000);
    return { type: 'daily', hour: local.hour, minute: local.minute };
  };
  const weekly = (utcHour: number, utcWeekday: number, lead: number): ReminderTrigger => {
    const local = toLocal(nextUtc(now, utcHour, utcWeekday) - lead * 60_000);
    return { type: 'weekly', weekday: local.weekday, hour: local.hour, minute: local.minute };
  };

  for (const info of REMINDERS) {
    const setting = settings.reminders[info.key];
    if (!setting?.enabled) continue;
    const { lead } = setting;
    const s = info.schedule;
    if (s.kind === 'daily') for (const hour of s.hours) add(daily(hour, lead), info, lead);
    else if (s.kind === 'weekly') add(weekly(s.hour, s.weekday, lead), info, lead);
    else if (s.kind === 'cactpot') {
      const draw = cactpotDraw(region);
      add(weekly(draw.hour, draw.weekday, lead), info, lead);
    } else if (s.kind === 'ocean') {
      for (const hour of settings.oceanHours.filter((h) => OCEAN_HOURS.includes(h))) add(daily(hour, lead), info, lead);
    }
  }

  const planned: PlannedReminder[] = [];
  for (const [id, { trigger, items, lead }] of groups) {
    const when = withLead(lead);
    if (items.length === 1) {
      const [info] = items;
      const what = info.what.charAt(0).toUpperCase() + info.what.slice(1);
      planned.push({ id, trigger, title: info.label, body: `${what} ${when}.`, icon: info.icon });
    } else {
      const title = items.every((i) => i.schedule === WEEKLY)
        ? 'Réinitialisation hebdomadaire'
        : items.every((i) => i.schedule === DAILY)
          ? 'Réinitialisation quotidienne'
          : 'Rappels du jeu';
      // Plusieurs rappels à la même minute : l'icône de la réinitialisation, ou du premier rappel.
      const icon = items.every((i) => i.schedule === WEEKLY) ? GameIcons.calendar : items.every((i) => i.schedule === DAILY) ? GameIcons.roulettes : items[0].icon;
      planned.push({ id, trigger, title, body: `${items.map((i) => i.label).join(', ')} : ${when}.`, icon });
    }
  }

  // Missions des servants : une notification par retour (ceux qui reviennent ensemble sont réunis).
  const ventureSetting = settings.reminders.ventures;
  if (ventureSetting?.enabled) {
    const byMinute = new Map<number, VentureReturn[]>();
    for (const v of ventures) {
      const at = Math.floor((v.at * 1000 - ventureSetting.lead * 60_000) / 60_000) * 60_000;
      if (at <= now) continue;
      byMinute.set(at, [...(byMinute.get(at) ?? []), v]);
    }
    const slots = [...byMinute.entries()].sort((a, b) => a[0] - b[0]).slice(0, Math.max(0, MAX_SCHEDULED - planned.length));
    for (const [at, list] of slots) {
      const names = list.map((v) => v.retainer).join(', ');
      planned.push({
        id: `rappel-servant-${at}`,
        trigger: { type: 'date', at },
        title: list.length > 1 ? 'Missions des servants' : `Mission de ${names}`,
        body: ventureSetting.lead ? `Retour de ${names} ${withLead(ventureSetting.lead)}.` : `${names} ${list.length > 1 ? 'sont revenus' : 'est revenu'} de mission.`,
        url: `/retainers/${list[0].characterId}`,
        icon: GameIcons.retainers,
      });
    }
  }
  return planned;
}

/** Heure locale d'un départ de pêche en mer (pour choisir lesquels annoncer). */
export function oceanLocalLabel(utcHour: number, now = Date.now(), toLocal: (at: number) => LocalClock = deviceClock): string {
  const { hour, minute } = toLocal(nextUtc(now, utcHour));
  return `${pad(hour)}:${pad(minute)}`;
}

/** Heure locale lisible d'un rappel : « tous les jours à 17:00 », « le mardi à 10:00 »… */
export function describeSchedule(info: ReminderInfo, region: 'eu' | 'na', now = Date.now(), toLocal: (at: number) => LocalClock = deviceClock): string {
  const at = (hour: number, weekday?: number) => {
    const local = toLocal(nextUtc(now, hour, weekday));
    return { time: `${pad(local.hour)}:${pad(local.minute)}`, day: WEEKDAYS[local.weekday - 1] };
  };
  const s = info.schedule;
  if (s.kind === 'daily') return `Chaque jour à ${s.hours.map((h) => at(h).time).join(' et ')}`;
  if (s.kind === 'weekly') {
    const { day, time } = at(s.hour, s.weekday);
    return `Le ${day} à ${time}`;
  }
  if (s.kind === 'cactpot') {
    const draw = cactpotDraw(region);
    const { day, time } = at(draw.hour, draw.weekday);
    return `Le ${day} à ${time}`;
  }
  if (s.kind === 'ocean') return 'Aux départs choisis';
  return 'À chaque retour de mission';
}

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
