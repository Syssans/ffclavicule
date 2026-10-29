/**
 * La Légende : le lore du jeu (src/data/lore.json, voir scripts/update-lore-data.mjs). Fiches de personnages, lieux,
 * chroniques (donjons, défis, raids), montures et mascottes, reliées entre elles par les noms que citent leurs textes.
 */
import { gameIconUrl } from '@/api/xivapi';
import { MenuIcons } from '@/constants/menu-icons';
import { CODEX, type CodexParagraph } from '@/data/lore-codex';
import { parseQuery, rankMatches, searchKey } from '@/utils/search';

export type LoreType = 'perso' | 'lieu' | 'notion' | 'recit' | 'monture' | 'mascotte';

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
  /** Objet qui débloque cette monture, mascotte ou carte. */
  o?: number;
  // ——— Fiches du codex (src/data/lore-codex.ts) ———
  /** Article : paragraphes, chacun avec l'extension qu'il dévoile. */
  b?: CodexParagraph[];
  /** Liens de chaque paragraphe. */
  lb?: LoreLink[][];
  /** Autres noms. */
  aka?: string[];
  /** Cartes de Triple Triade regroupées (portraits et citations). */
  cards?: string[];
  /** Fiches à lire ensuite. */
  see?: string[];
  /** Carte du jeu du lieu. */
  map?: number;
  /** Image par adresse (carte du lieu), quand la fiche n'a pas d'icône du jeu. */
  u?: string;
  /** Catégorie de l'image (celle de la fiche qui la prête), pour la cadrer. */
  it?: LoreType;
}

interface LoreFile {
  updatedAt: string;
  entries: LoreEntry[];
  /** Objet -> fiche de ce qu'il débloque. */
  items?: Record<string, string>;
}

export const EXPANSIONS = ['A Realm Reborn', 'Heavensward', 'Stormblood', 'Shadowbringers', 'Endwalker', 'Dawntrail'];
export const LAST_EXPANSION = EXPANSIONS.length - 1;

export const LORE_TYPES: Record<LoreType, { label: string; plural: string; icon: number; tagline: string }> = {
  perso: { label: 'Personnage', plural: 'Personnages', icon: MenuIcons.personnage, tagline: 'Héros, ennemis et légendes, avec leurs mots' },
  lieu: { label: 'Lieu', plural: 'Lieux', icon: MenuIcons.carte, tagline: 'Cités, terres et panoramas du carnet d’exploration' },
  notion: { label: 'Notion', plural: 'Notions', icon: MenuIcons.journal, tagline: 'Factions, peuples et grands événements' },
  recit: { label: 'Chronique', plural: 'Chroniques', icon: MenuIcons.bestiaire, tagline: 'Ce qui se joue dans chaque donjon, défi et raid' },
  monture: { label: 'Monture', plural: 'Montures', icon: MenuIcons.montures, tagline: 'L’histoire de chaque monture' },
  mascotte: { label: 'Mascotte', plural: 'Mascottes', icon: MenuIcons.mascottes, tagline: 'Les petites histoires des mascottes' },
};
export const LORE_ORDER: LoreType[] = ['perso', 'lieu', 'notion', 'recit', 'monture', 'mascotte'];

let cache: {
  file: LoreFile;
  /** Toutes les fiches visibles (les cartes regroupées dans une fiche du codex n'y sont plus). */
  all: LoreEntry[];
  byKey: Map<string, LoreEntry>;
  byType: Map<LoreType, LoreEntry[]>;
  backlinks: Map<string, string[]>;
} | null = null;

const MAP_IMAGE = (image: string) => `https://v2.xivapi.com/api/asset/map/${image}`;

function load() {
  if (cache) return cache;
  const file = require('@/data/lore.json') as LoreFile;
  const raw = new Map(file.entries.map((e) => [e.k, e]));

  // Fiches du codex : elles prennent l'image et la première citation des cartes qu'elles regroupent.
  const absorbed = new Map<string, string>();
  const byMap = new Map<string, string>();
  // Panoramas du carnet d'exploration par carte : ils illustrent les lieux du codex.
  const vistaByMap = new Map<number, LoreEntry>();
  for (const e of file.entries) if (e.t === 'lieu' && e.m && !vistaByMap.has(e.m[0])) vistaByMap.set(e.m[0], e);
  const codex: LoreEntry[] = CODEX.map((c) => {
    for (const card of c.cards ?? []) absorbed.set(card, c.k);
    if (c.map) for (const m of [c.map, ...(c.also ?? [])]) byMap.set(`map:${m}`, c.k);
    const vista = c.map ? [c.map, ...(c.also ?? [])].map((m) => vistaByMap.get(m)).find(Boolean) : undefined;
    const source = raw.get(c.img ?? c.cards?.[0] ?? '') ?? vista;
    const firstCard = raw.get(c.cards?.[0] ?? '');
    const mapImage = !source && c.map ? (require('@/data/map.json') as { maps: Record<string, { i: string }> }).maps[String(c.map)]?.i : undefined;
    return {
      k: c.k,
      t: c.t,
      n: c.n,
      s: c.s,
      v: c.v,
      e: firstCard?.e ?? null,
      i: source?.i ?? 0,
      u: mapImage ? MAP_IMAGE(mapImage) : undefined,
      it: source?.t ?? (mapImage ? 'lieu' : undefined),
      b: c.b,
      aka: c.aka,
      cards: c.cards,
      see: c.see,
      map: c.map,
    };
  });

  // Les mentions d'une carte regroupée ou d'un lieu du codex mènent à sa fiche.
  const retarget = (links?: LoreLink[]) =>
    links?.map(([at, length, target]): LoreLink => [at, length, absorbed.get(target) ?? byMap.get(target) ?? target]);
  const kept = file.entries.filter((e) => !absorbed.has(e.k)).map((e) => ({ ...e, lx: retarget(e.lx), le: retarget(e.le) }));
  const all = [...codex, ...kept];
  const byKey = new Map(all.map((e) => [e.k, e]));
  for (const [card, key] of absorbed) byKey.set(card, byKey.get(key)!);
  cache = { file, all, byKey, byType: new Map(), backlinks: new Map() };

  // Liens des articles du codex : les noms des autres fiches qu'ils citent.
  for (const e of codex) e.lb = e.b?.map(([, text]) => linkify(text).filter(([, , target]) => target !== e.k));

  for (const e of all) {
    cache.byType.set(e.t, [...(cache.byType.get(e.t) ?? []), e]);
    for (const [, , target] of [...(e.lx ?? []), ...(e.le ?? []), ...(e.lb ?? []).flat()]) {
      const list = cache.backlinks.get(target) ?? [];
      if (!list.includes(e.k)) list.push(e.k);
      cache.backlinks.set(target, list);
    }
  }
  return cache;
}

export function loreEntry(key: string): LoreEntry | undefined {
  return load().byKey.get(key);
}

export function loreEntries(type: LoreType): LoreEntry[] {
  return load().byType.get(type) ?? [];
}

export function loreCount(): number {
  return load().all.length;
}

/** Cartes de Triple Triade regroupées dans une fiche du codex (portrait et citation de chacune). */
export function loreCardsOf(entry: LoreEntry): LoreEntry[] {
  const raw = load().file.entries;
  return (entry.cards ?? []).map((k) => raw.find((e) => e.k === k)).filter((e): e is LoreEntry => Boolean(e));
}

/** Fiches dont le texte cite celle-ci (ou une zone, avec « map:<id> »). */
export function loreBacklinks(key: string): LoreEntry[] {
  // Une carte regroupée dans une fiche du codex : les liens vont à la fiche.
  const target = load().byKey.get(key)?.k ?? key;
  return (load().backlinks.get(target) ?? []).map((k) => load().byKey.get(k)!).filter(Boolean);
}

export function loreImage(entry: Pick<LoreEntry, 'i' | 'u'>): string | null {
  return entry.i ? gameIconUrl(entry.i) : (entry.u ?? null);
}

/** Catégorie qui donne le cadrage de l'image d'une fiche (une fiche du codex emprunte celle d'une autre). */
export function imageKind(entry: Pick<LoreEntry, 't' | 'it'>): LoreType {
  return entry.it ?? entry.t;
}

/** Paragraphes d'un article, voilés au-delà de la progression du joueur. */
export function articleParagraphs(entry: LoreEntry, progress: number): { text: string; links?: LoreLink[]; hidden: boolean; v: number }[] {
  return (entry.b ?? []).map(([v, text], i) => ({ text, links: entry.lb?.[i], hidden: v > progress, v }));
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
  const all = load().all.filter(keep);
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
  const entries = load().all;
  // Le nom d'abord, puis les autres noms (« Hadès » trouve Emet-Selch).
  const named = rankMatches(entries, (e) => searchKey([e.n, ...(e.aka ?? [])].join(' ')), query);
  const seen = new Set(named.map((e) => e.k));
  const textOf = (e: LoreEntry) => `${e.x ?? ''} ${e.e ?? ''} ${(e.b ?? []).map(([, t]) => t).join(' ')}`;
  textIndex ??= new Map(entries.map((e) => [e.k, searchKey(textOf(e))]));
  const mentioned = entries.filter((e) => !seen.has(e.k) && query.words.every((w) => textIndex!.get(e.k)!.includes(w)));
  return [
    ...named.map((entry) => ({ entry, byName: true })),
    ...mentioned.map((entry) => ({ entry, byName: false, snippet: snippetOf(textOf(entry), query.words[0]) })),
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
    // Les fiches du codex d'abord (avec leurs autres noms), puis les personnages et chroniques, puis les zones.
    for (const c of CODEX) for (const name of [c.n, ...(c.aka ?? [])]) add(name, c.k);
    // Une carte regroupée dans une fiche du codex mène à cette fiche.
    for (const e of load().file.entries) if (e.t === 'perso' || e.t === 'recit') add(e.n, load().byKey.get(e.k)?.k ?? e.k);
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

/** Fiche de la Légende de ce qu'un objet débloque (monture, mascotte, carte), s'il y en a une. */
export function loreForItem(itemId: number): LoreEntry | undefined {
  const key = load().file.items?.[String(itemId)];
  return key ? load().byKey.get(key) : undefined;
}

/** Préfixe des fiches de chaque collection du jeu qui a sa catégorie dans la Légende. */
const COLLECTION_PREFIX: Record<string, string> = { mounts: 'm', minions: 'c', cards: 'p' };

/** Fiche d'un élément de collection (monture, mascotte, carte) par son numéro dans le jeu. */
export function loreForCollection(collection: string, id: number): LoreEntry | undefined {
  const prefix = COLLECTION_PREFIX[collection];
  return prefix ? load().byKey.get(`${prefix}${id}`) : undefined;
}
