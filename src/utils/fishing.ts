/**
 * Pêche : météo d'Éorzéa (même calcul que le jeu), fenêtres de chaque poisson (heures d'Éorzéa et météo) et
 * calendrier de la pêche en mer. Données : src/data/fishing.json (voir scripts/update-fishing-data.mjs).
 */

// ---------------------------------------------------------------------------
// Données intégrées
// ---------------------------------------------------------------------------

export interface FishEntry {
  id: number;
  /** Coin de pêche (« h12 » pour la pêche au harpon). */
  s: number | string;
  /** Heures d'Éorzéa [début, fin[ ; 0-24 = toute la journée. */
  h: [number, number];
  /** Météos où il mord ; météos de la période précédente exigées. */
  w?: number[];
  pw?: number[];
  /** Appât puis poissons à réutiliser (mooching). */
  b?: number[];
  /** Poissons à attraper avant (intuition) : [id, nombre]. */
  p?: [number, number][];
  il?: number;
  hk?: string;
  tg?: string;
  fl?: number;
  co?: 1;
  fe?: 1;
  big?: 1;
  sn?: 1;
  lu?: string;
  g?: string;
  pt?: number;
}

export interface OceanFish {
  /** Rareté de l'objet (3 : poisson bleu). */
  r: number;
  st?: number;
  /** Moment de la journée exigé : 0 n'importe quand, 1 jour, 2 crépuscule, 3 nuit. */
  t?: number;
  b?: number;
  p?: [number, number][];
}

export interface OceanStop {
  /** Lieu, coin principal, coin du courant spectral, moment de la journée (1 jour, 2 crépuscule, 3 nuit). */
  p: string;
  m: number;
  s: number;
  t: number;
}

export interface FishingData {
  sources: string[];
  updatedAt: string;
  weathers: Record<string, { n: string; i: number }>;
  zones: Record<string, { n: string; r: string; w: [number, number][] }>;
  spots: Record<string, { n: string; t: number; c: [number, number] | null; h?: 1 }>;
  items: Record<string, { n: string; i: number }>;
  folklore: Record<string, string>;
  fish: FishEntry[];
  ocean: {
    indigo: number[];
    ruby: number[];
    routes: Record<string, { n: string; s: OceanStop[] }>;
    spotFish: Record<string, number[]>;
    fish: Record<string, OceanFish>;
  };
}

let cache: FishingData | null = null;
/** Chargé à la première utilisation (environ 200 Ko). */
export function fishingData(): FishingData {
  cache ??= require('@/data/fishing.json') as FishingData;
  return cache;
}

// ---------------------------------------------------------------------------
// Temps d'Éorzéa
// ---------------------------------------------------------------------------

/** Une heure d'Éorzéa dure 175 secondes réelles ; une période de météo, 8 heures d'Éorzéa. */
export const ET_HOUR = 175_000;
export const ET_DAY = 24 * ET_HOUR;
export const WEATHER_PERIOD = 8 * ET_HOUR;

/** Heure d'Éorzéa (avec les minutes en décimales) à un instant réel. */
export function eorzeaHour(ms: number): number {
  return (((ms % ET_DAY) + ET_DAY) % ET_DAY) / ET_HOUR;
}

export function periodStart(ms: number): number {
  return Math.floor(ms / WEATHER_PERIOD) * WEATHER_PERIOD;
}

/** Nombre de 0 à 99 qui décide de la météo d'une période, comme le jeu (le même pour toutes les zones). */
export function forecastTarget(ms: number): number {
  const unix = Math.floor(ms / 1000);
  const bell = Math.floor(unix / 175);
  const increment = (bell + 8 - (bell % 8)) % 24;
  const totalDays = Math.floor(unix / 4200) >>> 0;
  const base = totalDays * 100 + increment;
  const step1 = ((base << 11) ^ base) >>> 0;
  const step2 = ((step1 >>> 8) ^ step1) >>> 0;
  return step2 % 100;
}

/** Météo d'une zone à un instant (identifiant de météo), d'après ses taux cumulés. */
export function weatherAt(rates: [number, number][], ms: number): number {
  const target = forecastTarget(ms);
  return (rates.find(([, cumul]) => target < cumul) ?? rates[rates.length - 1])?.[0] ?? 0;
}

export interface WeatherPeriod {
  start: number;
  weather: number;
}

/** Prévisions d'une zone : la période en cours puis les suivantes. */
export function forecast(rates: [number, number][], now: number, count: number): WeatherPeriod[] {
  const first = periodStart(now);
  return Array.from({ length: count }, (_, i) => {
    const start = first + i * WEATHER_PERIOD;
    return { start, weather: weatherAt(rates, start) };
  });
}

// ---------------------------------------------------------------------------
// Fenêtres de pêche
// ---------------------------------------------------------------------------

export interface Window {
  start: number;
  end: number;
}

/** Intervalles d'heures d'Éorzéa [début, fin[ d'une plage qui peut passer minuit. */
function hourRanges([start, end]: [number, number]): [number, number][] {
  if ((start === 0 && end === 24) || start === end) return [[0, 24]];
  return start < end ? [[start, end]] : [[start, 24], [0, end]];
}

export function alwaysAvailable(fish: FishEntry): boolean {
  return !fish.w?.length && !fish.pw?.length && hourRanges(fish.h)[0][1] - hourRanges(fish.h)[0][0] === 24;
}

/**
 * Prochaines fenêtres où le poisson peut mordre (heure et météo réunies), à partir de `now` (une fenêtre en cours
 * est incluse). Les périodes qui se suivent sont réunies en une seule fenêtre.
 */
export function nextWindows(fish: FishEntry, rates: [number, number][] | undefined, now: number, count = 3, maxPeriods = 15000): Window[] {
  const ranges = hourRanges(fish.h);
  const weatherOk = (ms: number) => !fish.w?.length || (rates ? fish.w.includes(weatherAt(rates, ms)) : false);
  const previousOk = (ms: number) => !fish.pw?.length || (rates ? fish.pw.includes(weatherAt(rates, ms - WEATHER_PERIOD)) : false);
  const windows: Window[] = [];
  let p = periodStart(now);
  for (let i = 0; i < maxPeriods && windows.length <= count; i++, p += WEATHER_PERIOD) {
    if (!weatherOk(p) || !previousOk(p)) continue;
    const h0 = Math.round(eorzeaHour(p));
    for (const [a, b] of ranges) {
      const from = Math.max(a, h0);
      const to = Math.min(b, h0 + 8);
      if (from >= to) continue;
      const start = p + (from - h0) * ET_HOUR;
      const end = p + (to - h0) * ET_HOUR;
      if (end <= now) continue;
      const last = windows[windows.length - 1];
      if (last && last.end === start) last.end = end;
      else windows.push({ start, end });
    }
  }
  // La dernière fenêtre peut encore se prolonger : on n'en rend que `count`, toutes complètes.
  return windows.slice(0, count);
}

export type FishStatus = { kind: 'always' } | { kind: 'open'; until: number } | { kind: 'soon'; at: number } | { kind: 'unknown' };

export function fishStatus(fish: FishEntry, rates: [number, number][] | undefined, now: number): FishStatus {
  if (alwaysAvailable(fish)) return { kind: 'always' };
  const [next] = nextWindows(fish, rates, now, 1);
  if (!next) return { kind: 'unknown' };
  return next.start <= now ? { kind: 'open', until: next.end } : { kind: 'soon', at: next.start };
}

// ---------------------------------------------------------------------------
// Pêche en mer
// ---------------------------------------------------------------------------

/** Un départ toutes les 2 heures, aux heures paires UTC ; inscriptions pendant 15 minutes. */
export const VOYAGE_INTERVAL = 7_200_000;
export const BOARDING = 15 * 60_000;

export type OceanLine = 'indigo' | 'ruby';

/** Itinéraire d'un départ : cycle de 144 départs, décalé de 88 (Limsa Lominsa) ou de 136 (Kugane). */
export function routeOf(line: OceanLine, departure: number, data: Pick<FishingData['ocean'], 'indigo' | 'ruby'>): number {
  const n = Math.floor(departure / VOYAGE_INTERVAL);
  return line === 'indigo' ? data.indigo[(88 + n) % 144] : data.ruby[(136 + n) % 144];
}

export interface Voyage {
  departure: number;
  route: number;
  /** Inscriptions ouvertes en ce moment. */
  boarding: boolean;
}

export function upcomingVoyages(line: OceanLine, now: number, count: number, data: Pick<FishingData['ocean'], 'indigo' | 'ruby'>): Voyage[] {
  const current = Math.floor(now / VOYAGE_INTERVAL) * VOYAGE_INTERVAL;
  const first = now - current < BOARDING ? current : current + VOYAGE_INTERVAL;
  return Array.from({ length: count }, (_, i) => {
    const departure = first + i * VOYAGE_INTERVAL;
    return { departure, route: routeOf(line, departure, data), boarding: now >= departure && now - departure < BOARDING };
  });
}

export const TIME_OF_DAY: Record<number, string> = { 0: 'N’importe quand', 1: 'Jour', 2: 'Crépuscule', 3: 'Nuit' };

/** Poissons d'une escale : ceux du coin et ceux du courant spectral, avec ce qui mord au moment de l'escale. */
export function stopFish(stop: OceanStop, data: FishingData['ocean']) {
  const describe = (id: number, spectral: boolean) => {
    const info = data.fish[id] ?? { r: 1 };
    const time = info.t ?? 0;
    return { id, spectral, blue: info.r >= 3, stars: info.st ?? 0, time, active: time === 0 || time === stop.t, info };
  };
  return [...(data.spotFish[stop.m] ?? []).map((id) => describe(id, false)), ...(data.spotFish[stop.s] ?? []).map((id) => describe(id, true))];
}
