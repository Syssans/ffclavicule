/**
 * Chasse : marques de chaque zone (rangs B, A, S, SS), points d'apparition, contrats de chasse et délais de
 * réapparition. Données : src/data/hunt.json (voir scripts/update-hunt-data.mjs) et src/data/hunt-notes.ts.
 */
import { RESPAWN, S_RANK_NOTES, SS_RANK_NOTES, type SpawnNote } from '@/data/hunt-notes';
import { canonicalMap, fromGameCoords, getMap, mapForTerritory } from '@/utils/map';

export type HuntRank = 'B' | 'A' | 'S' | 'SS' | 'sbire';

export interface HuntMark {
  /** Nom (BNpcName). */
  n: number;
  r: HuntRank;
}

export interface HuntZone {
  /** Territoire. */
  t: number;
  /** Extension (0 : A Realm Reborn … 5 : Dawntrail). */
  x: number;
  marks: HuntMark[];
}

export interface HuntBill {
  /** Index du type de contrat dans le jeu (celui que lit le plugin). */
  k: number;
  n: string;
  i: number;
  type: 'daily' | 'elite';
  x: number;
  /** Quête qui débloque ces contrats. */
  qn?: string;
  /** Contrats possibles (MobHuntOrder) -> cibles : [cible, victimes demandées]. */
  orders: Record<string, [number, number][]>;
}

export interface HuntTarget {
  n: number;
  i: number;
  /** Carte et lieu-dit. */
  m: number;
  p?: number;
  /** ALÉA où elle apparaît. */
  f?: number;
  /** Positions relevées (coordonnées de carte). */
  c: [number, number][];
}

export interface HuntData {
  source: string;
  updatedAt: string;
  zones: HuntZone[];
  /** Territoire -> points d'apparition [x, y, rangs] (1 B, 2 A, 4 S), en coordonnées de carte. */
  spawns: Record<string, [number, number, number][]>;
  bills: HuntBill[];
  targets: Record<string, HuntTarget>;
  names: Record<string, string>;
  places: Record<string, string>;
}

let cache: HuntData | null = null;
export function huntData(): HuntData {
  cache ??= require('@/data/hunt.json') as HuntData;
  return cache;
}

export const EXPANSION_NAMES = ['A Realm Reborn', 'Heavensward', 'Stormblood', 'Shadowbringers', 'Endwalker', 'Dawntrail'];

/** Nom d'une marque, comme un nom propre (le jeu écrit « griffe des enfers magitek »). */
export function markName(id: number): string {
  const name = huntData().names[String(id)] ?? '';
  return name ? name[0].toLocaleUpperCase('fr-FR') + name.slice(1) : `Marque ${id}`;
}

export function placeName(id: number | undefined): string {
  return id ? (huntData().places[String(id)] ?? '') : '';
}

export function huntZone(territory: number): HuntZone | undefined {
  return huntData().zones.find((z) => z.t === territory);
}

export function zoneName(territory: number): string {
  const mapId = mapForTerritory(territory);
  return (mapId !== undefined ? getMap(mapId)?.n : undefined) ?? `Zone ${territory}`;
}

export function zonesOf(expansion: number): HuntZone[] {
  return huntData().zones.filter((z) => z.x === expansion);
}

/** Marques chassées (sans les sbires de l'événement SS). */
export function mainMarks(zone: HuntZone): HuntMark[] {
  return zone.marks.filter((m) => m.r !== 'sbire');
}

export const RANK_FLAG: Record<'B' | 'A' | 'S', number> = { B: 1, A: 2, S: 4 };

/** Points d'apparition d'une zone, tous ou ceux d'un rang. */
export function spawnPoints(territory: number, rank?: 'B' | 'A' | 'S'): [number, number, number][] {
  const all = huntData().spawns[String(territory)] ?? [];
  return rank ? all.filter((p) => p[2] & RANK_FLAG[rank]) : all;
}

/** Comment faire apparaître le rang S d'une zone. */
export function sRankNote(territory: number): SpawnNote | undefined {
  return S_RANK_NOTES[territory];
}

export function ssRankNote(expansion: number): string | undefined {
  return SS_RANK_NOTES[expansion];
}

export interface RespawnWindow {
  /** Heures après la mort : [au plus tôt, au plus tard]. */
  window: [number, number];
  afterMaintenance?: [number, number];
}

/** Délai de réapparition d'une marque, s'il est connu. */
export function respawnWindow(rank: HuntRank, territory: number): RespawnWindow | null {
  const expansion = huntZone(territory)?.x ?? 0;
  if (rank === 'A') {
    const a = RESPAWN.A;
    return expansion === 0 && a.arr ? { window: a.arr } : { window: a.window, afterMaintenance: a.afterMaintenance };
  }
  if (rank === 'S') {
    const note = S_RANK_NOTES[territory];
    if (note?.window) return { window: note.window, afterMaintenance: note.afterMaintenance };
    // A Realm Reborn : chaque rang S a son propre délai, souvent inconnu.
    return expansion === 0 ? null : { window: RESPAWN.S.window, afterMaintenance: RESPAWN.S.afterMaintenance };
  }
  return null;
}

const HOUR = 3_600_000;

export type WindowState =
  /** Trop tôt : la marque ne peut pas encore revenir. */
  | { kind: 'closed'; opensAt: number; closesAt: number }
  /** Dans la fenêtre : elle peut revenir à tout moment ; `progress` de 0 à 1. */
  | { kind: 'open'; opensAt: number; closesAt: number; progress: number }
  /** Fenêtre passée : elle est sûrement revenue (un rang S attend encore sa condition). */
  | { kind: 'due'; opensAt: number; closesAt: number };

export function windowState(killedAt: number, window: [number, number], now: number): WindowState {
  const opensAt = killedAt + window[0] * HOUR;
  const closesAt = killedAt + window[1] * HOUR;
  if (now < opensAt) return { kind: 'closed', opensAt, closesAt };
  if (now < closesAt) return { kind: 'open', opensAt, closesAt, progress: (now - opensAt) / (closesAt - opensAt) };
  return { kind: 'due', opensAt, closesAt };
}

/** « 84 à 132 h », « 3 h 30 à 4 h 30 ». */
export function hoursText([min, max]: [number, number]): string {
  const h = (v: number) => {
    const whole = Math.floor(v);
    const minutes = Math.round((v - whole) * 60);
    return minutes ? `${whole} h ${String(minutes).padStart(2, '0')}` : `${whole} h`;
  };
  return Number.isInteger(min) && Number.isInteger(max) ? `${min} à ${max} h` : `${h(min)} à ${h(max)}`;
}

// ——— Contrats ———

export function billsOf(expansion: number): HuntBill[] {
  return huntData().bills.filter((b) => b.x === expansion);
}

export function billByIndex(index: number): HuntBill | undefined {
  return huntData().bills.find((b) => b.k === index);
}

export function huntTarget(id: number): HuntTarget | undefined {
  return huntData().targets[String(id)];
}

/** Cibles possibles d'un type de contrat, sans doublon, avec le nombre de victimes demandé le plus courant. */
export function billTargets(bill: HuntBill): { id: number; target: HuntTarget; kills: number }[] {
  const seen = new Map<number, number>();
  for (const order of Object.values(bill.orders)) for (const [id, kills] of order) if (!seen.has(id)) seen.set(id, kills);
  const out: { id: number; target: HuntTarget; kills: number }[] = [];
  for (const [id, kills] of seen) {
    const target = huntTarget(id);
    if (target) out.push({ id, target, kills });
  }
  return out;
}

/** Où chasser une cible : carte et centre de ses positions relevées, en pixels de la carte ; ou null. */
export function targetSpot(target: HuntTarget): { mapId: number; x: number; y: number } | null {
  const mapId = canonicalMap(target.m);
  const map = getMap(mapId);
  if (!map || target.c.length === 0) return null;
  const gx = target.c.reduce((s, c) => s + c[0], 0) / target.c.length;
  const gy = target.c.reduce((s, c) => s + c[1], 0) / target.c.length;
  // La carte attend des pixels, pas les coordonnées du jeu.
  const [x, y] = fromGameCoords(map, gx, gy);
  return { mapId, x, y };
}

/** Nom de la carte d'une cible. */
export function targetMapName(target: HuntTarget): string {
  return getMap(target.m)?.n ?? '';
}

/** Recherche d'une marque par son nom, dans toutes les zones. */
export function findMarks(query: string): { zone: HuntZone; mark: HuntMark }[] {
  const q = fold(query);
  if (!q) return [];
  const out: { zone: HuntZone; mark: HuntMark }[] = [];
  for (const zone of huntData().zones) {
    for (const mark of mainMarks(zone)) if (fold(markName(mark.n)).includes(q)) out.push({ zone, mark });
  }
  return out;
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Icône de point d'apparition sur la carte, selon le rang le plus haut qui peut y paraître. */
export const RANK_ICONS: Record<'B' | 'A' | 'S' | 'SS', number> = { B: 61707, A: 61709, S: 61710, SS: 61712 };

export function spawnIcon(flags: number): number {
  return flags & 4 ? RANK_ICONS.S : flags & 2 ? RANK_ICONS.A : RANK_ICONS.B;
}

export function flagRanks(flags: number): ('B' | 'A' | 'S')[] {
  return (['S', 'A', 'B'] as const).filter((r) => flags & RANK_FLAG[r]);
}

/** Rappels à l'ouverture des fenêtres de réapparition à venir (les plus proches d'abord, au plus `max`). */
export function planHuntReminders(
  kills: readonly { territory: number; mark: number; rank: 'A' | 'S'; at: number; world: string }[],
  now: number,
  max = 4,
): { id: string; title: string; body: string; at: number; url: string; icon: number }[] {
  const out: { id: string; title: string; body: string; at: number; url: string; icon: number }[] = [];
  for (const k of kills) {
    const window = respawnWindow(k.rank, k.territory);
    if (!window) continue;
    const at = k.at + window.window[0] * HOUR;
    if (at <= now) continue;
    out.push({
      id: `chasse-${k.world}-${k.territory}-${k.mark}`.replace(/[^\w-]/g, ''),
      title: `${markName(k.mark)} peut revenir`,
      body: `Rang ${k.rank} · ${zoneName(k.territory)}${k.world ? ` (${k.world})` : ''} : sa fenêtre de réapparition s’ouvre.`,
      at,
      url: `/hunt/zone/${k.territory}`,
      icon: RANK_ICONS[k.rank],
    });
  }
  return out.sort((a, b) => a.at - b.at).slice(0, max);
}

// ——— Morts notées ———

export interface HuntKill {
  territory: number;
  /** Nom de la marque (BNpcName). */
  mark: number;
  rank: 'A' | 'S';
  /** Mort (ms). */
  at: number;
  /** Monde où elle a été tuée (les marques sont propres à chaque monde). */
  world: string;
  source: 'manual' | 'plugin';
}

export const killKey = (k: Pick<HuntKill, 'world' | 'territory' | 'mark'>) => `${k.world}|${k.territory}|${k.mark}`;

/** Au-delà, une mort ne dit plus rien de la fenêtre (même un rang S est revenu depuis longtemps). */
export const FORGET_KILLS_AFTER = 14 * 86_400_000;

/** Morts notées et vues par le plugin, la plus récente de chaque marque et de chaque monde. */
export function mergeKills(manual: Record<string, HuntKill>, seen: readonly HuntKill[], now: number): HuntKill[] {
  const out = new Map<string, HuntKill>();
  for (const k of [...Object.values(manual), ...seen]) {
    if (now - k.at > FORGET_KILLS_AFTER || k.at > now + 60_000) continue;
    const key = killKey(k);
    const prev = out.get(key);
    if (!prev || prev.at < k.at) out.set(key, k);
  }
  return [...out.values()];
}
