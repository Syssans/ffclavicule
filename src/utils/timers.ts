/** Heure d'Éorzéa et réinitialisations du jeu (heures UTC fixées par le jeu). */
import { GameIcons } from '@/constants/game-icons';

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
  /** Icône du jeu. */
  icon: number;
  at: number;
  /** Durée du cycle (ms), pour la barre de progression. */
  period: number;
  /** Ce qui se passe en ce moment (« Inscriptions ouvertes »), le cas échéant. */
  live?: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Réinitialisations et rendez-vous du jeu, du plus proche au plus lointain. */
export function upcomingResets(now = Date.now(), region: 'eu' | 'na' = 'eu'): Reset[] {
  // Pêche en mer : un départ toutes les 2 heures paires (UTC), inscriptions pendant les 15 premières minutes.
  const sinceDeparture = (Math.floor(now / 60_000) % 120) * 60_000 + (now % 60_000);
  const boarding = sinceDeparture < 15 * 60_000;
  const departure = now - sinceDeparture;
  const resets: Reset[] = [
    { key: 'daily', label: 'Quotidienne', detail: 'Roulettes, peuples alliés, chasses', icon: GameIcons.roulettes, at: nextUtc(now, 15), period: DAY },
    { key: 'gc', label: 'Grande Compagnie', detail: 'Approvisionnement et ravitaillement', icon: GameIcons.grandCompany, at: nextUtc(now, 20), period: DAY },
    { key: 'leves', label: 'Mandats', detail: 'Nouvelles autorisations', icon: GameIcons.leves, at: Math.min(nextUtc(now, 0), nextUtc(now, 12)), period: 12 * HOUR },
    { key: 'weekly', label: 'Hebdomadaire', detail: 'Mémoquartz, raids, Aventures imaginaires', icon: GameIcons.calendar, at: nextUtc(now, 8, 2), period: WEEK },
    // Tirage du Jumbo Cactpot : samedi 19 h UTC en Europe, dimanche 2 h UTC en Amérique du Nord.
    {
      key: 'cactpot',
      label: 'Jumbo Cactpot',
      detail: 'Tirage au Gold Saucer',
      icon: GameIcons.goldSaucer,
      at: region === 'eu' ? nextUtc(now, 19, 6) : nextUtc(now, 2, 0),
      period: WEEK,
    },
    { key: 'fashion', label: 'Défilé de mode', detail: 'Ouverture du jugement', icon: GameIcons.fashion, at: nextUtc(now, 8, 5), period: WEEK },
    boarding
      ? { key: 'ocean', label: 'Pêche en mer', detail: 'Embarquement à Limsa Lominsa', icon: GameIcons.ocean, at: departure + 15 * 60_000, period: 15 * 60_000, live: 'Inscriptions ouvertes' }
      : { key: 'ocean', label: 'Pêche en mer', detail: 'Prochain départ de Limsa Lominsa', icon: GameIcons.ocean, at: departure + 2 * HOUR, period: 2 * HOUR },
  ];
  return resets.sort((a, b) => a.at - b.at);
}

/** Part du cycle déjà écoulée (0 à 1). */
export function cycleProgress(reset: Reset, now = Date.now()): number {
  return Math.max(0, Math.min(1, 1 - (reset.at - now) / reset.period));
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
