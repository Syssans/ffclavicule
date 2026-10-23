/**
 * Instantané de FFXIV Collect intégré à l'appli (src/data/collect-reference.json, voir
 * scripts/update-collect-reference.mjs) : provenances saisies par leur communauté et part des joueurs qui
 * possèdent chaque élément. Aucun appel à leur site pendant l'utilisation.
 */
import type { CatalogEntry, CatalogSource } from '@/api/private';
import { fold } from '@/utils/inventory';

/** i : id du jeu, n : nom, t : objet qui le débloque, o : % de joueurs, s : provenances [type, texte]. */
export interface ReferenceEntry {
  i: number;
  n: string;
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
