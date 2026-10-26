/**
 * Artisanat, d'après les données du jeu (XIVAPI v2) : recettes et sous-recettes, provenance des matières
 * (récolte, pêche, marchands) et mandats d'artisan. Les requêtes regroupent plusieurs objets à la fois.
 */
import { getJson } from './http';
import { iconUrl, searchItems } from './xivapi';

const BASE = 'https://v2.xivapi.com/api';
const SOURCE = 'XIVAPI';
/** Objets par requête groupée (la requête tient dans l'adresse). */
const BATCH = 40;

type Icon = { id: number; path: string; path_hr1: string };
type Ref<F> = { value: number; row_id?: number; fields?: F };
type Row<F> = { row_id: number; fields: F };
type Page<F> = { next?: string; results: Row<F>[] };

/** Recherche XIVAPI avec pagination : suit le curseur jusqu'à `max` résultats. */
async function searchAll<F>(sheet: string, query: string, fields: string, max = 1000): Promise<Row<F>[]> {
  const rows: Row<F>[] = [];
  let params = new URLSearchParams({ sheets: sheet, query, fields, language: 'fr', limit: '500' });
  for (;;) {
    const page = await getJson<Page<F>>(`${BASE}/search?${params}`, { source: SOURCE });
    rows.push(...page.results);
    if (!page.next || rows.length >= max) return rows.slice(0, max);
    // Le curseur ne garde ni la langue ni les champs : on les redonne.
    params = new URLSearchParams({ cursor: page.next, fields, language: 'fr', limit: '500' });
  }
}

/** Même recherche pour beaucoup d'identifiants : « champ=a champ=b … » (l'un ou l'autre), par paquets. */
async function searchByIds<F>(sheet: string, field: string, ids: number[], fields: string): Promise<Row<F>[]> {
  const unique = [...new Set(ids.filter((id) => id > 0))];
  const rows: Row<F>[] = [];
  for (let i = 0; i < unique.length; i += BATCH) {
    const query = unique
      .slice(i, i + BATCH)
      .map((id) => `${field}=${id}`)
      .join(' ');
    rows.push(...(await searchAll<F>(sheet, query, fields, 5000)));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Recettes
// ---------------------------------------------------------------------------

/** Cristaux, éclats et agrégats : objets 2 à 19. */
export function isCrystal(itemId: number): boolean {
  return itemId >= 2 && itemId <= 19;
}

export interface RecipeIngredient {
  itemId: number;
  name: string;
  icon: string | null;
  amount: number;
}

export interface Recipe {
  id: number;
  itemId: number;
  name: string;
  icon: string | null;
  /** Nombre d'objets obtenus par fabrication. */
  amount: number;
  /** Discipline (0 menuisier … 7 cuisinier). */
  craftType: number;
  level: number;
  stars: number;
  canHq: boolean;
  expert: boolean;
  /** Livre de recettes de maître exigé, le cas échéant. */
  masterBook: string | null;
  ingredients: RecipeIngredient[];
  crystals: RecipeIngredient[];
}

interface ItemRef {
  Name?: string;
  Icon?: Icon;
}

interface RecipeFields {
  ItemResult?: Ref<ItemRef>;
  AmountResult?: number;
  Ingredient?: Ref<ItemRef>[];
  AmountIngredient?: number[];
  CraftType?: Ref<unknown>;
  RecipeLevelTable?: Ref<{ ClassJobLevel?: number; Stars?: number }>;
  CanHq?: boolean;
  IsExpert?: boolean;
  SecretRecipeBook?: Ref<{ Name?: string }>;
}

export const RECIPE_FIELDS = [
  'ItemResult.Name',
  'ItemResult.Icon',
  'AmountResult',
  'Ingredient[].Name',
  'Ingredient[].Icon',
  'AmountIngredient',
  'CraftType',
  'RecipeLevelTable.ClassJobLevel',
  'RecipeLevelTable.Stars',
  'CanHq',
  'IsExpert',
  'SecretRecipeBook.Name',
].join(',');

export function toRecipe(row: Row<RecipeFields>): Recipe | null {
  const f = row.fields;
  const result = f.ItemResult;
  if (!result || result.value <= 0 || !result.fields?.Name) return null;
  const ingredients: RecipeIngredient[] = [];
  const crystals: RecipeIngredient[] = [];
  (f.Ingredient ?? []).forEach((ref, i) => {
    const amount = f.AmountIngredient?.[i] ?? 0;
    if (!ref || ref.value <= 0 || amount <= 0) return;
    const entry = { itemId: ref.value, name: ref.fields?.Name || `Objet ${ref.value}`, icon: iconUrl(ref.fields?.Icon), amount };
    (isCrystal(ref.value) ? crystals : ingredients).push(entry);
  });
  const book = f.SecretRecipeBook;
  return {
    id: row.row_id,
    itemId: result.value,
    name: result.fields.Name,
    icon: iconUrl(result.fields.Icon),
    amount: f.AmountResult || 1,
    craftType: f.CraftType?.value ?? 0,
    level: f.RecipeLevelTable?.fields?.ClassJobLevel ?? 0,
    stars: f.RecipeLevelTable?.fields?.Stars ?? 0,
    canHq: f.CanHq ?? false,
    expert: f.IsExpert ?? false,
    masterBook: book && book.value > 0 && book.fields?.Name ? book.fields.Name : null,
    ingredients,
    crystals,
  };
}

function toRecipes(rows: Row<RecipeFields>[]): Recipe[] {
  return rows.map(toRecipe).filter((r): r is Recipe => r !== null);
}

export async function getRecipe(id: number): Promise<Recipe> {
  const params = new URLSearchParams({ fields: RECIPE_FIELDS, language: 'fr' });
  const recipe = toRecipe(await getJson<Row<RecipeFields>>(`${BASE}/sheet/Recipe/${id}?${params}`, { source: SOURCE }));
  if (!recipe) throw new Error('Recette introuvable.');
  return recipe;
}

/** Recettes qui fabriquent ces objets (un objet peut avoir plusieurs recettes, une par artisan). */
export async function recipesForItems(itemIds: number[]): Promise<Recipe[]> {
  return toRecipes(await searchByIds<RecipeFields>('Recipe', 'ItemResult', itemIds, RECIPE_FIELDS));
}

/** Recettes dont le résultat contient tous les mots cherchés. */
export async function searchRecipes(text: string): Promise<Recipe[]> {
  const items = await searchItems(text, { limit: 100 });
  if (items.length === 0) return [];
  const recipes = await recipesForItems(items.map((i) => i.id));
  return recipes.sort((a, b) => a.level - b.level || a.stars - b.stars || a.name.localeCompare(b.name, 'fr'));
}

/** Recettes d'une discipline dans une tranche de niveaux. */
export async function recipesForJob(craftType: number, minLevel: number, maxLevel: number, max = 600): Promise<Recipe[]> {
  const query = `+CraftType=${craftType} +RecipeLevelTable.ClassJobLevel>=${minLevel} +RecipeLevelTable.ClassJobLevel<=${maxLevel}`;
  return toRecipes(await searchAll<RecipeFields>('Recipe', query, RECIPE_FIELDS, max));
}

// ---------------------------------------------------------------------------
// Provenance des matières
// ---------------------------------------------------------------------------

export type GathererKey = 'miner' | 'botanist' | 'fisher';

export interface ItemSource {
  gathering?: { job: GathererKey; level: number; place: string | null; hidden: boolean };
  fishing?: boolean;
  /** Prix chez un marchand (gils), si un marchand le vend. */
  vendorPrice?: number;
}

/** Types de récolte du jeu : 0-1 minage et extraction, 2-3 coupe et fauche, au-delà pêche au harpon. */
function gathererOf(type: number): GathererKey {
  if (type <= 1) return 'miner';
  if (type <= 3) return 'botanist';
  return 'fisher';
}

export async function itemSources(itemIds: number[]): Promise<Map<number, ItemSource>> {
  const out = new Map<number, ItemSource>();
  const get = (id: number) => out.get(id) ?? (out.set(id, {}), out.get(id)!);
  const ids = itemIds.filter((id) => id > 0 && !isCrystal(id));
  if (ids.length === 0) return out;

  const [gathering, fish, shops] = await Promise.all([
    searchByIds<{ Item?: Ref<unknown>; IsHidden?: boolean }>('GatheringItem', 'Item', ids, 'Item,IsHidden'),
    searchByIds<{ Item?: Ref<unknown> }>('FishParameter', 'Item', ids, 'Item'),
    searchByIds<{ Item?: Ref<{ PriceMid?: number }> }>('GilShopItem', 'Item', ids, 'Item.PriceMid'),
  ]);
  for (const row of fish) if (row.fields.Item) get(row.fields.Item.value).fishing = true;
  for (const row of shops) {
    const item = row.fields.Item;
    if (item && item.fields?.PriceMid) get(item.value).vendorPrice = item.fields.PriceMid;
  }

  // Récolte : objet -> GatheringItem -> point de récolte (métier, niveau) -> lieu.
  const itemOfGathering = new Map<number, { itemId: number; hidden: boolean }>();
  for (const row of gathering) {
    if (row.fields.Item) itemOfGathering.set(row.row_id, { itemId: row.fields.Item.value, hidden: row.fields.IsHidden ?? false });
  }
  if (itemOfGathering.size === 0) return out;
  const bases = await searchByIds<{ GatheringType?: Ref<unknown>; GatheringLevel?: number; Item?: Ref<unknown>[] }>(
    'GatheringPointBase',
    'Item[]',
    [...itemOfGathering.keys()],
    'GatheringType,GatheringLevel,Item',
  );
  const baseOfItem = new Map<number, number>();
  for (const base of bases) {
    for (const ref of base.fields.Item ?? []) {
      const entry = itemOfGathering.get(ref.value);
      if (!entry) continue;
      const current = get(entry.itemId).gathering;
      const level = base.fields.GatheringLevel ?? 0;
      // Le point le plus accessible (niveau le plus bas).
      if (!current || level < current.level) {
        get(entry.itemId).gathering = { job: gathererOf(base.fields.GatheringType?.value ?? 0), level, place: null, hidden: entry.hidden };
        baseOfItem.set(entry.itemId, base.row_id);
      }
    }
  }
  const points = await searchByIds<{ GatheringPointBase?: Ref<unknown>; PlaceName?: Ref<{ Name?: string }>; TerritoryType?: Ref<{ PlaceName?: Ref<{ Name?: string }> }> }>(
    'GatheringPoint',
    'GatheringPointBase',
    [...new Set(baseOfItem.values())],
    'GatheringPointBase,PlaceName.Name,TerritoryType.PlaceName.Name',
  );
  const placeOfBase = new Map<number, string>();
  for (const point of points) {
    const base = point.fields.GatheringPointBase?.value;
    if (!base || placeOfBase.has(base)) continue;
    const zone = point.fields.TerritoryType?.fields?.PlaceName?.fields?.Name;
    const spot = point.fields.PlaceName?.fields?.Name;
    const label = [zone, spot && spot !== zone ? spot : null].filter(Boolean).join(' · ');
    if (label) placeOfBase.set(base, label);
  }
  for (const [itemId, base] of baseOfItem) {
    const g = out.get(itemId)?.gathering;
    if (g) g.place = placeOfBase.get(base) ?? null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mandats d'artisan
// ---------------------------------------------------------------------------

export interface CraftLeve {
  id: number;
  name: string;
  level: number;
  exp: number;
  gil: number;
  place: string | null;
  client: string | null;
  /** Nombre de remises possibles d'affilée (chacune rapporte l'XP). */
  repeats: number;
  items: { itemId: number; name: string; icon: string | null; count: number }[];
}

interface CraftLeveFields {
  Item?: Ref<ItemRef>[];
  ItemCount?: number[];
  Repeats?: number;
  Leve?: Ref<{
    Name?: string;
    ClassJobLevel?: number;
    ExpReward?: number;
    GilReward?: number;
    PlaceNameIssued?: Ref<{ Name?: string }>;
    LeveClient?: Ref<{ Name?: string }>;
  }>;
}

export function toCraftLeve(row: Row<CraftLeveFields>): CraftLeve | null {
  const leve = row.fields.Leve;
  if (!leve?.fields?.Name) return null;
  // Les grands mandats répètent le même objet sur plusieurs lignes : on les additionne.
  const items: CraftLeve['items'] = [];
  (row.fields.Item ?? []).forEach((ref, i) => {
    const count = row.fields.ItemCount?.[i] ?? 0;
    if (ref.value <= 0 || count <= 0) return;
    const same = items.find((it) => it.itemId === ref.value);
    if (same) same.count += count;
    else items.push({ itemId: ref.value, name: ref.fields?.Name || `Objet ${ref.value}`, icon: iconUrl(ref.fields?.Icon), count });
  });
  return {
    id: leve.value,
    name: leve.fields.Name,
    level: leve.fields.ClassJobLevel ?? 0,
    exp: leve.fields.ExpReward ?? 0,
    gil: leve.fields.GilReward ?? 0,
    place: leve.fields.PlaceNameIssued?.fields?.Name || null,
    client: leve.fields.LeveClient?.fields?.Name?.replace(/^Client\s*:\s*/, '') || null,
    repeats: row.fields.Repeats ?? 0,
    items,
  };
}

/** Mandats d'une discipline (type d'assignation 5 à 12, dans l'ordre des disciplines) entre deux niveaux. */
export async function craftLeves(craftType: number, minLevel: number, maxLevel: number): Promise<CraftLeve[]> {
  const query = `+Leve.LeveAssignmentType=${5 + craftType} +Leve.ClassJobLevel>=${minLevel} +Leve.ClassJobLevel<=${maxLevel}`;
  const fields =
    'Item[].Name,Item[].Icon,ItemCount,Repeats,Leve.Name,Leve.ClassJobLevel,Leve.ExpReward,Leve.GilReward,Leve.PlaceNameIssued.Name,Leve.LeveClient.Name';
  const rows = await searchAll<CraftLeveFields>('CraftLeve', query, fields, 300);
  return rows
    .map(toCraftLeve)
    .filter((l): l is CraftLeve => l !== null)
    .sort((a, b) => b.level - a.level || b.exp - a.exp);
}
