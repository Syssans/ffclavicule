/**
 * Données du jeu (objets, catégories, icônes) via XIVAPI v2 (https://v2.xivapi.com).
 * Format des réponses : dépôt ackwell/boilmaster ; noms des champs : xivdev/EXDSchema.
 */
import { getJson } from './http';

const BASE = 'https://v2.xivapi.com/api';
const SOURCE = 'XIVAPI';

export type GameLanguage = 'fr' | 'en' | 'de' | 'ja';

interface IconValue {
  id: number;
  path: string;
  path_hr1: string;
}

interface Reference<F> {
  value: number;
  row_id?: number;
  fields?: F;
}

/**
 * Un champ demandé avec un décorateur revient sous son nom complet, décorateur compris
 * (boilmaster, bm_http/src/api1/filter.rs : `key: format!("{field}{decorator_input}")`).
 */
const LEVEL_ITEM = 'LevelItem@as(raw)';
const SEARCH_CATEGORY = 'ItemSearchCategory@as(raw)';

interface ItemFields {
  Name: string;
  Description?: string;
  Icon?: IconValue;
  [LEVEL_ITEM]?: number;
  LevelEquip?: number;
  [SEARCH_CATEGORY]?: number;
  StackSize?: number;
  Rarity?: number;
  ItemUICategory?: Reference<{ Name?: string }>;
}

interface RowResult<F> {
  row_id: number;
  fields: F;
}

interface SearchResponse<F> {
  next?: string;
  results: (RowResult<F> & { score: number; sheet: string })[];
}

export interface Item {
  id: number;
  name: string;
  description: string | null;
  icon: string | null;
  itemLevel: number | null;
  equipLevel: number | null;
  category: string | null;
  /** Vendable au marché (sinon Universalis n'a pas de prix). */
  marketable: boolean;
  stackSize: number | null;
  rarity: number | null;
}

const ITEM_FIELDS = [
  'Name',
  'Description',
  'Icon',
  LEVEL_ITEM,
  'LevelEquip',
  SEARCH_CATEGORY,
  'StackSize',
  'Rarity',
  'ItemUICategory.Name',
].join(',');

/** Icône du jeu par son numéro (ex. 62119 -> ui/icon/062000/062119_hr1.tex). */
export function gameIconUrl(id: number): string {
  const group = String(Math.floor(id / 1000) * 1000).padStart(6, '0');
  const file = String(id).padStart(6, '0');
  return `${BASE}/asset?${new URLSearchParams({ path: `ui/icon/${group}/${file}_hr1.tex`, format: 'png' })}`;
}

export function iconUrl(icon: IconValue | undefined): string | null {
  if (!icon || !icon.id) return null;
  return `${BASE}/asset?${new URLSearchParams({ path: icon.path_hr1, format: 'png' })}`;
}

function toItem(row: RowResult<ItemFields>): Item {
  const f = row.fields;
  return {
    id: row.row_id,
    name: f.Name,
    description: f.Description?.trim() || null,
    icon: iconUrl(f.Icon),
    itemLevel: f[LEVEL_ITEM] || null,
    equipLevel: f.LevelEquip || null,
    category: f.ItemUICategory?.fields?.Name || null,
    marketable: (f[SEARCH_CATEGORY] ?? 0) > 0,
    stackSize: f.StackSize ?? null,
    rarity: f.Rarity ?? null,
  };
}

/** Echappe une saisie utilisateur pour la syntaxe de requête de XIVAPI. */
export function escapeQueryValue(text: string): string {
  return text.trim().replace(/[\\"]/g, '');
}

export async function searchItems(
  text: string,
  { language = 'fr', marketableOnly = false, limit = 40 }: { language?: GameLanguage; marketableOnly?: boolean; limit?: number } = {},
): Promise<Item[]> {
  const value = escapeQueryValue(text);
  if (value.length < 2) return [];
  // Chaque mot doit apparaître dans le nom, dans n'importe quel ordre.
  const words = value.split(/\s+/).filter(Boolean);
  const params = new URLSearchParams({
    sheets: 'Item',
    query: words.map((w) => `+Name~"${w}"`).join(' '),
    fields: ITEM_FIELDS,
    language,
    limit: String(limit),
  });
  const data = await getJson<SearchResponse<ItemFields>>(`${BASE}/search?${params}`, { source: SOURCE });
  const items = data.results.map(toItem).filter((item) => item.name);
  return marketableOnly ? items.filter((item) => item.marketable) : items;
}

export async function getItem(id: number, language: GameLanguage = 'fr'): Promise<Item> {
  const params = new URLSearchParams({ fields: ITEM_FIELDS, language });
  const row = await getJson<RowResult<ItemFields>>(`${BASE}/sheet/Item/${id}?${params}`, { source: SOURCE });
  return toItem(row);
}
