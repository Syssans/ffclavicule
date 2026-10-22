/** Collections : éléments manquants, provenances, objets de collection déjà en poche. */
import type { CatalogCollection, CatalogEntry, CollectionCatalog, ItemStack, PrivateSnapshot } from '@/api/private';
import { fold } from '@/utils/inventory';

/** Noms français des provenances (repris de FFXIV Collect). */
export const SOURCE_LABELS: Record<string, string> = {
  achievement: 'Hauts faits',
  crafting: 'Artisanat',
  purchase: 'Achetable',
  'gold-saucer': 'Gold Saucer',
  pvp: 'JcJ',
  hunts: 'Chasse',
  fate: 'ALEA',
  skybuilders: 'Azurée',
  'wondrous-tails': 'Aventures imaginaires',
  island: 'Félicité insulaire',
  'vc-dungeon': 'Donjon à embranchements',
  quest: 'Quête',
  event: 'Événement saisonnier',
  premium: 'Boutique en ligne',
  dungeon: 'Donjon',
  trial: 'Défi',
  raid: 'Raid',
  other: 'Autre',
};

export function sourceLabel(type: string): string {
  return SOURCE_LABELS[type] ?? 'Autre';
}

/** Où se trouve chaque objet : « Sacs », « Servant Alpha », « Servant Alpha (en vente) »… */
export function itemPlaces(snapshot: PrivateSnapshot | null | undefined): Map<number, string[]> {
  const places = new Map<number, string[]>();
  const add = (stacks: ItemStack[] | undefined, place: string) =>
    stacks?.forEach((s) => {
      // Les objets HQ n'existent pas pour les objets de collection, mais on ne sait jamais.
      const list = places.get(s.id) ?? [];
      if (!list.includes(place)) list.push(place);
      places.set(s.id, list);
    });
  snapshot?.inventories.forEach((g) => add(g.items, g.label));
  snapshot?.retainers.forEach((r) => {
    add(r.items, r.name);
    add(r.market, `${r.name} (en vente)`);
  });
  return places;
}

/** Identifiants possédés d'une collection, d'après le relevé du jeu. */
export function ownedIds(snapshot: PrivateSnapshot | null | undefined, key: string): Set<number> {
  return new Set(snapshot?.collections?.find((c) => c.key === key)?.owned.map((o) => o.id) ?? []);
}

export function missingEntries(collection: CatalogCollection | undefined, owned: Set<number>): CatalogEntry[] {
  return (collection?.items ?? []).filter((e) => !owned.has(e.id));
}

export type MissingFilter = 'all' | 'market' | 'inventory' | `source:${string}`;

/** Filtre les éléments manquants (provenance, au marché, déjà en poche) et cherche dans leur nom. */
export function filterEntries(entries: CatalogEntry[], filter: MissingFilter, search: string, places: Map<number, string[]>): CatalogEntry[] {
  const needle = fold(search.trim());
  return entries
    .filter((e) => {
      if (filter === 'market') return e.tradeable;
      if (filter === 'inventory') return e.item !== undefined && places.has(e.item);
      if (filter.startsWith('source:')) return e.sources.some((s) => s.type === filter.slice(7));
      return true;
    })
    .filter((e) => !needle || fold(e.name).includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Provenances présentes parmi des éléments, les plus fréquentes d'abord. */
export function sourceCounts(entries: CatalogEntry[]): { type: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const type of new Set(e.sources.map((s) => s.type))) counts.set(type, (counts.get(type) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

export interface UsableItem {
  key: string;
  label: string;
  entry: CatalogEntry;
  places: string[];
}

/** Objets de collection que le personnage a déjà (sacs, servants) mais n'a pas encore utilisés. */
export function usableItems(catalog: CollectionCatalog | null | undefined, snapshot: PrivateSnapshot | null | undefined): UsableItem[] {
  if (!catalog || !snapshot?.collections) return [];
  const places = itemPlaces(snapshot);
  const found: UsableItem[] = [];
  for (const collection of catalog.collections) {
    const owned = ownedIds(snapshot, collection.key);
    for (const entry of missingEntries(collection, owned)) {
      const where = entry.item !== undefined ? places.get(entry.item) : undefined;
      if (where) found.push({ key: collection.key, label: collection.label, entry, places: where });
    }
  }
  return found.sort((a, b) => a.entry.name.localeCompare(b.entry.name, 'fr'));
}
