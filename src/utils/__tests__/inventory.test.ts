import type { PrivateSnapshot } from '@/api/private';
import { allItemIds, findItems, fold } from '@/utils/inventory';

const snapshot: PrivateSnapshot = {
  schema: 1,
  updatedAt: '2026-10-22T12:00:00Z',
  name: 'Six Clavicule',
  world: 'Moogle',
  gil: 1000,
  currencies: {},
  inventories: [
    { key: 'sacs', label: 'Sacs', updatedAt: '', items: [{ id: 5057, qty: 12, hq: false }, { id: 2, qty: 300, hq: false }] },
    { key: 'sacoche', label: 'Sacoche de chocobo', updatedAt: '', items: [{ id: 5057, qty: 3, hq: false }] },
  ],
  retainers: [
    {
      id: '1', name: 'Alpha', classJob: 18, level: 100, gil: 0, itemCount: 1, marketItemCount: 1, town: 1, ventureId: 0, ventureComplete: 0,
      items: [{ id: 7, qty: 1, hq: true }],
      market: [{ id: 5057, qty: 99, hq: false, price: 120 }],
    },
  ],
  mail: { updatedAt: '', letters: [{ sender: 'Moogle', timestamp: 1, preview: '', read: false, gil: 0, attachments: [{ id: 9, qty: 1, hq: false }] }] },
};

const names = new Map([
  [5057, { name: 'Lingot de fer' }],
  [2, { name: 'Éclat de feu' }],
  [7, { name: 'Épée longue' }],
  [9, { name: 'Potion' }],
]);

describe('inventaire', () => {
  it('liste tous les objets mentionnés, une fois chacun', () => {
    expect(allItemIds(snapshot)).toEqual([2, 7, 9, 5057]);
  });

  it('cherche partout, sans tenir compte des accents', () => {
    expect(fold('Épée')).toBe('epee');
    const fer = findItems(snapshot, names, 'fer lingot');
    expect(fer.map((f) => f.place)).toEqual(['Sacs', 'Sacoche de chocobo', 'Alpha (en vente)']);
    expect(findItems(snapshot, names, 'epee')[0]).toMatchObject({ place: 'Alpha', hq: true });
    expect(findItems(snapshot, names, '   ')).toEqual([]);
  });
});
