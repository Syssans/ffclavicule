/**
 * Calculs de l'artisanat, sans réseau : arbre de fabrication, liste de courses (en tenant compte de ce qu'on
 * possède), coût le plus bas en achetant ou en fabriquant chaque étape, bénéfice, et plan de montée en niveau.
 */
import { isCrystal, type CraftLeve, type Recipe } from '@/api/crafting';
import type { PrivateSnapshot } from '@/api/private';
import type { CraftPrice } from '@/api/universalis';
import { JOBS, type Job } from '@/data/jobs';

// ---------------------------------------------------------------------------
// Artisans
// ---------------------------------------------------------------------------

export interface Crafter {
  /** Discipline dans les recettes (0 menuisier … 7 cuisinier). */
  craftType: number;
  job: Job;
}

/** Les huit artisans, dans l'ordre du jeu (classes 8 à 15). */
export const CRAFTERS: Crafter[] = JOBS.filter((j) => j.role === 'crafter')
  .sort((a, b) => a.id - b.id)
  .map((job) => ({ craftType: job.id - 8, job }));

export function crafterOf(craftType: number): Crafter | undefined {
  return CRAFTERS.find((c) => c.craftType === craftType);
}

export const MAX_CRAFTER_LEVEL = 100;

// ---------------------------------------------------------------------------
// Livre de recettes : une recette retenue par objet
// ---------------------------------------------------------------------------

export type RecipeBook = Map<number, Recipe>;

/** Une recette par objet fabriqué : celle de l'artisan préféré s'il en a une, sinon la plus basse en niveau. */
export function makeBook(recipes: Recipe[], preferredCraftType?: number): RecipeBook {
  const book: RecipeBook = new Map();
  for (const r of recipes) {
    const current = book.get(r.itemId);
    const better =
      !current ||
      (r.craftType === preferredCraftType && current.craftType !== preferredCraftType) ||
      (current.craftType !== preferredCraftType && r.level < current.level);
    if (better) book.set(r.itemId, r);
  }
  return book;
}

// ---------------------------------------------------------------------------
// Arbre de fabrication (affichage)
// ---------------------------------------------------------------------------

export interface TreeNode {
  itemId: number;
  name: string;
  icon: string | null;
  /** Quantité nécessaire pour toute la fabrication. */
  quantity: number;
  crystal: boolean;
  /** Recette pour le fabriquer soi-même, et nombre de fabrications. */
  recipe?: Recipe;
  crafts: number;
  children: TreeNode[];
}

const MAX_DEPTH = 6;

/** Arbre complet d'une recette pour `quantity` objets voulus (sans tenir compte de l'inventaire). */
export function craftTree(recipe: Recipe, quantity: number, book: RecipeBook): TreeNode {
  const build = (r: Recipe, wanted: number, depth: number, path: Set<number>): TreeNode => {
    const crafts = Math.ceil(wanted / r.amount);
    const children = [...r.ingredients, ...r.crystals].map((ing) => {
      const total = ing.amount * crafts;
      const sub = isCrystal(ing.itemId) ? undefined : book.get(ing.itemId);
      if (sub && depth < MAX_DEPTH && !path.has(ing.itemId)) {
        return { ...build(sub, total, depth + 1, new Set([...path, ing.itemId])), name: ing.name, icon: ing.icon ?? sub.icon };
      }
      return { itemId: ing.itemId, name: ing.name, icon: ing.icon, quantity: total, crystal: isCrystal(ing.itemId), crafts: 0, children: [] };
    });
    return { itemId: r.itemId, name: r.name, icon: r.icon, quantity: wanted, crystal: false, recipe: r, crafts, children };
  };
  return build(recipe, quantity, 0, new Set([recipe.itemId]));
}

// ---------------------------------------------------------------------------
// Liste de courses
// ---------------------------------------------------------------------------

export interface PlanEntry {
  itemId: number;
  name: string;
  icon: string | null;
  /** Quantité nécessaire au total. */
  need: number;
  /** Prise dans ce qu'on possède déjà. */
  owned: number;
  /** Reste à obtenir (à acheter, récolter… ou à fabriquer pour les étapes). */
  missing: number;
  recipe?: Recipe;
  /** Fabrications à lancer (étapes et objet final). */
  crafts: number;
}

export interface CraftPlan {
  /** Étapes à fabriquer, de la plus profonde à l'objet final compris. */
  steps: PlanEntry[];
  /** Matières premières (ni fabriquées ni cristaux). */
  materials: PlanEntry[];
  crystals: PlanEntry[];
}

/**
 * Ce qu'il faut pour fabriquer plusieurs recettes : chaque objet possédé est utilisé avant d'en fabriquer ou
 * d'en acheter. L'objet final (les recettes demandées) est toujours fabriqué.
 */
export function planCrafts(targets: { recipe: Recipe; quantity: number }[], book: RecipeBook, owned: Map<number, number> = new Map()): CraftPlan {
  const info = new Map<number, { name: string; icon: string | null }>();
  const recipeOf = new Map<number, Recipe>();
  const children = new Map<number, { itemId: number; amount: number }[]>();
  const rootNeed = new Map<number, number>();

  // Graphe des objets atteignables.
  const visit = (r: Recipe, path: Set<number>) => {
    if (recipeOf.has(r.itemId)) return;
    recipeOf.set(r.itemId, r);
    info.set(r.itemId, { name: r.name, icon: r.icon });
    const list: { itemId: number; amount: number }[] = [];
    for (const ing of [...r.ingredients, ...r.crystals]) {
      if (!info.has(ing.itemId)) info.set(ing.itemId, { name: ing.name, icon: ing.icon });
      list.push({ itemId: ing.itemId, amount: ing.amount });
      const sub = isCrystal(ing.itemId) ? undefined : book.get(ing.itemId);
      if (sub && !path.has(ing.itemId) && path.size < MAX_DEPTH) visit(sub, new Set([...path, ing.itemId]));
    }
    children.set(r.itemId, list);
  };
  for (const t of targets) {
    visit(t.recipe, new Set([t.recipe.itemId]));
    recipeOf.set(t.recipe.itemId, t.recipe);
    rootNeed.set(t.recipe.itemId, (rootNeed.get(t.recipe.itemId) ?? 0) + t.quantity);
  }

  // Ordre topologique : un objet passe après tous ceux qui l'utilisent.
  const order: number[] = [];
  const state = new Map<number, 'visiting' | 'done'>();
  const sort = (id: number) => {
    if (state.get(id)) return;
    state.set(id, 'visiting');
    for (const c of children.get(id) ?? []) if (state.get(c.itemId) !== 'visiting') sort(c.itemId);
    state.set(id, 'done');
    order.push(id);
  };
  for (const id of rootNeed.keys()) sort(id);
  order.reverse();

  const need = new Map<number, number>(rootNeed);
  const left = new Map(owned);
  const entries = new Map<number, PlanEntry>();
  for (const id of order) {
    const total = need.get(id) ?? 0;
    if (total <= 0) continue;
    // Les objets demandés sont toujours fabriqués ; seul un surplus (s'il sert aussi d'ingrédient) vient de l'inventaire.
    const reserved = rootNeed.get(id) ?? 0;
    const used = Math.min(left.get(id) ?? 0, Math.max(0, total - reserved));
    left.set(id, (left.get(id) ?? 0) - used);
    const missing = total - used;
    const recipe = children.has(id) ? recipeOf.get(id) : undefined;
    const crafts = recipe ? Math.ceil(missing / recipe.amount) : 0;
    for (const c of recipe ? (children.get(id) ?? []) : []) need.set(c.itemId, (need.get(c.itemId) ?? 0) + c.amount * crafts);
    const meta = info.get(id) ?? { name: `Objet ${id}`, icon: null };
    entries.set(id, { itemId: id, name: meta.name, icon: meta.icon, need: total, owned: used, missing, recipe, crafts });
  }

  const all = order.map((id) => entries.get(id)).filter((e): e is PlanEntry => e !== undefined);
  return {
    steps: all.filter((e) => e.recipe).reverse(),
    materials: all.filter((e) => !e.recipe && !isCrystal(e.itemId)).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    crystals: all.filter((e) => isCrystal(e.itemId)).sort((a, b) => a.itemId - b.itemId),
  };
}

// ---------------------------------------------------------------------------
// Coûts et bénéfice
// ---------------------------------------------------------------------------

export interface UnitCost {
  /** Prix d'achat le plus bas (marché, NQ ou HQ, ou marchand). */
  buy: number | null;
  /** Coût de fabrication avec les ingrédients au mieux. */
  craft: number | null;
  best: number | null;
  choice: 'buy' | 'craft' | null;
}

export function buyPrice(price: CraftPrice | undefined, vendor?: number): number | null {
  const options = [price?.nq.min, price?.hq.min, vendor].filter((p): p is number => typeof p === 'number' && p > 0);
  return options.length ? Math.min(...options) : null;
}

/** Coût unitaire de chaque objet, en choisissant d'acheter ou de fabriquer chaque étape au moins cher. */
export function unitCosts(book: RecipeBook, prices: Map<number, CraftPrice>, vendors: Map<number, number> = new Map()) {
  const memo = new Map<number, UnitCost>();
  const cost = (itemId: number, path: Set<number> = new Set()): UnitCost => {
    const known = memo.get(itemId);
    if (known) return known;
    const buy = buyPrice(prices.get(itemId), vendors.get(itemId));
    const recipe = isCrystal(itemId) ? undefined : book.get(itemId);
    let craft: number | null = null;
    if (recipe && !path.has(itemId) && path.size < MAX_DEPTH) {
      let sum = 0;
      for (const ing of [...recipe.ingredients, ...recipe.crystals]) {
        const unit = cost(ing.itemId, new Set([...path, itemId])).best;
        if (unit === null) {
          sum = Number.NaN;
          break;
        }
        sum += unit * ing.amount;
      }
      craft = Number.isNaN(sum) ? null : sum / recipe.amount;
    }
    const best = buy === null ? craft : craft === null ? buy : Math.min(buy, craft);
    const result: UnitCost = { buy, craft, best, choice: best === null ? null : best === craft && craft !== buy ? 'craft' : 'buy' };
    if (path.size === 0) memo.set(itemId, result);
    return result;
  };
  return cost;
}

/** Coût d'une fabrication de la recette (ingrédients au mieux), et ce que rapporte sa vente. */
export function recipeProfit(recipe: Recipe, cost: (itemId: number) => UnitCost, price: CraftPrice | undefined) {
  let craftCost: number | null = 0;
  for (const ing of [...recipe.ingredients, ...recipe.crystals]) {
    const unit = cost(ing.itemId).best;
    if (unit === null) {
      craftCost = null;
      break;
    }
    craftCost += unit * ing.amount;
  }
  const quality = recipe.canHq && price?.hq.min ? price.hq : price?.nq;
  // Prix prudent : l'annonce la moins chère, ou le prix moyen des ventes s'il est plus bas (une annonce isolée
  // très chère ne fait pas un prix de vente).
  const options = [quality?.min, quality?.average].filter((p): p is number => typeof p === 'number' && p > 0);
  const sale = options.length ? Math.min(...options) : null;
  const revenue = sale === null ? null : sale * recipe.amount;
  return {
    craftCost: craftCost === null ? null : Math.round(craftCost),
    sale,
    hq: Boolean(recipe.canHq && price?.hq.min),
    revenue,
    profit: craftCost === null || revenue === null ? null : Math.round(revenue - craftCost),
    velocity: (price?.nq.velocity ?? 0) + (price?.hq.velocity ?? 0),
  };
}

export interface ProfitRow {
  recipe: Recipe;
  craftCost: number;
  sale: number;
  hq: boolean;
  profit: number;
  /** Marge en pourcentage du coût. */
  margin: number;
  velocity: number;
  /** Bénéfice possible par jour si l'on vend au rythme du marché (au plus 10 ventes comptées). */
  perDay: number;
}

/** Classement des recettes rentables : bénéfice par jour possible, en ne gardant que ce qui se vend. */
export function rankProfits(recipes: Recipe[], prices: Map<number, CraftPrice>, minVelocity = 0.5): ProfitRow[] {
  const cost = unitCosts(new Map(), prices);
  const rows: ProfitRow[] = [];
  for (const recipe of recipes) {
    const p = recipeProfit(recipe, cost, prices.get(recipe.itemId));
    if (p.profit === null || p.craftCost === null || p.sale === null || p.profit <= 0 || p.velocity < minVelocity) continue;
    rows.push({
      recipe,
      craftCost: p.craftCost,
      sale: p.sale,
      hq: p.hq,
      profit: p.profit,
      margin: p.craftCost > 0 ? Math.round((p.profit / p.craftCost) * 100) : 0,
      velocity: Math.round(p.velocity * 10) / 10,
      perDay: Math.round(p.profit * Math.min(p.velocity, 10)),
    });
  }
  return rows.sort((a, b) => b.perDay - a.perDay);
}

// ---------------------------------------------------------------------------
// Inventaire (plugin)
// ---------------------------------------------------------------------------

export interface Owned {
  count: number;
  places: { place: string; count: number }[];
}

/** Quantité possédée de chaque objet : sacs, arsenal, sacoches et servants (hors objets en vente). */
export function ownedItems(snapshot: PrivateSnapshot | null | undefined): Map<number, Owned> {
  const out = new Map<number, Owned>();
  if (!snapshot) return out;
  const add = (id: number, qty: number, place: string) => {
    const entry = out.get(id) ?? { count: 0, places: [] };
    entry.count += qty;
    const at = entry.places.find((p) => p.place === place);
    if (at) at.count += qty;
    else entry.places.push({ place, count: qty });
    out.set(id, entry);
  };
  for (const group of snapshot.inventories) for (const s of group.items) add(s.id, s.qty, group.label);
  for (const r of snapshot.retainers) for (const s of [...(r.items ?? []), ...(r.crystals ?? [])]) add(s.id, s.qty, r.name);
  return out;
}

export function ownedCounts(owned: Map<number, Owned>): Map<number, number> {
  return new Map([...owned].map(([id, o]) => [id, o.count]));
}

// ---------------------------------------------------------------------------
// Montée en niveau
// ---------------------------------------------------------------------------

/** Paliers de mandats (niveau du mandat) utiles à un niveau : le plus haut accessible et celui d'avant. */
export function leveBrackets(leves: CraftLeve[], level: number): number[] {
  const levels = [...new Set(leves.map((l) => l.level))].filter((l) => l <= level).sort((a, b) => b - a);
  return levels.slice(0, 2);
}

/** Remises nécessaires pour gagner `expToGo` points (HQ : XP doublée). */
export function turnInsNeeded(expToGo: number, leve: CraftLeve, hq = false): number {
  const exp = leve.exp * (hq ? 2 : 1);
  return exp > 0 ? Math.max(1, Math.ceil(expToGo / exp)) : 0;
}
