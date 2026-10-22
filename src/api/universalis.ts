/**
 * Prix du marché via Universalis (https://universalis.app), données envoyées par les joueurs.
 * Champs repris de Universalis.Application/Views (V1 et V2).
 */
import { getJson } from './http';

const BASE = 'https://universalis.app/api';
const SOURCE = 'Universalis';
/** Universalis accepte jusqu'à 100 objets par requête. */
const MAX_ITEMS_PER_REQUEST = 100;

export interface DataCenter {
  name: string;
  region: string;
  worlds: number[];
}

export interface World {
  id: number;
  name: string;
}

export interface Listing {
  pricePerUnit: number;
  quantity: number;
  total: number;
  hq: boolean;
  worldName?: string;
  worldID?: number;
  retainerName: string;
  lastReviewTime: number;
}

export interface Sale {
  pricePerUnit: number;
  quantity: number;
  hq: boolean;
  timestamp: number;
  worldName?: string;
  buyerName?: string;
}

export interface MarketData {
  itemID: number;
  lastUploadTime: number;
  listings: Listing[];
  recentHistory: Sale[];
  currentAveragePrice: number;
  averagePrice: number;
  minPrice: number;
  minPriceNQ: number;
  minPriceHQ: number;
  regularSaleVelocity: number;
  unitsForSale: number;
  listingsCount: number;
  worldName?: string;
  dcName?: string;
  regionName?: string;
}

interface MultiMarketData {
  itemIDs: number[];
  items: Record<string, MarketData>;
  unresolvedItems: number[];
}

export function getDataCenters(): Promise<DataCenter[]> {
  return getJson<DataCenter[]>(`${BASE}/v2/data-centers`, { source: SOURCE });
}

export function getWorlds(): Promise<World[]> {
  return getJson<World[]>(`${BASE}/v2/worlds`, { source: SOURCE });
}

/** Annonces et ventes récentes d'un objet, sur un monde, un centre de données ou une région. */
export function getMarket(scope: string, itemId: number, listings = 20, entries = 20): Promise<MarketData> {
  const params = new URLSearchParams({ listings: String(listings), entries: String(entries) });
  return getJson<MarketData>(`${BASE}/v2/${encodeURIComponent(scope)}/${itemId}?${params}`, { source: SOURCE });
}

export interface PriceSummary {
  itemId: number;
  minPrice: number | null;
  averagePrice: number | null;
  /** Nombre moyen de ventes par jour. */
  velocity: number;
  cheapestWorld: string | null;
  lastUploadTime: number | null;
}

function summarize(itemId: number, data: MarketData | undefined): PriceSummary {
  if (!data) return { itemId, minPrice: null, averagePrice: null, velocity: 0, cheapestWorld: null, lastUploadTime: null };
  const cheapest = data.listings?.[0];
  return {
    itemId,
    minPrice: data.minPrice > 0 ? data.minPrice : null,
    averagePrice: data.averagePrice > 0 ? Math.round(data.averagePrice) : null,
    velocity: data.regularSaleVelocity ?? 0,
    cheapestWorld: cheapest?.worldName ?? data.worldName ?? null,
    lastUploadTime: data.lastUploadTime || null,
  };
}

/** Prix minimum de plusieurs objets d'un coup (liste de favoris). */
export async function getPriceSummaries(scope: string, itemIds: number[]): Promise<PriceSummary[]> {
  const unique = [...new Set(itemIds)];
  const summaries: PriceSummary[] = [];
  for (let i = 0; i < unique.length; i += MAX_ITEMS_PER_REQUEST) {
    const chunk = unique.slice(i, i + MAX_ITEMS_PER_REQUEST);
    const params = new URLSearchParams({ listings: '1', entries: '0' });
    const url = `${BASE}/v2/${encodeURIComponent(scope)}/${chunk.join(',')}?${params}`;
    if (chunk.length === 1) {
      // Pour un seul objet, Universalis répond avec un objet simple, pas avec "items".
      summaries.push(summarize(chunk[0], await getJson<MarketData>(url, { source: SOURCE })));
    } else {
      const data = await getJson<MultiMarketData>(url, { source: SOURCE });
      for (const id of chunk) summaries.push(summarize(id, data.items?.[String(id)]));
    }
  }
  return summaries;
}

const REGION_LABELS: Record<string, string> = {
  Europe: 'Europe',
  'North-America': 'Amérique du Nord',
  Japan: 'Japon',
  Oceania: 'Océanie',
  中国: 'Chine',
  한국: 'Corée',
};

/** Nom français d'une région d'Universalis (ex. "North-America" -> "Amérique du Nord"). */
export function regionLabel(region: string): string {
  return REGION_LABELS[region] ?? region;
}
