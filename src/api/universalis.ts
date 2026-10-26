/**
 * Prix du marché via Universalis (https://universalis.app), données envoyées par les joueurs.
 * Champs repris de Universalis.Application/Views (V1 et V2).
 */
import { ApiError, getJson } from './http';

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

// ---------------------------------------------------------------------------
// Historique des ventes
// ---------------------------------------------------------------------------

export interface HistorySale {
  pricePerUnit: number;
  quantity: number;
  hq: boolean;
  /** En secondes. */
  timestamp: number;
  worldName?: string;
}

interface HistoryData {
  itemID: number;
  entries: HistorySale[];
}

interface MultiHistoryData {
  items: Record<string, HistoryData>;
}

const DAY_SECONDS = 86400;

function historyUrl(scope: string, ids: number[], days: number): string {
  const params = new URLSearchParams({ entriesWithin: String(days * DAY_SECONDS), entriesToReturn: '999999' });
  return `${BASE}/v2/history/${encodeURIComponent(scope)}/${ids.join(',')}?${params}`;
}

/** Ventes d'un objet sur les `days` derniers jours. */
export async function getHistory(scope: string, itemId: number, days: number): Promise<HistorySale[]> {
  const data = await getJson<HistoryData>(historyUrl(scope, [itemId], days), { source: SOURCE });
  return data.entries ?? [];
}

/** Ventes de plusieurs objets (liste de favoris), par paquets de 100. */
export async function getHistories(scope: string, itemIds: number[], days: number): Promise<Map<number, HistorySale[]>> {
  const unique = [...new Set(itemIds)];
  const result = new Map<number, HistorySale[]>();
  for (let i = 0; i < unique.length; i += MAX_ITEMS_PER_REQUEST) {
    const chunk = unique.slice(i, i + MAX_ITEMS_PER_REQUEST);
    if (chunk.length === 1) {
      result.set(chunk[0], await getHistory(scope, chunk[0], days));
      continue;
    }
    const data = await getJson<MultiHistoryData>(historyUrl(scope, chunk, days), { source: SOURCE });
    for (const id of chunk) result.set(id, data.items?.[String(id)]?.entries ?? []);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Prix agrégés (artisanat) : prix mini, prix moyen et ventes par jour, en NQ et en HQ
// ---------------------------------------------------------------------------

export interface QualityPrice {
  /** Prix de l'annonce la moins chère. */
  min: number | null;
  /** Prix moyen des ventes récentes. */
  average: number | null;
  /** Ventes par jour. */
  velocity: number;
}

export interface CraftPrice {
  nq: QualityPrice;
  hq: QualityPrice;
}

type Scoped<T> = { world?: T; dc?: T; region?: T };
interface AggregatedQuality {
  minListing?: Scoped<{ price: number }>;
  averageSalePrice?: Scoped<{ price: number }>;
  dailySaleVelocity?: Scoped<{ quantity: number }>;
}
interface AggregatedResponse {
  results: { itemId: number; nq?: AggregatedQuality; hq?: AggregatedQuality }[];
}

/** Valeur la plus proche du serveur choisi : monde, sinon centre de données, sinon région. */
function nearest<T>(value: Scoped<T> | undefined): T | undefined {
  return value?.world ?? value?.dc ?? value?.region;
}

function quality(q: AggregatedQuality | undefined): QualityPrice {
  const min = nearest(q?.minListing)?.price;
  const average = nearest(q?.averageSalePrice)?.price;
  return {
    min: min && min > 0 ? min : null,
    average: average && average > 0 ? Math.round(average) : null,
    velocity: nearest(q?.dailySaleVelocity)?.quantity ?? 0,
  };
}

export function parseAggregated(data: AggregatedResponse): Map<number, CraftPrice> {
  const out = new Map<number, CraftPrice>();
  for (const r of data.results ?? []) out.set(r.itemId, { nq: quality(r.nq), hq: quality(r.hq) });
  return out;
}

/** Prix de beaucoup d'objets d'un coup (100 par requête), pour les coûts de fabrication. */
export async function getCraftPrices(scope: string, itemIds: number[]): Promise<Map<number, CraftPrice>> {
  const unique = [...new Set(itemIds.filter((id) => id > 0))];
  const out = new Map<number, CraftPrice>();
  // Universalis refuse (400) un paquet qui ne contient que des objets qu'il ne connaît pas encore (tout derniers
  // ajouts du jeu) : on coupe le paquet en deux jusqu'à isoler ces objets, qui restent simplement sans prix.
  const load = async (chunk: number[]): Promise<void> => {
    try {
      const data = await getJson<AggregatedResponse>(`${BASE}/v2/aggregated/${encodeURIComponent(scope)}/${chunk.join(',')}`, { source: SOURCE });
      for (const [id, price] of parseAggregated(data)) out.set(id, price);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 400)) throw error;
      if (chunk.length === 1) return;
      const half = Math.ceil(chunk.length / 2);
      await load(chunk.slice(0, half));
      await load(chunk.slice(half));
    }
  };
  for (let i = 0; i < unique.length; i += MAX_ITEMS_PER_REQUEST) await load(unique.slice(i, i + MAX_ITEMS_PER_REQUEST));
  return out;
}
