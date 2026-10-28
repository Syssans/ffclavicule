/** Outils pour afficher les données privées : identifiants d'objets, recherche dans tous les rangements. */
import type { ItemStack, PrivateSnapshot } from '@/api/private';
import { searchKey } from '@/utils/search';

/** Tous les objets mentionnés (pour charger leurs noms et icônes en une fois). */
export function allItemIds(snapshot: PrivateSnapshot): number[] {
  const ids = new Set<number>();
  const add = (stacks: ItemStack[] | undefined) => stacks?.forEach((s) => ids.add(s.id));
  snapshot.inventories.forEach((g) => add(g.items));
  snapshot.retainers.forEach((r) => {
    add(r.items);
    add(r.crystals);
    add(r.market);
  });
  snapshot.mail?.letters.forEach((l) => add(l.attachments));
  return [...ids].sort((a, b) => a - b);
}

export interface FoundItem extends ItemStack {
  /** Où se trouve l'objet : « Sacs », « Servant Alpha », « Servant Alpha (en vente) »… */
  place: string;
}

/** Retire les accents, la casse et la ponctuation, pour chercher « epee » et trouver « Épée ». */
export function fold(text: string): string {
  return searchKey(text);
}

/** Objets dont le nom contient tous les mots cherchés, dans l'inventaire, les sacoches et chez les servants. */
export function findItems(snapshot: PrivateSnapshot, names: Map<number, { name: string }>, query: string): FoundItem[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = (id: number) => {
    const name = fold(names.get(id)?.name ?? '');
    return name !== '' && words.every((w) => name.includes(w));
  };
  const found: FoundItem[] = [];
  const add = (stacks: ItemStack[] | undefined, place: string) =>
    stacks?.forEach((s) => {
      if (matches(s.id)) found.push({ ...s, place });
    });
  snapshot.inventories.forEach((g) => add(g.items, g.label));
  snapshot.retainers.forEach((r) => {
    add(r.items, r.name);
    add(r.crystals, r.name);
    add(r.market, `${r.name} (en vente)`);
  });
  return found.sort((a, b) => (names.get(a.id)?.name ?? '').localeCompare(names.get(b.id)?.name ?? '', 'fr'));
}
