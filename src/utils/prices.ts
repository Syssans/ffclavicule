/** Transformation de l'historique des ventes en points pour les graphiques. */

export interface Sale {
  pricePerUnit: number;
  quantity: number;
  /** En secondes ou millisecondes. */
  timestamp: number;
}

export interface PricePoint {
  /** Début du jour (millisecondes, heure locale). */
  day: number;
  /** Prix médian à l'unité ce jour-là : la médiane résiste aux ventes aberrantes. */
  median: number;
  /** Unités vendues ce jour-là. */
  units: number;
}

const DAY_MS = 86_400_000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Un point par jour ayant au moins une vente, sur les `days` derniers jours, du plus ancien au plus récent. */
export function dailyPrices(sales: Sale[], days: number, now: number = Date.now()): PricePoint[] {
  const first = startOfDay(now) - (days - 1) * DAY_MS;
  const byDay = new Map<number, { prices: number[]; units: number }>();
  for (const sale of sales) {
    const ms = sale.timestamp < 1e12 ? sale.timestamp * 1000 : sale.timestamp;
    const day = startOfDay(ms);
    if (day < first || ms > now || sale.pricePerUnit <= 0) continue;
    const bucket = byDay.get(day) ?? { prices: [], units: 0 };
    bucket.prices.push(sale.pricePerUnit);
    bucket.units += sale.quantity;
    byDay.set(day, bucket);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a - b)
    .map(([day, { prices, units }]) => ({ day, median: Math.round(median(prices)), units }));
}

/** Variation en % entre le premier et le dernier point, ou null s'il n'y en a pas assez. */
export function trendPercent(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0].median;
  const last = points[points.length - 1].median;
  if (first <= 0) return null;
  return Math.round(((last - first) / first) * 100);
}
