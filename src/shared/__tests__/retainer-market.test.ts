import { checkListing, cheapestOther, undercutPercent, type BoardItem, type MyListing, type RetainerAlertSettings } from '@/shared/retainer-market';

const NOW = Date.UTC(2026, 9, 29, 12);
const MIN = 60_000;
const mine: MyListing = { retainerId: '1', retainer: 'Alpha', id: 5057, qty: 10, hq: false, price: 1000 };
const ALL: RetainerAlertSettings = { sold: true, undercut: 0, stale: 5 };
const me = new Set(['Alpha', 'Beta']);

const board = (over: Partial<BoardItem> = {}): BoardItem => ({
  lastUploadTime: NOW - 5 * MIN,
  listings: [
    { pricePerUnit: 1000, quantity: 10, hq: false, retainerName: 'Alpha' },
    { pricePerUnit: 990, quantity: 5, hq: false, retainerName: 'Beta' },
    { pricePerUnit: 1200, quantity: 1, hq: true, retainerName: 'Autre' },
  ],
  recentHistory: [],
  ...over,
});

describe('prix du marché', () => {
  it('ignore ses propres servants ; une NQ se compare aussi aux HQ', () => {
    expect(cheapestOther(board(), mine, me)).toBe(1200);
    const cheaperHq = board({ listings: [...board().listings, { pricePerUnit: 700, quantity: 1, hq: true, retainerName: 'Autre' }] });
    expect(cheapestOther(cheaperHq, mine, me)).toBe(700);
    expect(cheapestOther(board({ listings: [{ pricePerUnit: 500, quantity: 1, hq: false, retainerName: 'Autre' }] }), { hq: true }, me)).toBeNull();
    expect(undercutPercent(1000, 700)).toBe(30);
    expect(undercutPercent(1000, 999)).toBe(1);
    expect(undercutPercent(1000, 1200)).toBe(0);
  });
});

describe('vérification d’une annonce', () => {
  it('prix cassé : une fois, puis réarmé quand on repasse en tête', () => {
    const undercut = board({ listings: [...board().listings, { pricePerUnit: 700, quantity: 2, hq: false, retainerName: 'Autre' }] });
    let r = checkListing(mine, undercut, undefined, me, ALL, NOW);
    expect(r.events).toEqual([{ kind: 'undercut', cheapest: 700, percent: 30 }]);
    r = checkListing(mine, undercut, r.memory, me, ALL, NOW + 30 * MIN);
    expect(r.events).toEqual([]);
    r = checkListing(mine, board(), r.memory, me, ALL, NOW + 60 * MIN);
    expect(r.memory.undercutNotified).toBe(false);
    // Seuil de 50 % : 30 % ne suffit pas.
    expect(checkListing(mine, undercut, undefined, me, { ...ALL, undercut: 50 }, NOW).events).toEqual([]);
  });

  it('vendue : vue sur le marché, puis absente avec une vente identique', () => {
    let r = checkListing(mine, board(), undefined, me, ALL, NOW);
    expect(r.memory.onBoard).toBe(NOW - 5 * MIN);
    const after = board({
      lastUploadTime: NOW + 20 * MIN,
      listings: board().listings.slice(1),
      recentHistory: [{ pricePerUnit: 1000, quantity: 10, hq: false, timestamp: (NOW + 10 * MIN) / 1000 }],
    });
    r = checkListing(mine, after, r.memory, me, ALL, NOW + 30 * MIN);
    expect(r.events).toEqual([{ kind: 'sold' }]);
    expect(r.memory.gone).toBe(true);
    // Plus rien ensuite.
    expect(checkListing(mine, after, r.memory, me, ALL, NOW + 60 * MIN).events).toEqual([]);
  });

  it('retirée sans vente : rien à annoncer ; relevé d’Universalis trop ancien : on attend', () => {
    const seen = checkListing(mine, board(), undefined, me, ALL, NOW).memory;
    const removed = board({ lastUploadTime: NOW + 20 * MIN, listings: board().listings.slice(1) });
    expect(checkListing(mine, removed, seen, me, ALL, NOW + 30 * MIN)).toMatchObject({ events: [], memory: { gone: true } });
    const old = board({ lastUploadTime: NOW - 5 * MIN, listings: board().listings.slice(1) });
    expect(checkListing(mine, old, seen, me, ALL, NOW + 30 * MIN).memory.gone).toBeUndefined();
  });

  it('invendue depuis 5 jours : une fois', () => {
    const memory = { firstSeen: NOW - 5 * 86_400_000 - MIN, onBoard: NOW - 10 * MIN };
    const r = checkListing(mine, undefined, memory, me, ALL, NOW);
    expect(r.events).toEqual([{ kind: 'stale', days: 5 }]);
    expect(checkListing(mine, undefined, r.memory, me, ALL, NOW + MIN).events).toEqual([]);
  });
});
