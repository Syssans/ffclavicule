/** Résumés affichés sur les tuiles de la fiche et sur l'accueil, calculés depuis les données du plugin. */
import { ventureStatus, type PrivateSnapshot } from '@/api/private';

export interface PrivateSummary {
  unreadLetters: number;
  /** Servants revenus de mission (récompense à récupérer). */
  venturesDone: number;
  /** Prochain retour de mission (secondes Unix), s'il y en a un en cours. */
  nextVenture: number | null;
  retainers: number;
  listings: number;
  collectionsOwned: number;
  collectionsTotal: number;
}

export function summarize(snapshot: PrivateSnapshot | null | undefined, now = Date.now()): PrivateSummary | null {
  if (!snapshot) return null;
  let venturesDone = 0;
  let nextVenture: number | null = null;
  for (const r of snapshot.retainers) {
    const status = ventureStatus(r.ventureComplete, now);
    if (!status) continue;
    if (status.done) venturesDone++;
    else if (nextVenture === null || r.ventureComplete < nextVenture) nextVenture = r.ventureComplete;
  }
  const collections = snapshot.collections ?? [];
  return {
    unreadLetters: snapshot.mail?.letters.filter((l) => !l.read).length ?? 0,
    venturesDone,
    nextVenture,
    retainers: snapshot.retainers.length,
    listings: snapshot.retainers.reduce((n, r) => n + (r.market?.length ?? r.marketItemCount ?? 0), 0),
    collectionsOwned: collections.reduce((n, c) => n + c.owned.length, 0),
    collectionsTotal: collections.reduce((n, c) => n + c.total, 0),
  };
}
