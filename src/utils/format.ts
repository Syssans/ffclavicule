/** Mise en forme des nombres et des dates, en français. */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function formatGil(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${integer.format(value)} gils`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return integer.format(value);
}

/** "il y a 5 min", "il y a 3 h", "il y a 2 j". `timestamp` en millisecondes. */
export function formatAgo(timestamp: number | null | undefined, now: number = Date.now()): string {
  if (!timestamp) return 'jamais';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
}

/** Universalis donne parfois des secondes, parfois des millisecondes. */
export function toMillis(timestamp: number): number {
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

export function percent(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}
