/**
 * Ventes des servants face au marché (Universalis) : l'annonce est-elle encore la moins chère, a-t-elle été
 * vendue, dort-elle depuis longtemps ?
 *
 * Partagé par l'appli (prix du marché à côté de chaque annonce) et le service (alertes) : aucun import.
 */

/** Annonce d'Universalis (champs utiles). */
export interface BoardListing {
  pricePerUnit: number;
  quantity: number;
  hq: boolean;
  retainerName: string;
}

/** Vente récente d'Universalis ; `timestamp` en secondes. */
export interface BoardSale {
  pricePerUnit: number;
  quantity: number;
  hq: boolean;
  timestamp: number;
}

export interface BoardItem {
  /** Dernier relevé d'Universalis pour cet objet (ms). */
  lastUploadTime: number;
  listings: BoardListing[];
  recentHistory: BoardSale[];
}

/** Annonce d'un servant (relevée par le plugin à la sonnette). */
export interface MyListing {
  retainerId: string;
  retainer: string;
  id: number;
  qty: number;
  hq: boolean;
  price: number;
}

export interface RetainerAlertSettings {
  sold: boolean;
  /** Prévenir quand un autre vendeur est moins cher d'au moins ce pourcentage (0 : dès 1 gil) ; null : jamais. */
  undercut: number | null;
  /** Prévenir quand une annonce dort depuis ce nombre de jours ; null : jamais. */
  stale: number | null;
}

/** Ce que le service retient de chaque annonce entre deux vérifications. */
export interface ListingMemory {
  /** Première fois vue dans les relevés (ms). */
  firstSeen: number;
  /** Dernier relevé d'Universalis où elle figurait (ms). */
  onBoard?: number;
  /** Vendue ou retirée : plus rien à en dire. */
  gone?: boolean;
  undercutNotified?: boolean;
  staleNotified?: boolean;
}

/** `gil` : gils reçus, quand le jeu les a annoncés (vente vue en direct par le plugin). */
export type ListingEvent = { kind: 'sold'; gil?: number } | { kind: 'undercut'; cheapest: number; percent: number } | { kind: 'stale'; days: number };

const DAY = 86_400_000;

export const listingKey = (l: MyListing) => `${l.retainerId}:${l.id}:${l.hq ? 1 : 0}:${l.price}:${l.qty}`;

/**
 * Prix le plus bas des autres vendeurs du monde (pas ses propres servants). Une annonce HQ ne se compare
 * qu'aux HQ ; une NQ à toutes, puisqu'un HQ moins cher lui prend aussi ses acheteurs.
 */
export function cheapestOther(board: BoardItem, mine: Pick<MyListing, 'hq'>, myRetainers: ReadonlySet<string>): number | null {
  let min: number | null = null;
  for (const l of board.listings) {
    if (myRetainers.has(l.retainerName) || (mine.hq && !l.hq)) continue;
    if (min === null || l.pricePerUnit < min) min = l.pricePerUnit;
  }
  return min;
}

/** Écart en pour cent sous le prix du joueur (0 si personne n'est moins cher). */
export function undercutPercent(price: number, cheapest: number | null): number {
  if (cheapest === null || cheapest >= price) return 0;
  return Math.max(1, Math.round((1 - cheapest / price) * 100));
}

/** L'annonce figure-t-elle sur le marché d'Universalis ? */
export function isOnBoard(board: BoardItem, l: MyListing): boolean {
  return board.listings.some((b) => b.retainerName === l.retainer && b.pricePerUnit === l.price && b.quantity === l.qty && b.hq === l.hq);
}

/**
 * Une vérification d'une annonce : met à jour sa mémoire et dit ce qu'il faut annoncer. Une annonce vue sur le
 * marché puis absente d'un relevé plus récent est vendue si une vente identique figure dans l'historique depuis,
 * sinon retirée (le joueur l'a reprise ou en a changé le prix).
 */
export function checkListing(
  l: MyListing,
  board: BoardItem | undefined,
  memory: ListingMemory | undefined,
  myRetainers: ReadonlySet<string>,
  settings: RetainerAlertSettings,
  now: number,
): { memory: ListingMemory; events: ListingEvent[] } {
  const m: ListingMemory = { ...(memory ?? { firstSeen: now }) };
  const events: ListingEvent[] = [];
  if (m.gone) return { memory: m, events };

  if (board) {
    if (isOnBoard(board, l)) {
      m.onBoard = Math.max(m.onBoard ?? 0, board.lastUploadTime);
    } else if (m.onBoard !== undefined && board.lastUploadTime > m.onBoard) {
      m.gone = true;
      // Universalis date les ventes à la seconde ; une marge couvre l'écart entre ses relevés.
      const sold = board.recentHistory.some(
        (s) => s.pricePerUnit === l.price && s.quantity === l.qty && s.hq === l.hq && s.timestamp * 1000 >= m.onBoard! - 10 * 60_000,
      );
      if (sold && settings.sold) events.push({ kind: 'sold' });
      return { memory: m, events };
    }

    if (settings.undercut !== null) {
      const cheapest = cheapestOther(board, l, myRetainers);
      const percent = undercutPercent(l.price, cheapest);
      const beaten = percent > 0 && percent >= settings.undercut;
      if (beaten && !m.undercutNotified) events.push({ kind: 'undercut', cheapest: cheapest!, percent });
      // Repasse en tête : l'alerte se réarme.
      m.undercutNotified = beaten;
    }
  }

  if (settings.stale !== null && !m.staleNotified && now - m.firstSeen >= settings.stale * DAY) {
    events.push({ kind: 'stale', days: Math.floor((now - m.firstSeen) / DAY) });
    m.staleNotified = true;
  }
  return { memory: m, events };
}
