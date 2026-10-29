/**
 * « Aujourd'hui » : les tâches du jour et de la semaine, et ce qu'il en reste.
 *
 * Partagé par l'appli (la liste) et le service (le rappel envoyé avant la réinitialisation) : aucun import.
 * Une tâche est faite si le jeu le dit (relevé du plugin, valable seulement depuis la dernière réinitialisation)
 * ou si le joueur l'a cochée depuis cette réinitialisation.
 */

export type Region = 'eu' | 'na';
export type TodaySection = 'daily' | 'weekly';

/** Relevé du plugin (champ « duties » des données privées). */
export interface DutyProgress {
  updatedAt: string;
  dailyCycle: number;
  weeklyCycle: number;
  roulettes: number[];
  tribeAllowances?: number;
  /** Secondes Unix ; 0 : une carte peut être récoltée. */
  mapReadyAt?: number;
  deliveries?: number;
  bingo?: { journal: boolean; stickers: number; expiresAt: number; secondChances: number; turnedIn: boolean };
  tomestones?: number;
  tomestoneLimit?: number;
}

/** Quand une tâche revient : chaque jour ou chaque semaine à une heure UTC, au tirage du Cactpot, ou après un délai. */
export type ResetRule = { hour: number; weekday?: number } | { cactpot: true } | { cooldownHours: number };

export interface TaskStatus {
  done: boolean;
  /** « 4/9 », « 6 restantes », « Dans 5 h 12 »… */
  detail?: string;
}

export interface TaskDef {
  key: string;
  label: string;
  section: TodaySection;
  /** Regroupement à l'écran. */
  group?: 'roulettes';
  reset: ResetRule;
  /** État lu en jeu, ou null si le relevé ne le dit pas. */
  auto?: (p: DutyProgress, now: number) => TaskStatus | null;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DAILY: ResetRule = { hour: 15 };
const WEEKLY: ResetRule = { hour: 8, weekday: 2 };
export const SECTION_RESET: Record<TodaySection, ResetRule> = { daily: DAILY, weekly: WEEKLY };

/** Missions aléatoires, dans l'ordre de l'outil de mission (numéros de la feuille ContentRoulette). */
const ROULETTES: [number, string][] = [
  [5, 'Expert'],
  [8, 'Donjons supérieurs'],
  [2, 'Donjons avancés'],
  [1, 'Gain de niveaux'],
  [6, 'Défis'],
  [3, 'Épopée'],
  [4, 'Opérations de guilde'],
  [15, 'Raids en alliance'],
  [17, 'Raids normaux'],
  [9, 'Mentor'],
  [7, 'Front'],
];

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const TASKS: TaskDef[] = [
  ...ROULETTES.map(
    ([id, label]): TaskDef => ({
      key: `roulette:${id}`,
      label,
      section: 'daily',
      group: 'roulettes',
      reset: DAILY,
      auto: (p) => ({ done: p.roulettes.includes(id) }),
    }),
  ),
  {
    key: 'tribes',
    label: 'Peuples alliés',
    section: 'daily',
    reset: DAILY,
    auto: (p) =>
      p.tribeAllowances === undefined
        ? null
        : { done: p.tribeAllowances === 0, detail: p.tribeAllowances ? plural(p.tribeAllowances, 'quête') : undefined },
  },
  {
    key: 'map',
    label: 'Carte au trésor',
    section: 'daily',
    reset: { cooldownHours: 18 },
    auto: (p, now) => {
      if (p.mapReadyAt === undefined) return null;
      const at = p.mapReadyAt * 1000;
      return at > now ? { done: true, detail: `Dans ${countdown(at - now)}` } : { done: false };
    },
  },
  { key: 'huntDaily', label: 'Contrats de chasse', section: 'daily', reset: DAILY },
  { key: 'miniCactpot', label: 'Mini Cactpot', section: 'daily', reset: DAILY },
  { key: 'gc', label: 'Grande Compagnie', section: 'daily', reset: { hour: 20 } },
  {
    key: 'wondrous',
    label: 'Aventures imaginaires',
    section: 'weekly',
    reset: WEEKLY,
    auto: (p, now) => {
      const b = p.bingo;
      if (!b) return null;
      if (b.turnedIn) return { done: true };
      if (!b.journal) return { done: false, detail: 'Carnet à prendre' };
      if (b.expiresAt * 1000 < now) return { done: false, detail: 'Carnet expiré' };
      if (b.stickers >= 9) return { done: false, detail: 'À rendre à Khloé' };
      return { done: false, detail: `${b.stickers}/9` };
    },
  },
  {
    key: 'deliveries',
    label: 'Commandes spéciales',
    section: 'weekly',
    reset: WEEKLY,
    auto: (p) =>
      p.deliveries === undefined ? null : { done: p.deliveries === 0, detail: p.deliveries ? plural(p.deliveries, 'restante') : undefined },
  },
  {
    key: 'tomestones',
    label: 'Mémoquartz',
    section: 'weekly',
    reset: WEEKLY,
    auto: (p) =>
      p.tomestones === undefined || !p.tomestoneLimit
        ? null
        : { done: p.tomestones >= p.tomestoneLimit, detail: p.tomestones >= p.tomestoneLimit ? undefined : `${p.tomestones}/${p.tomestoneLimit}` },
  },
  { key: 'raids', label: 'Butin des raids', section: 'weekly', reset: WEEKLY },
  { key: 'huntElite', label: 'Contrats d’élite', section: 'weekly', reset: WEEKLY },
  { key: 'fashion', label: 'Défilé de mode', section: 'weekly', reset: WEEKLY },
  { key: 'jumbo', label: 'Jumbo Cactpot', section: 'weekly', reset: { cactpot: true } },
];

export const TASK_BY_KEY = new Map(TASKS.map((t) => [t.key, t]));

export const DEFAULT_TRACKED = [
  'roulette:5',
  'roulette:8',
  'roulette:2',
  'roulette:1',
  'roulette:6',
  'roulette:15',
  'roulette:17',
  'tribes',
  'map',
  'miniCactpot',
  'wondrous',
  'deliveries',
  'tomestones',
  'fashion',
  'jumbo',
];

/** Prochaine occurrence (ms) d'une heure UTC, éventuellement un jour de la semaine (0 = dimanche). */
function nextAt(now: number, hour: number, weekday?: number): number {
  const d = new Date(now);
  let at = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour);
  if (weekday !== undefined) at += ((weekday - d.getUTCDay() + 7) % 7) * DAY;
  if (at <= now) at += weekday === undefined ? DAY : 7 * DAY;
  return at;
}

/** Prochaine réinitialisation d'une règle (ms). */
export function nextReset(rule: ResetRule, now: number, region: Region = 'eu'): number {
  if ('cooldownHours' in rule) return now + rule.cooldownHours * HOUR;
  if ('cactpot' in rule) return region === 'eu' ? nextAt(now, 19, 6) : nextAt(now, 2, 0);
  return nextAt(now, rule.hour, rule.weekday);
}

/** Dernière réinitialisation d'une règle (ms) : ce qui a été fait avant ne compte plus. */
export function lastReset(rule: ResetRule, now: number, region: Region = 'eu'): number {
  if ('cooldownHours' in rule) return now - rule.cooldownHours * HOUR;
  const period = 'hour' in rule && rule.weekday === undefined ? DAY : 7 * DAY;
  return nextReset(rule, now, region) - period;
}

/** « 3 h 05 », « 12 min », « 2 j 4 h ». */
export function countdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${String(rest).padStart(2, '0')}`;
  return `${rest} min`;
}

export interface TaskState extends TaskStatus {
  task: TaskDef;
  /** L'état vient du jeu (le joueur n'a rien à cocher). */
  fromGame: boolean;
}

/** État d'une tâche : lu en jeu si le relevé est de ce cycle, sinon coché (ou non) à la main. */
export function taskState(
  task: TaskDef,
  progress: DutyProgress | null | undefined,
  checkedAt: number | undefined,
  now: number,
  region: Region = 'eu',
): TaskState {
  const since = lastReset(task.reset, now, region);
  const checked = checkedAt !== undefined && checkedAt >= since;
  // Un relevé d'avant la réinitialisation ne dit plus rien (sauf la carte, qui a son propre minuteur).
  const fresh = progress && ('cooldownHours' in task.reset || Date.parse(progress.updatedAt) >= since);
  const auto = fresh && task.auto ? task.auto(progress, now) : null;
  if (auto?.done) return { task, ...auto, fromGame: true };
  if (checked) return { task, done: true, fromGame: false };
  return { task, done: false, detail: auto?.detail, fromGame: auto !== null };
}

/** Tâches suivies, dans l'ordre de la liste. */
export function trackedStates(
  tracked: readonly string[],
  progress: DutyProgress | null | undefined,
  checked: Record<string, number>,
  now: number,
  region: Region = 'eu',
): TaskState[] {
  const wanted = new Set(tracked);
  return TASKS.filter((t) => wanted.has(t.key)).map((t) => taskState(t, progress, checked[t.key], now, region));
}

/**
 * Ce qu'il reste à faire avant la réinitialisation d'une section : seulement les tâches qui reviennent à cette
 * réinitialisation-là (la Grande Compagnie, la carte et le Cactpot ont leurs propres heures).
 */
export function remainingBefore(
  section: TodaySection,
  tracked: readonly string[],
  progress: DutyProgress | null | undefined,
  checked: Record<string, number>,
  now: number,
): TaskState[] {
  return trackedStates(tracked, progress, checked, now).filter((s) => !s.done && s.task.reset === SECTION_RESET[section]);
}

/** Texte du rappel : « Expert, Défis, Peuples alliés (6 quêtes) ». */
export function remainingText(states: TaskState[]): string {
  const roulettes = states.filter((s) => s.task.group === 'roulettes');
  const others = states.filter((s) => s.task.group !== 'roulettes');
  const parts = [
    ...(roulettes.length > 3 ? [`${roulettes.length} missions aléatoires`] : roulettes.map((s) => s.task.label)),
    ...others.map((s) => (s.detail ? `${s.task.label} (${s.detail})` : s.task.label)),
  ];
  return parts.join(', ');
}
