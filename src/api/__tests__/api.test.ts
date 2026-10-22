import { getCollections } from '../ffxivcollect';
import { ApiError, getJson } from '../http';
import { getMarket, getPriceSummaries } from '../universalis';
import { escapeQueryValue, getItem, iconUrl, searchItems } from '../xivapi';

type Handler = (url: string) => { status?: number; body: unknown };

let calls: string[] = [];

function mockFetch(handler: Handler) {
  calls = [];
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

afterEach(() => jest.restoreAllMocks());

describe('http', () => {
  it('traduit les codes HTTP en messages lisibles', async () => {
    mockFetch(() => ({ status: 429, body: {} }));
    await expect(getJson('https://x', { source: 'Universalis' })).rejects.toThrow('Universalis reçoit trop de demandes');
    mockFetch(() => ({ status: 404, body: {} }));
    await expect(getJson('https://x', { source: 'XIVAPI' })).rejects.toMatchObject({ status: 404, source: 'XIVAPI' });
  });

  it('signale une coupure réseau', async () => {
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch;
    await expect(getJson('https://x', { source: 'le Lodestone' })).rejects.toThrow('Impossible de joindre le Lodestone');
  });
});

const listing = (price: number, world: string) => ({
  pricePerUnit: price,
  quantity: 2,
  total: price * 2,
  hq: false,
  worldName: world,
  retainerName: 'Retainer',
  lastReviewTime: 1760000000,
});

const market = (itemID: number, minPrice: number) => ({
  itemID,
  lastUploadTime: 1760000000000,
  listings: [listing(minPrice, 'Moogle')],
  recentHistory: [],
  currentAveragePrice: minPrice,
  averagePrice: minPrice * 1.2,
  minPrice,
  minPriceNQ: minPrice,
  minPriceHQ: 0,
  regularSaleVelocity: 3.5,
  unitsForSale: 2,
  listingsCount: 1,
  dcName: 'Chaos',
});

describe('Universalis', () => {
  it('interroge le bon centre de données', async () => {
    mockFetch(() => ({ body: market(5057, 100) }));
    const data = await getMarket('Chaos', 5057);
    expect(calls[0]).toBe('https://universalis.app/api/v2/Chaos/5057?listings=20&entries=20');
    expect(data.listings[0].worldName).toBe('Moogle');
  });

  it('résume les prix de plusieurs objets, par paquets de 100', async () => {
    mockFetch((url) => {
      const ids = url.split('/v2/Chaos/')[1].split('?')[0].split(',').map(Number);
      const items = Object.fromEntries(ids.filter((id) => id !== 3).map((id) => [id, market(id, id * 10)]));
      return { body: { itemIDs: ids, items, unresolvedItems: [3] } };
    });
    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    const summaries = await getPriceSummaries('Chaos', ids);
    expect(calls).toHaveLength(2);
    expect(summaries).toHaveLength(150);
    expect(summaries[0]).toEqual({
      itemId: 1,
      minPrice: 10,
      averagePrice: 12,
      velocity: 3.5,
      cheapestWorld: 'Moogle',
      lastUploadTime: 1760000000000,
    });
    // Objet inconnu d'Universalis : pas de prix plutôt qu'une erreur.
    expect(summaries[2]).toMatchObject({ itemId: 3, minPrice: null });
  });

  it("gère la réponse simple d'Universalis pour un seul objet", async () => {
    mockFetch(() => ({ body: market(5057, 250) }));
    expect(await getPriceSummaries('Moogle', [5057, 5057])).toEqual([
      expect.objectContaining({ itemId: 5057, minPrice: 250 }),
    ]);
  });
});

const itemRow = (rowId: number, name: string, searchCategory: number) => ({
  row_id: rowId,
  score: 1,
  sheet: 'Item',
  fields: {
    Name: name,
    Description: '  Un minerai.  ',
    Icon: { id: 21206, path: 'ui/icon/021000/021206.tex', path_hr1: 'ui/icon/021000/021206_hr1.tex' },
    LevelItem: 10,
    LevelEquip: 1,
    ItemSearchCategory: searchCategory,
    StackSize: 999,
    Rarity: 1,
    ItemUICategory: { value: 48, sheet: 'ItemUICategory', row_id: 48, fields: { Name: 'Matériau' } },
  },
});

describe('XIVAPI', () => {
  it('cherche des objets en français et filtre ceux qui ne se vendent pas', async () => {
    mockFetch(() => ({ body: { results: [itemRow(5111, 'Minerai de fer', 47), itemRow(9999, 'Objet de quête', 0)] } }));
    const items = await searchItems('minerai', { marketableOnly: true });
    const url = new URL(calls[0]);
    expect(url.pathname).toBe('/api/search');
    expect(url.searchParams.get('sheets')).toBe('Item');
    expect(url.searchParams.get('query')).toBe('+Name~"minerai"');
    expect(url.searchParams.get('language')).toBe('fr');
    expect(url.searchParams.get('fields')).toContain('ItemSearchCategory@as(raw)');
    expect(items).toEqual([
      {
        id: 5111,
        name: 'Minerai de fer',
        description: 'Un minerai.',
        icon: 'https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F021000%2F021206_hr1.tex&format=png',
        itemLevel: 10,
        equipLevel: 1,
        category: 'Matériau',
        marketable: true,
        stackSize: 999,
        rarity: 1,
      },
    ]);
  });

  it("n'envoie pas de recherche trop courte et neutralise les guillemets", async () => {
    mockFetch(() => ({ body: { results: [] } }));
    expect(await searchItems('a')).toEqual([]);
    expect(calls).toHaveLength(0);
    expect(escapeQueryValue(' dague "de" fer\\ ')).toBe('dague de fer');
  });

  it('lit un objet par son identifiant', async () => {
    mockFetch(() => ({ body: itemRow(5111, 'Minerai de fer', 47) }));
    const item = await getItem(5111);
    expect(new URL(calls[0]).pathname).toBe('/api/sheet/Item/5111');
    expect(item.name).toBe('Minerai de fer');
  });

  it("n'invente pas d'icône absente", () => {
    expect(iconUrl(undefined)).toBeNull();
    expect(iconUrl({ id: 0, path: '', path_hr1: '' })).toBeNull();
  });
});

describe('FFXIV Collect', () => {
  it('résume les collections publiques et privées', async () => {
    mockFetch(() => ({
      body: {
        id: 12345678,
        name: 'Anton Millien',
        server: 'Moogle',
        last_parsed: '2026-10-20T10:00:00Z',
        achievements: { count: 1500, total: 3000, points: 15000, points_total: 30000, public: true },
        mounts: { count: 250, total: 400, ranked_count: 200, ranked_total: 350 },
        minions: { count: 0, total: 500, public: false },
        orchestrions: { count: 100, total: 700 },
        emotes: { count: 0, total: 0 },
        bardings: { count: 10, total: 100 },
        hairstyles: { count: 30, total: 60 },
      },
    }));
    const data = await getCollections(12345678);
    expect(calls[0]).toBe('https://ffxivcollect.com/api/characters/12345678?language=fr');
    expect(data?.achievementPoints).toBe(15000);
    expect(data?.collections.map((c) => c.key)).toEqual(['achievements', 'mounts', 'minions', 'orchestrions', 'hairstyles', 'bardings']);
    expect(data?.collections.find((c) => c.key === 'minions')).toMatchObject({ isPublic: false });
    expect(data?.collections.find((c) => c.key === 'mounts')).toMatchObject({ count: 250, total: 400, label: 'Montures' });
  });

  it('renvoie null pour un personnage pas encore importé', async () => {
    mockFetch(() => ({ status: 404, body: { status: 404, error: 'Not found' } }));
    expect(await getCollections(1)).toBeNull();
  });

  it('remonte les autres erreurs', async () => {
    mockFetch(() => ({ status: 403, body: { status: 403, error: 'Character is set to private' } }));
    await expect(getCollections(1)).rejects.toBeInstanceOf(ApiError);
  });
});
