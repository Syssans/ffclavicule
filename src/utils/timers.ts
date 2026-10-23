/** Heure d'Éorzéa et réinitialisations du jeu (heures UTC fixées par le jeu). */

/** Une heure d'Éorzéa dure 175 secondes réelles (une journée : 70 minutes). */
const EORZEA_RATE = 3600 / 175;

export function eorzeaTime(now = Date.now()): { hours: number; minutes: number } {
  const totalMinutes = Math.floor((now / 1000) * EORZEA_RATE / 60);
  return { hours: Math.floor(totalMinutes / 60) % 24, minutes: totalMinutes % 60 };
}

export function formatEorzeaTime(now = Date.now()): string {
  const { hours, minutes } = eorzeaTime(now);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Prochaine occurrence (en ms) d'une heure UTC donnée, éventuellement un jour de la semaine (0 = dimanche). */
export function nextUtc(now: number, hour: number, weekday?: number): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0);
  let candidate = next;
  if (weekday === undefined) {
    if (candidate <= now) candidate += 86_400_000;
    return candidate;
  }
  const days = (weekday - d.getUTCDay() + 7) % 7;
  candidate += days * 86_400_000;
  if (candidate <= now) candidate += 7 * 86_400_000;
  return candidate;
}

export interface Reset {
  key: string;
  label: string;
  detail: string;
  at: number;
}

/** Réinitialisations utiles au quotidien, de la plus proche à la plus lointaine. */
export function upcomingResets(now = Date.now(), region: 'eu' | 'na' = 'eu'): Reset[] {
  const resets: Reset[] = [
    { key: 'daily', label: 'Quotidienne', detail: 'Défis du jour, tribus, roulettes', at: nextUtc(now, 15) },
    { key: 'gc', label: 'Grande Compagnie', detail: 'Approvisionnement et ravitaillement', at: nextUtc(now, 20) },
    { key: 'weekly', label: 'Hebdomadaire', detail: 'Plafonds de mémoquartz, raids, Aventures imaginaires', at: nextUtc(now, 8, 2) },
    // Tirage du Jumbo Cactpot : samedi 19 h UTC en Europe, dimanche 2 h UTC en Amérique du Nord.
    region === 'eu'
      ? { key: 'cactpot', label: 'Jumbo Cactpot', detail: 'Tirage au Gold Saucer', at: nextUtc(now, 19, 6) }
      : { key: 'cactpot', label: 'Jumbo Cactpot', detail: 'Tirage au Gold Saucer', at: nextUtc(now, 2, 0) },
  ];
  return resets.sort((a, b) => a.at - b.at);
}

/** « 3 h 05 », « 12 min », « 2 j 4 h ». */
export function formatCountdown(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${String(rest).padStart(2, '0')}`;
  return `${rest} min`;
}
