/** Données de l'artisanat pour les écrans : recettes et sous-recettes, prix, provenances, inventaire, niveaux. */
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { getRecipe, isCrystal, itemSources, recipesForItems, type Recipe } from '@/api/crafting';
import { getCraftPrices } from '@/api/universalis';
import { useMainCharacter } from '@/components/home';
import { usePrivate } from '@/hooks/use-private';
import { getClassJobs } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { CRAFTERS, makeBook, ownedItems, type RecipeBook } from '@/utils/crafting';

const DAY = 24 * 60 * 60 * 1000;

export function useRecipe(id: number) {
  return useQuery({ queryKey: ['craft', 'recipe', id], queryFn: () => getRecipe(id), enabled: Number.isFinite(id), staleTime: DAY });
}

/** Toutes les sous-recettes utiles à ces recettes, niveau par niveau (jusqu'à 6 étages). */
async function loadSubRecipes(roots: Recipe[]): Promise<Recipe[]> {
  const all = new Map<number, Recipe>(roots.map((r) => [r.id, r]));
  const known = new Set<number>(roots.map((r) => r.itemId));
  let frontier = roots;
  for (let depth = 0; depth < 6 && frontier.length > 0; depth++) {
    const wanted = [...new Set(frontier.flatMap((r) => r.ingredients.map((i) => i.itemId)))].filter((id) => !isCrystal(id) && !known.has(id));
    wanted.forEach((id) => known.add(id));
    if (wanted.length === 0) break;
    const found = await recipesForItems(wanted);
    found.forEach((r) => all.set(r.id, r));
    frontier = found;
  }
  return [...all.values()];
}

/** Livre de recettes (une par objet) pour fabriquer ces recettes de bout en bout. */
export function useRecipeBook(roots: Recipe[]) {
  const key = roots.map((r) => r.id).sort((a, b) => a - b);
  const rootKey = key.join(',');
  const query = useQuery({
    queryKey: ['craft', 'book', key],
    queryFn: () => loadSubRecipes(roots),
    enabled: roots.length > 0,
    staleTime: DAY,
  });
  const preferred = roots[0]?.craftType;
  const book: RecipeBook = useMemo(() => {
    const b = makeBook(query.data ?? [], preferred);
    // Les recettes demandées restent celles choisies, même si un autre artisan en a une.
    roots.forEach((r) => b.set(r.itemId, r));
    return b;
    // rootKey résume les recettes demandées (un nouveau tableau à chaque rendu sinon).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, preferred, rootKey]);
  return { book, query };
}

export function useCraftPrices(itemIds: number[]) {
  const scope = useAppStore((s) => s.marketScope);
  const ids = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ['universalis', 'aggregated', scope, ids],
    queryFn: () => getCraftPrices(scope, ids),
    enabled: ids.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

export function useItemSources(itemIds: number[]) {
  const ids = [...new Set(itemIds)].sort((a, b) => a - b);
  return useQuery({ queryKey: ['craft', 'sources', ids], queryFn: () => itemSources(ids), enabled: ids.length > 0, staleTime: DAY });
}

/** Ce que possède le personnage principal (si le plugin est connecté). */
export function useOwnedItems() {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  const owned = useMemo(() => ownedItems(query.data), [query.data]);
  return { owned, linked: Boolean(link), name: main?.name ?? null, loading: Boolean(link) && query.isPending };
}

export interface CrafterLevel {
  level: number | null;
  exp: number | null;
  maxExp: number | null;
}

/** Niveaux des artisans du personnage principal, lus sur le Lodestone. */
export function useCrafterLevels() {
  const main = useMainCharacter();
  const region = useAppStore((s) => s.region);
  const id = main?.id ?? Number.NaN;
  const query = useQuery({
    queryKey: ['lodestone', 'classjob', region, id],
    queryFn: () => getClassJobs(region, id),
    enabled: Number.isFinite(id),
  });
  const levels = useMemo(() => {
    const out = new Map<number, CrafterLevel>();
    for (const c of CRAFTERS) {
      const j = query.data?.find((x) => x.job.id === c.job.id);
      out.set(c.craftType, { level: j?.level ?? null, exp: j?.exp ?? null, maxExp: j?.maxExp ?? null });
    }
    return out;
  }, [query.data]);
  return { levels, query, character: main };
}
