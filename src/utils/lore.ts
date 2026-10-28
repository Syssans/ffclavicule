/**
 * La Légende : le lore du jeu (src/data/lore.json, voir scripts/update-lore-data.mjs). Fiches de personnages, lieux,
 * chroniques (donjons, défis, raids), montures et mascottes, reliées entre elles par les noms que citent leurs textes.
 */
import { gameIconUrl } from '@/api/xivapi';
import { MenuIcons } from '@/constants/menu-icons';
import { parseQuery, rankMatches, searchKey } from '@/utils/search';

export type LoreType = 'perso' | 'lieu' | 'recit' | 'monture' | 'mascotte';

/** Lien d'un texte : position, longueur, fiche visée (ou « map:<id> » pour une zone de la carte). */
export type LoreLink = [number, number, string];

export interface LoreEntry {
  k: string;
  t: LoreType;
  n: string;
  /** Sous-titre (zone, type de carte, type de chronique…). */
  s?: string | null;
  /** Texte principal. */
  x?: string;
  /** Citation, inscription ou réplique. */
  e?: string | null;
  /** Image (icône du jeu). */
  i: number;
  /** Étoiles d'une carte. */
  r?: number;
  /** Extension (0 A Realm Reborn … 5 Dawntrail). */
  v?: number;
  /** Lieu sur la carte : [carte, x, z] (coordonnées du monde). */
  m?: [number, number, number] | null;
  /** Groupe (type de chronique). */
  g?: string;
  lx?: LoreLink[];
  le?: LoreLink[];
}

interface LoreFile {
  updatedAt: string;
  entries: LoreEntry[];
}

export const EXPANSIONS = ['A Realm Reborn', 'Heavensward', 'Stormblood', 'Shadowbringers', 'Endwalker', 'Dawntrail'];
export const LAST_EXPANSION = EXPANSIONS.length - 1;

export const LORE_TYPES: Record<LoreType, { label: string; plural: string; icon: number; tagline: string }> = {
  perso: { label: 'Personnage', plural: 'Personnages', icon: MenuIcons.personnage, tagline: 'Héros, ennemis et légendes, avec leurs mots' },
  lieu: { label: 'Lieu', plural: 'Lieux', icon: MenuIcons.carte, tagline: 'Les panoramas du carnet d’exploration' },
  recit: { label: 'Chronique', plural: 'Chroniques', icon: MenuIcons.bestiaire, tagline: 'Ce qui se joue dans chaque donjon, défi et raid' },
  monture: { label: 'Monture', plural: 'Montures', icon: MenuIcons.montures, tagline: 'L’histoire de chaque monture' },
  mascotte: { label: 'Mascotte', plural: 'Mascottes', icon: MenuIcons.mascottes, tagline: 'Les petites histoires des mascottes' },
};
export const LORE_ORDER: LoreType[] = ['perso', 'lieu', 'recit', 'monture', 'mascotte'];

let cache: { file: LoreFile; byKey: Map<string, LoreEntry>; byType: Map<LoreType, LoreEntry[]>; backlinks: Map<string, string[]> } | null = null;

function load() {
  if (cache) return cache;
  const file = require('@/data/lore.json') as LoreFile;
  const byKey = new Map(file.entries.map((e) => [e.k, e]));
  const byType = new Map<LoreType, LoreEntry[]>();
  const backlinks = new Map<string, string[]>();
  for (const e of file.entries) {
    byType.set(e.t, [...(byType.get(e.t) ?? []), e]);
    for (const [, , target] of [...(e.lx ?? []), ...(e.le ?? [])]) {
      const list = backlinks.get(target) ?? [];
      if (!list.includes(e.k)) list.push(e.k);
      backlinks.set(target, list);
    }
  }
  cache = { file, byKey, byType, backlinks };
  return cache;
}

export function loreEntry(key: string): LoreEntry | undefined {
  return load().byKey.get(key);
}

export function loreEntries(type: LoreType): LoreEntry[] {
  return load().byType.get(type) ?? [];
}

export function loreCount(): number {
  return load().file.entries.length;
}

/** Fiches dont le texte cite celle-ci (ou une zone, avec « map:<id> »). */
export function loreBacklinks(key: string): LoreEntry[] {
  return (load().backlinks.get(key) ?? []).map((k) => load().byKey.get(k)!).filter(Boolean);
}

export function loreImage(entry: Pick<LoreEntry, 'i'>): string | null {
  return entry.i ? gameIconUrl(entry.i) : null;
}

/** Fiches voisines dans leur catégorie, pour feuilleter comme un livre. */
export function loreNeighbours(entry: LoreEntry): { previous?: LoreEntry; next?: LoreEntry } {
  const list = loreEntries(entry.t);
  const at = list.findIndex((e) => e.k === entry.k);
  return { previous: list[at - 1], next: list[at + 1] };
}

/** Graine stable pour un jour : la découverte du jour et l'ordre des carrousels changent chaque jour. */
export function daySeed(date = new Date()): number {
  return date.getFullYear() * 1000 + Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** Petit générateur pseudo-aléatoire déterministe (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Quelques fiches d'une catégorie, mélangées selon la graine. */
export function lorePick(type: LoreType, count: number, seed: number, keep: (e: LoreEntry) => boolean = () => true): LoreEntry[] {
  const random = seededRandom(seed + type.length * 7919);
  const list = loreEntries(type).filter(keep);
  const out: LoreEntry[] = [];
  const used = new Set<number>();
  while (out.length < Math.min(count, list.length)) {
    const at = Math.floor(random() * list.length);
    if (used.has(at)) continue;
    used.add(at);
    out.push(list[at]);
  }
  return out;
}

/** Une fiche au hasard parmi toutes (ou celles qu'on accepte). */
export function loreRandom(keep: (e: LoreEntry) => boolean = () => true, random = Math.random): LoreEntry {
  const all = load().file.entries.filter(keep);
  return all[Math.floor(random() * all.length)];
}

/** La fiche visée est-elle au-delà de la progression du joueur ? */
export function isSpoiler(entry: Pick<LoreEntry, 'v'>, progress: number): boolean {
  return entry.v !== undefined && entry.v > progress;
}

export interface LoreHit {
  entry: LoreEntry;
  /** Le nom correspond ; sinon, la recherche est trouvée dans le texte. */
  byName: boolean;
  /** Extrait du texte autour de la recherche. */
  snippet?: string;
}

let textIndex: Map<string, string> | null = null;

/** Noms d'abord (les plus proches devant), puis les fiches qui en parlent dans leur texte, avec un extrait. */
export function searchLore(text: string, limit = 60): LoreHit[] {
  const query = parseQuery(text);
  if (query.key.length < 2) return [];
  const entries = load().file.entries;
  const named = rankMatches(entries, (e) => searchKey(e.n), query);
  const seen = new Set(named.map((e) => e.k));
  textIndex ??= new Map(entries.map((e) => [e.k, searchKey(`${e.x ?? ''} ${e.e ?? ''}`)]));
  const mentioned = entries.filter((e) => !seen.has(e.k) && query.words.every((w) => textIndex!.get(e.k)!.includes(w)));
  return [
    ...named.map((entry) => ({ entry, byName: true })),
    ...mentioned.map((entry) => ({ entry, byName: false, snippet: snippetOf(`${entry.x ?? ''} ${entry.e ?? ''}`, query.words[0]) })),
  ].slice(0, limit);
}

/** Phrase du texte qui contient le mot cherché, raccourcie autour de lui. */
export function snippetOf(text: string, word: string): string {
  const key = Array.from(text, (c) => searchKey(c) || ' ').join('');
  const at = key.indexOf(word);
  if (at < 0) return text.slice(0, 120);
  const start = Math.max(0, at - 50);
  const end = Math.min(text.length, at + word.length + 70);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

let linkPatterns: { key: string; re: RegExp }[] | null = null;

/**
 * Liens d'un texte écrit pour l'appli (la chronologie) : noms de personnages, de chroniques et de zones, comme
 * ceux que le script calcule pour les textes du jeu. Le premier passage de chaque nom seulement.
 */
export function linkify(text: string, zones: { id: number; name: string }[] = []): LoreLink[] {
  if (!linkPatterns) {
    const targets = new Map<string, string>();
    const add = (name: string, key: string) => {
      const n = name.replace(/^(le|la|les|l’|l')\s*/i, '').trim();
      if (n.length >= 5 && !targets.has(n)) targets.set(n, key);
    };
    for (const e of load().file.entries) if (e.t === 'perso' || e.t === 'recit') add(e.n, e.k);
    for (const z of zones) add(z.name, `map:${z.id}`);
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    linkPatterns = [...targets.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .map(([n, key]) => ({ key, re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'gu') }));
  }
  const taken: [number, number][] = [];
  const used = new Set<string>();
  const out: LoreLink[] = [];
  for (const { key, re } of linkPatterns) {
    if (used.has(key)) continue;
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    const start = m.index;
    const end = start + m[0].length;
    if (taken.some(([a, b]) => start < b && end > a)) continue;
    taken.push([start, end]);
    used.add(key);
    out.push([start, m[0].length, key]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}
