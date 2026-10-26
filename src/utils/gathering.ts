/**
 * Récolte : points de récolte (métier, niveau, zone, coordonnées, objets) et fenêtres des points à horaires
 * (légendaires, immaculés, éphémères). Données : src/data/gathering.json (voir scripts/update-gathering-data.mjs).
 */
import { ET_DAY, ET_HOUR, type Window } from '@/utils/fishing';

export interface GatheringNode {
  /** Base du point (métier, niveau, objets) et zone. */
  b: number;
  /** Type de récolte : 0 minage, 1 extraction, 2 coupe, 3 fauche. */
  j: number;
  l: number;
  /** Type de point : 2 immaculé, 4 éphémère, 5 légendaire ; autre : ordinaire. */
  t: number;
  z: number;
  p: string;
  /** Objets (identifiants GatheringItem). */
  it: number[];
  /** Coordonnées sur la carte. */
  c?: [number, number];
  /** Apparitions : [début, durée] en minutes d'Éorzéa. */
  ti?: [number, number][];
  /** Point éphémère : [début, fin] en minutes d'Éorzéa. */
  e?: [number, number];
  /** Livre de légendes exigé. */
  fl?: string;
}

export interface GatheringData {
  source: string;
  updatedAt: string;
  zones: Record<string, { n: string; r: string }>;
  items: Record<string, { n: string; i: number; m?: 1 }>;
  /** GatheringItem -> [objet, niveau, étoiles, caché]. */
  gitems: Record<string, [number, number, number, number]>;
  nodes: GatheringNode[];
}

let cache: GatheringData | null = null;
export function gatheringData(): GatheringData {
  cache ??= require('@/data/gathering.json') as GatheringData;
  return cache;
}

export type GathererJob = 'miner' | 'botanist';

export function jobOf(node: GatheringNode): GathererJob {
  return node.j <= 1 ? 'miner' : 'botanist';
}

/** Classes du jeu : Mineur 16, Botaniste 17. */
export const GATHERER_CLASS: Record<GathererJob, number> = { miner: 16, botanist: 17 };
export const GATHERER_NAME: Record<GathererJob, string> = { miner: 'Mineur', botanist: 'Botaniste' };

export type NodeKind = 'legendary' | 'unspoiled' | 'ephemeral' | 'regular';

export function kindOf(node: GatheringNode): NodeKind {
  if (node.t === 5) return 'legendary';
  if (node.t === 2) return 'unspoiled';
  if (node.t === 4 || node.e) return 'ephemeral';
  return 'regular';
}

export const KIND_LABEL: Record<NodeKind, string> = {
  legendary: 'Légendaire',
  unspoiled: 'Immaculé',
  ephemeral: 'Éphémère',
  regular: 'Ordinaire',
};

/** Le Diadème : zone à part (objets de restauration), hors du carnet de récolte habituel. */
export function isDiadem(node: GatheringNode): boolean {
  return gatheringData().zones[String(node.z)]?.n === 'Le Diadème';
}

/** Objet du carnet de récolte : récoltable ailleurs qu'au Diadème. */
export function inGatheringLog(item: GatherableItem): boolean {
  return item.nodes.some((n) => !isDiadem(n));
}

export function isTimed(node: GatheringNode): boolean {
  return Boolean(node.ti?.length || node.e);
}

export function nodeKey(node: GatheringNode): string {
  return `${node.b}-${node.z}`;
}

const ET_MINUTE = ET_HOUR / 60;

/** Prochaines fenêtres d'un point à horaires, à partir de `now` (une fenêtre en cours est incluse). */
export function nodeWindows(node: GatheringNode, now: number, count = 3): Window[] {
  const spans: [number, number][] = node.ti?.length
    ? node.ti.map(([start, duration]) => [start, start + duration])
    : node.e
      ? [[node.e[0], node.e[1] > node.e[0] ? node.e[1] : node.e[1] + 24 * 60]]
      : [];
  if (spans.length === 0) return [];
  const windows: Window[] = [];
  const firstDay = Math.floor(now / ET_DAY) * ET_DAY - ET_DAY;
  for (let day = firstDay; windows.length < count; day += ET_DAY) {
    for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
      const start = day + from * ET_MINUTE;
      const end = day + to * ET_MINUTE;
      if (end > now) windows.push({ start, end });
    }
    if (day > now + 30 * ET_DAY) break;
  }
  return windows.sort((a, b) => a.start - b.start).slice(0, count);
}

export type NodeStatus = { kind: 'always' } | { kind: 'open'; until: number } | { kind: 'soon'; at: number };

export function nodeStatus(node: GatheringNode, now: number): NodeStatus {
  const [next] = nodeWindows(node, now, 1);
  if (!next) return { kind: 'always' };
  return next.start <= now ? { kind: 'open', until: next.end } : { kind: 'soon', at: next.start };
}

/** Heures d'Éorzéa lisibles d'un point : « 8:00 et 20:00 · 2 h ». */
export function scheduleText(node: GatheringNode): string | null {
  const time = (minutes: number) => `${Math.floor(minutes / 60) % 24}:${String(minutes % 60).padStart(2, '0')}`;
  if (node.ti?.length) {
    const duration = node.ti[0][1];
    return `${node.ti.map(([s]) => time(s)).join(' et ')} · ${duration % 60 ? `${Math.floor(duration / 60)} h ${duration % 60}` : `${duration / 60} h`}`;
  }
  if (node.e) return `${time(node.e[0])} – ${time(node.e[1])}`;
  return null;
}

export interface GatherableItem {
  itemId: number;
  name: string;
  icon: number;
  level: number;
  stars: number;
  hidden: boolean;
  marketable: boolean;
  nodes: GatheringNode[];
}

let index: Map<number, GatherableItem> | null = null;

/** Tous les objets récoltables, avec les points où les trouver. */
export function gatherableItems(): Map<number, GatherableItem> {
  if (index) return index;
  const d = gatheringData();
  const out = new Map<number, GatherableItem>();
  for (const node of d.nodes) {
    for (const g of node.it) {
      const entry = d.gitems[String(g)];
      if (!entry) continue;
      const [itemId, level, stars, hidden] = entry;
      const item = d.items[String(itemId)];
      if (!item) continue;
      const current = out.get(itemId) ?? {
        itemId,
        name: item.n,
        icon: item.i,
        level,
        stars,
        hidden: Boolean(hidden),
        marketable: Boolean(item.m),
        nodes: [],
      };
      if (!current.nodes.includes(node)) current.nodes.push(node);
      current.level = Math.min(current.level || level, level || current.level);
      out.set(itemId, current);
    }
  }
  for (const item of out.values()) item.nodes.sort((a, b) => a.l - b.l);
  index = out;
  return out;
}

/** Objets d'un point, dans l'ordre du jeu. */
export function nodeItems(node: GatheringNode): GatherableItem[] {
  const all = gatherableItems();
  const d = gatheringData();
  return node.it
    .map((g) => d.gitems[String(g)]?.[0])
    .filter((id): id is number => typeof id === 'number')
    .map((id) => all.get(id))
    .filter((i): i is GatherableItem => i !== undefined);
}
