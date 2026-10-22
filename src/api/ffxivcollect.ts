/**
 * Collections d'un personnage via FFXIV Collect (https://ffxivcollect.com).
 * Format : app/views/api/characters/_character.json.jbuilder du dépôt mattantonelli/ffxiv-collect.
 * Le personnage doit avoir été importé une fois sur ffxivcollect.com, sinon l'API répond 404.
 */
import { ApiError, getJson } from './http';

const BASE = 'https://ffxivcollect.com/api';
const SOURCE = 'FFXIV Collect';

interface CountTotal {
  count: number;
  total: number;
  public?: boolean;
}

interface CollectCharacter {
  id: number;
  name: string;
  server: string;
  last_parsed?: string;
  achievements: CountTotal & { points: number; points_total: number; public: boolean };
  mounts: CountTotal;
  minions: CountTotal;
  orchestrions: CountTotal;
  emotes: CountTotal;
  bardings: CountTotal;
  hairstyles: CountTotal;
  facewear?: CountTotal;
  fashions?: CountTotal;
  spells?: CountTotal;
  cards?: CountTotal;
}

export interface Collection {
  key: string;
  label: string;
  count: number;
  total: number;
  isPublic: boolean;
}

export interface CollectionSummary {
  lastParsed: string | null;
  achievementPoints: number;
  collections: Collection[];
}

const LABELS: [keyof CollectCharacter, string][] = [
  ['achievements', 'Hauts faits'],
  ['mounts', 'Montures'],
  ['minions', 'Mascottes'],
  ['orchestrions', 'Rouleaux d’orchestrion'],
  ['emotes', 'Emotes'],
  ['hairstyles', 'Coiffures'],
  ['bardings', 'Bardes de chocobo'],
  ['fashions', 'Accessoires de mode'],
  ['facewear', 'Accessoires de visage'],
  ['spells', 'Sorts de mage bleu'],
  ['cards', 'Cartes Triple Triade'],
];

export function profileUrl(characterId: number): string {
  return `https://ffxivcollect.com/characters/${characterId}`;
}

/** Renvoie null si le personnage n'est pas encore connu de FFXIV Collect. */
export async function getCollections(characterId: number): Promise<CollectionSummary | null> {
  let data: CollectCharacter;
  try {
    data = await getJson<CollectCharacter>(`${BASE}/characters/${characterId}?language=fr`, { source: SOURCE });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
  const collections: Collection[] = [];
  for (const [key, label] of LABELS) {
    const value = data[key] as CountTotal | undefined;
    if (!value || typeof value !== 'object' || !value.total) continue;
    collections.push({ key, label, count: value.count, total: value.total, isPublic: value.public !== false });
  }
  return { lastParsed: data.last_parsed ?? null, achievementPoints: data.achievements?.points ?? 0, collections };
}
