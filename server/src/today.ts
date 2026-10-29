/**
 * « Aujourd'hui » : rappel envoyé avant la réinitialisation quotidienne ou hebdomadaire, avec ce qu'il reste à
 * faire d'après le dernier relevé du plugin et les cases cochées dans l'appli.
 *
 * Le téléphone (inscrit pour les notifications) envoie la liste suivie et prouve qu'il est associé au personnage
 * avec son jeton des données privées ; le service n'en garde que l'empreinte, revérifiée à chaque rappel.
 *
 *   PUT /v1/notify/today  { characterId, privateToken, tracked, checked, daily, weekly, lead }   (secret du téléphone)
 */
import { remainingBefore, remainingText, nextReset, SECTION_RESET, TASK_BY_KEY, type DutyProgress, type TodaySection } from '../../src/shared/today';
import { error, json, sha256, type Env } from './common';
import { isPaired, readPrivate } from './private';

/** Avances possibles, en minutes. */
export const TODAY_LEADS = [30, 60, 120, 180];

export interface TodayWatch {
  characterId: number;
  tokenHash: string;
  tracked: string[];
  /** Tâche -> date où elle a été cochée (ms). */
  checked: Record<string, number>;
  daily: boolean;
  weekly: boolean;
  lead: number;
  /** Réinitialisation (ms) déjà annoncée, par section. */
  sent: Partial<Record<TodaySection, number>>;
}

export interface TodayPush {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data: Record<string, unknown>;
}

/** Vérifie la demande de l'appli ; rend la surveillance à garder (null : rappels coupés) ou un message d'erreur. */
export async function parseToday(
  env: Env,
  raw: unknown,
  before: TodayWatch | undefined,
): Promise<{ watch: TodayWatch | null } | { error: Response }> {
  if (!raw || typeof raw !== 'object') return { error: error(400, 'Réglages attendus.', 'bad-json') };
  const b = raw as Record<string, unknown>;
  if (b.daily !== true && b.weekly !== true) return { watch: null };
  const characterId = Number(b.characterId);
  if (!Number.isInteger(characterId) || characterId <= 0 || typeof b.privateToken !== 'string' || b.privateToken.length < 16) {
    return { error: error(400, 'Personnage ou jeton manquant.', 'bad-character') };
  }
  const tokenHash = await sha256(b.privateToken);
  if (!(await isPaired(env, characterId, tokenHash))) {
    return { error: error(403, 'Ce téléphone n’est plus connecté à ce personnage.', 'not-paired') };
  }
  const tracked = Array.isArray(b.tracked) ? b.tracked.filter((k): k is string => typeof k === 'string' && TASK_BY_KEY.has(k)) : [];
  const checked: Record<string, number> = {};
  if (b.checked && typeof b.checked === 'object') {
    for (const [k, v] of Object.entries(b.checked as Record<string, unknown>)) if (TASK_BY_KEY.has(k) && Number.isFinite(v)) checked[k] = Number(v);
  }
  const lead = TODAY_LEADS.includes(Number(b.lead)) ? Number(b.lead) : 60;
  const same = before && before.characterId === characterId;
  return {
    watch: { characterId, tokenHash, tracked, checked, daily: b.daily === true, weekly: b.weekly === true, lead, sent: same ? before.sent : {} },
  };
}

export function todayResponse(watch: TodayWatch | null): Response {
  return json({ ok: true, enabled: Boolean(watch) });
}

const TITLES: Record<TodaySection, string> = { daily: 'Réinitialisation quotidienne', weekly: 'Réinitialisation hebdomadaire' };

/** « 1 h », « 1 h 30 », « 50 min ». */
function inHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

/**
 * Rappels à envoyer maintenant : pour chaque section suivie, une fois par réinitialisation, dans les `lead`
 * minutes qui la précèdent, s'il reste quelque chose à faire. Met à jour `sent`.
 */
export async function todayReminders(
  env: Env,
  devices: { record: { pushToken: string; today?: TodayWatch } }[],
  now: number,
): Promise<{ messages: TodayPush[]; changed: Set<number> }> {
  const messages: TodayPush[] = [];
  const changed = new Set<number>();
  const progressCache = new Map<number, DutyProgress | null>();
  for (const [index, { record }] of devices.entries()) {
    const watch = record.today;
    if (!watch) continue;
    for (const section of ['daily', 'weekly'] as const) {
      if (!watch[section]) continue;
      const reset = nextReset(SECTION_RESET[section], now);
      if (now < reset - watch.lead * 60_000 || watch.sent[section] === reset) continue;
      watch.sent[section] = reset;
      changed.add(index);
      // Téléphone retiré depuis le plugin : plus rien n'est lu pour lui.
      if (!(await isPaired(env, watch.characterId, watch.tokenHash))) {
        record.today = undefined;
        break;
      }
      if (!progressCache.has(watch.characterId)) {
        const snapshot = await readPrivate<{ duties?: DutyProgress }>(env, watch.characterId);
        progressCache.set(watch.characterId, snapshot?.duties ?? null);
      }
      const left = remainingBefore(section, watch.tracked, progressCache.get(watch.characterId), watch.checked, now);
      if (left.length === 0) continue;
      messages.push({
        to: record.pushToken,
        title: `${TITLES[section]} dans ${inHours(Math.round((reset - now) / 600_000) * 10 || watch.lead)}`,
        body: `Il te reste : ${remainingText(left)}.`,
        sound: 'default',
        data: { url: '/today' },
      });
    }
  }
  return { messages, changed };
}
