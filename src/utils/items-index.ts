/**
 * Index des objets du jeu, intégré à l'appli (src/data/items.json, voir scripts/update-items-index.mjs) : la
 * recherche d'objets est instantanée, marche hors connexion et ignore majuscules et accents.
 */
import { gameIconUrl } from '@/api/xivapi';
import { parseQuery, rankMatches, searchKey } from '@/utils/search';

export interface ItemHit {
  id: number;
  name: string;
  /** Adresse de l'icône. */
  icon: string | null;
  category: string | null;
  itemLevel: number | null;
  /** Vendable au marché. */
  marketable: boolean;
}

interface Entry {
  id: number;
  name: string;
  key: string;
  icon: number;
  category: number;
  level: number;
  marketable: boolean;
}

interface ItemsFile {
  categories: Record<string, string>;
  items: string;
}

let entries: Entry[] | null = null;
let categories: Record<string, string> = {};

function load(): Entry[] {
  if (entries) return entries;
  const file = require('@/data/items.json') as ItemsFile;
  categories = file.categories;
  entries = file.items.split('\n').map((line) => {
    const [id, name, icon, category, level, marketable] = line.split('|');
    return {
      id: Number(id),
      name,
      key: searchKey(name),
      icon: Number(icon) || 0,
      category: Number(category) || 0,
      level: Number(level) || 0,
      marketable: marketable === '1',
    };
  });
  return entries;
}

function toHit(e: Entry): ItemHit {
  return {
    id: e.id,
    name: e.name,
    icon: e.icon ? gameIconUrl(e.icon) : null,
    category: categories[String(e.category)] ?? null,
    itemLevel: e.level || null,
    marketable: e.marketable,
  };
}

export interface ItemSearch {
  items: ItemHit[];
  /** Nombre total d'objets trouvés (avant la limite). */
  total: number;
}

/**
 * Objets dont le nom contient tous les mots cherchés. Plusieurs objets portent parfois le même nom (une version de
 * quête, une autre vendable…) : on n'en garde qu'un, de préférence celui qui se vend.
 */
export function searchItemIndex(text: string, { marketableOnly = false, limit = 50 }: { marketableOnly?: boolean; limit?: number } = {}): ItemSearch {
  const query = parseQuery(text);
  if (query.key.length < 2) return { items: [], total: 0 };
  const pool = marketableOnly ? load().filter((e) => e.marketable) : load();
  const ranked = rankMatches(pool, (e) => e.key, query);
  const byName = new Map<string, Entry>();
  for (const e of ranked) {
    const seen = byName.get(e.name);
    if (!seen || (e.marketable && !seen.marketable)) byName.set(e.name, e);
  }
  const unique = ranked.filter((e) => byName.get(e.name) === e);
  return { items: unique.slice(0, limit).map(toHit), total: unique.length };
}
