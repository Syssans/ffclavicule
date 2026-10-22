import type { CollectionCatalog, PrivateSnapshot } from '@/api/private';
import { filterEntries, itemPlaces, missingEntries, ownedIds, sourceCounts, sourceLabel, usableItems } from '@/utils/collections';

const catalog: CollectionCatalog = {
  schema: 1,
  builtAt: '2026-10-22T10:00:00Z',
  gameVersion: '2026.10.01',
  collections: [
    {
      key: 'mounts',
      label: 'Montures',
      items: [
        { id: 1, name: 'Chocobo destrier', icon: 4001, sources: [{ type: 'quest', text: 'Mon chocobo' }], tradeable: false },
        { id: 2, name: 'Licorne', icon: 4002, item: 6001, tradeable: false, sources: [{ type: 'achievement', text: 'Tant de licornes' }] },
        { id: 3, name: 'Éléphant de fer', icon: 4003, item: 6002, tradeable: true, sources: [{ type: 'purchase', text: '1 000 000 gils' }, { type: 'pvp', text: '30 000 marques de loup' }] },
      ],
    },
    { key: 'minions', label: 'Mascottes', items: [{ id: 9, name: 'Wind-up Cursor', icon: 4500, item: 7000, tradeable: true, sources: [] }] },
  ],
};

const snapshot = {
  schema: 1,
  updatedAt: '2026-10-22T10:00:00Z',
  name: 'Six',
  world: 'Moogle',
  gil: 0,
  currencies: {},
  inventories: [{ key: 'sacs', label: 'Sacs', updatedAt: '', items: [{ id: 6002, qty: 1, hq: false }] }],
  retainers: [{ id: 'r', name: 'Alpha', classJob: 0, level: 1, gil: 0, itemCount: 0, marketItemCount: 0, town: 1, ventureId: 0, ventureComplete: 0, market: [{ id: 7000, qty: 1, hq: false, price: 5000 }] }],
  collections: [
    { key: 'mounts', label: 'Montures', total: 3, owned: [{ id: 1, name: 'Chocobo destrier', icon: 4001 }] },
    { key: 'minions', label: 'Mascottes', total: 1, owned: [] },
  ],
} as PrivateSnapshot;

describe('collections', () => {
  it('liste les manquants et filtre par provenance, marché, poche et nom', () => {
    const missing = missingEntries(catalog.collections[0], ownedIds(snapshot, 'mounts'));
    expect(missing.map((e) => e.id)).toEqual([2, 3]);
    const places = itemPlaces(snapshot);
    expect(filterEntries(missing, 'source:pvp', '', places).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(missing, 'market', '', places).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(missing, 'inventory', '', places).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(missing, 'all', 'elephant', places).map((e) => e.id)).toEqual([3]);
    expect(filterEntries(missing, 'all', '', places).map((e) => e.name)).toEqual(['Éléphant de fer', 'Licorne']);
  });

  it('compte les provenances et les traduit', () => {
    expect(sourceCounts(catalog.collections[0].items)).toEqual([
      { type: 'quest', count: 1 },
      { type: 'achievement', count: 1 },
      { type: 'purchase', count: 1 },
      { type: 'pvp', count: 1 },
    ]);
    expect(sourceLabel('gold-saucer')).toBe('Gold Saucer');
    expect(sourceLabel('inconnu')).toBe('Autre');
  });

  it('repère les objets de collection déjà en poche mais pas utilisés', () => {
    const usable = usableItems(catalog, snapshot);
    expect(usable.map((u) => [u.entry.name, u.places])).toEqual([
      ['Éléphant de fer', ['Sacs']],
      ['Wind-up Cursor', ['Alpha (en vente)']],
    ]);
    expect(usableItems(null, snapshot)).toEqual([]);
  });
});
