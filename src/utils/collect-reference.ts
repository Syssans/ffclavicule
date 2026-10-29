/**
 * Instantané de FFXIV Collect intégré à l'appli (src/data/collect-reference.json, voir
 * scripts/update-collect-reference.mjs) : provenances saisies par leur communauté et part des joueurs qui
 * possèdent chaque élément. Aucun appel à leur site pendant l'utilisation.
 */
import type { CatalogEntry, CatalogSource } from '@/api/private';
import { fold } from '@/utils/inventory';

/** i : id du jeu, n : nom, t : objet qui le débloque, o : % de joueurs, s : provenances [type, texte], e : nom anglais (montures, mascottes). */
export interface ReferenceEntry {
  i: number;
  n: string;
  e?: string;
  t?: number;
  o?: number;
  s?: [string, string][];
}

export interface Reference {
  source: string;
  updatedAt: string;
  collections: Record<string, ReferenceEntry[]>;
}

/** Collections dont FFXIV Collect utilise les identifiants du jeu (les autres sont appariées par objet ou par nom). */
const SAME_IDS = new Set(['mounts', 'minions', 'orchestrions', 'emotes', 'bardings', 'fashions', 'cards', 'titles']);

export interface ReferenceIndex {
  key: string;
  byId: Map<number, ReferenceEntry>;
  byItem: Map<number, ReferenceEntry>;
  byName: Map<string, ReferenceEntry>;
}

export function indexReference(key: string, entries: ReferenceEntry[] | undefined): ReferenceIndex {
  const index: ReferenceIndex = { key, byId: new Map(), byItem: new Map(), byName: new Map() };
  for (const e of entries ?? []) {
    index.byId.set(e.i, e);
    if (e.t) index.byItem.set(e.t, e);
    index.byName.set(fold(e.n), e);
  }
  return index;
}

/** Fiche FFXIV Collect d'un élément : même objet, sinon même identifiant (et même nom si besoin), sinon même nom. */
export function findReference(index: ReferenceIndex, entry: { id: number; name: string; item?: number }): ReferenceEntry | undefined {
  if (entry.item !== undefined) {
    const byItem = index.byItem.get(entry.item);
    if (byItem) return byItem;
  }
  const byId = index.byId.get(entry.id);
  if (byId && (SAME_IDS.has(index.key) || fold(byId.n) === fold(entry.name))) return byId;
  return index.byName.get(fold(entry.name));
}

export interface Enriched extends CatalogEntry {
  /** Part des joueurs suivis par FFXIV Collect qui le possèdent (0 à 100). */
  rarity?: number;
}

/**
 * Provenances : celles de FFXIV Collect quand elles existent (plus complètes : butins, boutique en ligne…),
 * sinon celles que le plugin a tirées des données du jeu (utiles pour ce qui vient de sortir).
 */
export function enrich(index: ReferenceIndex, entry: CatalogEntry): Enriched {
  const ref = findReference(index, entry);
  const sources: CatalogSource[] = ref?.s?.length ? ref.s.map(([type, text]) => ({ type, text })) : entry.sources;
  return { ...entry, sources, rarity: ref?.o };
}

let cache: Reference | null = null;

/** Chargé à la première utilisation seulement (le fichier pèse près d'un mégaoctet). */
export function loadReference(): Reference {
  cache ??= require('@/data/collect-reference.json') as Reference;
  return cache;
}

export function formatRarity(rarity: number | undefined): string | undefined {
  if (rarity === undefined) return undefined;
  return `${rarity < 1 ? rarity.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : Math.round(rarity)} %`;
}

/** Élément lu sur le Lodestone, traduit et complété par FFXIV Collect quand on le retrouve. */
export interface LodestoneEntry {
  id: number | null;
  name: string;
  icon: string | null;
  rarity?: number;
  sources: CatalogSource[];
}

/** Le Lodestone donne les noms anglais : on les retrouve dans la référence pour le nom français, la provenance et la rareté. */
export function matchLodestone(key: 'mounts' | 'minions', items: { name: string; icon: string | null }[]): LodestoneEntry[] {
  const byEnglish = new Map<string, ReferenceEntry>();
  for (const e of loadReference().collections[key] ?? []) if (e.e) byEnglish.set(fold(e.e), e);
  return items.map((item) => {
    const ref = byEnglish.get(fold(item.name));
    return {
      id: ref?.i ?? null,
      name: ref?.n ?? item.name,
      icon: item.icon,
      rarity: ref?.o,
      sources: (ref?.s ?? []).map(([type, text]) => ({ type, text })),
    };
  });
}

/** Nombre d'éléments de la collection selon FFXIV Collect. */
export function referenceTotal(key: string): number {
  return loadReference().collections[key]?.length ?? 0;
}

/** Nom de chaque collection de la référence, au singulier (« Monture »). */
export const COLLECTION_LABELS: Record<string, string> = {
  mounts: 'Monture',
  minions: 'Mascotte',
  orchestrions: 'Rouleau d’orchestrion',
  emotes: 'Emote',
  hairstyles: 'Coiffure',
  bardings: 'Barde de chocobo',
  fashions: 'Accessoire de mode',
  facewear: 'Accessoire de visage',
  cards: 'Carte de Triple Triade',
  spells: 'Sort de mage bleu',
  titles: 'Titre',
  armoire: 'Armoire',
};

let byItem: Map<number, { collection: string; entry: ReferenceEntry }> | null = null;

/** Élément de collection que débloque un objet (monture, mascotte, rouleau…), s'il y en a un. */
export function referenceForItem(itemId: number): { collection: string; entry: ReferenceEntry } | undefined {
  if (!byItem) {
    byItem = new Map();
    for (const [collection, entries] of Object.entries(loadReference().collections)) {
      for (const entry of entries) if (entry.t && !byItem.has(entry.t)) byItem.set(entry.t, { collection, entry });
    }
  }
  return byItem.get(itemId);
}

/** Élément d'une collection par son numéro dans le jeu (montures, mascottes, cartes : mêmes numéros que le jeu). */
export function referenceFor(collection: string, id: number): ReferenceEntry | undefined {
  return loadReference().collections[collection]?.find((e) => e.i === id);
}

/** Degré de rareté, d'après la part des joueurs qui possèdent l'élément. */
export function rarityTier(rarity: number): { label: string; tone: 'down' | 'accent' | 'up' | 'neutral' } {
  if (rarity < 5) return { label: 'Très rare', tone: 'down' };
  if (rarity < 15) return { label: 'Rare', tone: 'accent' };
  if (rarity < 40) return { label: 'Peu commun', tone: 'neutral' };
  return { label: 'Commun', tone: 'up' };
}
