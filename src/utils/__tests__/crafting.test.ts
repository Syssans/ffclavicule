import { toCraftLeve, toRecipe, type CraftLeve, type Recipe } from '@/api/crafting';
import type { PrivateSnapshot } from '@/api/private';
import { getCraftPrices, parseAggregated, type CraftPrice } from '@/api/universalis';
import {
  CRAFTERS,
  craftTree,
  leveBrackets,
  makeBook,
  ownedCounts,
  ownedItems,
  planCrafts,
  rankProfits,
  recipeProfit,
  turnInsNeeded,
  unitCosts,
} from '@/utils/crafting';

const ing = (itemId: number, amount: number, name = `Objet ${itemId}`) => ({ itemId, name, icon: null, amount });
const recipe = (id: number, itemId: number, name: string, ingredients: Recipe['ingredients'], crystals: Recipe['crystals'] = [], patch: Partial<Recipe> = {}): Recipe => ({
  id,
  itemId,
  name,
  icon: null,
  amount: 1,
  craftType: 1,
  level: 50,
  stars: 0,
  canHq: true,
  expert: false,
  masterBook: null,
  ingredients,
  crystals,
  ...patch,
});

// Épée = 2 lingots + 1 cuir + 3 éclats de feu ; lingot (par 2) = 3 minerais + 1 éclat de feu.
const ingot = recipe(10, 100, 'Lingot', [ing(500, 3, 'Minerai')], [ing(2, 1, 'Éclat de feu')], { amount: 2 });
const sword = recipe(20, 200, 'Épée', [ing(100, 2, 'Lingot'), ing(600, 1, 'Cuir')], [ing(2, 3, 'Éclat de feu')]);
const book = makeBook([ingot, sword]);

const price = (nqMin: number | null, hqMin: number | null = null, velocity = 0): CraftPrice => ({
  nq: { min: nqMin, average: null, velocity },
  hq: { min: hqMin, average: null, velocity: 0 },
});

describe('données des recettes', () => {
  it('lit une recette du jeu : ingrédients, cristaux, niveau, livre de maître', () => {
    const r = toRecipe({
      row_id: 1,
      fields: {
        ItemResult: { value: 5056, fields: { Name: 'Lingot de bronze', Icon: { id: 20803, path: '', path_hr1: 'ui/icon/020000/020803_hr1.tex' } } },
        AmountResult: 1,
        Ingredient: [{ value: 5106, fields: { Name: 'Minerai de cuivre' } }, { value: 0 }, { value: 2, fields: { Name: 'Éclat de feu' } }, { value: -1 }],
        AmountIngredient: [2, 0, 1, 0],
        CraftType: { value: 1 },
        RecipeLevelTable: { value: 1, fields: { ClassJobLevel: 1, Stars: 0 } },
        CanHq: true,
        SecretRecipeBook: { value: 0, fields: { Name: '' } },
      },
    })!;
    expect(r).toMatchObject({ itemId: 5056, name: 'Lingot de bronze', craftType: 1, level: 1, masterBook: null });
    expect(r.ingredients).toEqual([{ itemId: 5106, name: 'Minerai de cuivre', icon: null, amount: 2 }]);
    expect(r.crystals.map((c) => c.itemId)).toEqual([2]);
  });

  it('lit un mandat et additionne les objets répétés', () => {
    const leve = toCraftLeve({
      row_id: 9,
      fields: {
        Item: [{ value: 7, fields: { Name: 'Katzbalger' } }, { value: 7, fields: { Name: 'Katzbalger' } }, { value: 0 }],
        ItemCount: [1, 1, 0],
        Repeats: 2,
        Leve: { value: 971, fields: { Name: 'Grand mandat', ClassJobLevel: 50, ExpReward: 1000, GilReward: 30, LeveClient: { value: 1, fields: { Name: 'Client : Handeloup' } } } },
      },
    })!;
    expect(leve).toMatchObject({ id: 971, level: 50, exp: 1000, client: 'Handeloup', repeats: 2 });
    expect(leve.items).toEqual([{ itemId: 7, name: 'Katzbalger', icon: null, count: 2 }]);
  });

  it('lit les prix agrégés au plus près du serveur choisi', () => {
    const prices = parseAggregated({
      results: [{ itemId: 5, nq: { minListing: { dc: { price: 30 }, region: { price: 20 } }, dailySaleVelocity: { dc: { quantity: 4.5 } } }, hq: {} }],
    });
    expect(prices.get(5)).toEqual({ nq: { min: 30, average: null, velocity: 4.5 }, hq: { min: null, average: null, velocity: 0 } });
  });

  it('ignore les objets qu’Universalis ne connaît pas encore', async () => {
    // Universalis répond 400 à un paquet qui ne contient que des objets inconnus (ici 999).
    const fetchMock = jest.fn(async (url: string) => {
      const ids = url.split('/').pop()!.split(',').map(Number);
      if (ids.every((id) => id === 999)) return { ok: false, status: 400, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ results: ids.filter((id) => id !== 999).map((itemId) => ({ itemId, nq: { minListing: { dc: { price: itemId } } } })) }) };
    });
    const original = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    try {
      const prices = await getCraftPrices('Chaos', [5, 999]);
      expect([...prices.keys()]).toEqual([5]);
      expect(prices.get(5)?.nq.min).toBe(5);
    } finally {
      global.fetch = original;
    }
  });

  it('connaît les huit artisans dans l’ordre des disciplines', () => {
    expect(CRAFTERS.map((c) => [c.craftType, c.job.abbr])).toEqual([
      [0, 'MEN'], [1, 'FRG'], [2, 'ARM'], [3, 'ORF'], [4, 'TAN'], [5, 'COU'], [6, 'ALC'], [7, 'CUI'],
    ]);
  });
});

describe('arbre et liste de courses', () => {
  it('construit l’arbre complet, sous-recettes comprises', () => {
    const tree = craftTree(sword, 3, book);
    expect(tree.crafts).toBe(3);
    const ingots = tree.children.find((c) => c.itemId === 100)!;
    // 6 lingots = 3 fabrications (2 par fabrication) = 9 minerais.
    expect(ingots).toMatchObject({ quantity: 6, crafts: 3 });
    expect(ingots.children.find((c) => c.itemId === 500)?.quantity).toBe(9);
  });

  it('additionne les besoins et fabrique les étapes avant l’objet final', () => {
    const plan = planCrafts([{ recipe: sword, quantity: 3 }], book);
    expect(plan.steps.map((s) => [s.name, s.crafts])).toEqual([
      ['Lingot', 3],
      ['Épée', 3],
    ]);
    expect(plan.materials.map((m) => [m.name, m.need])).toEqual([
      ['Cuir', 3],
      ['Minerai', 9],
    ]);
    // 3 éclats pour les lingots + 9 pour les épées.
    expect(plan.crystals[0]).toMatchObject({ itemId: 2, need: 12 });
  });

  it('utilise d’abord ce qu’on possède, y compris les étapes déjà fabriquées', () => {
    const plan = planCrafts([{ recipe: sword, quantity: 3 }], book, new Map([[100, 4], [500, 5], [200, 10]]));
    const ingots = plan.steps.find((s) => s.itemId === 100)!;
    // 4 lingots possédés : il en reste 2 à fabriquer (1 fabrication), donc 3 minerais, déjà possédés.
    expect(ingots).toMatchObject({ need: 6, owned: 4, missing: 2, crafts: 1 });
    expect(plan.materials.find((m) => m.itemId === 500)).toMatchObject({ need: 3, owned: 3, missing: 0 });
    // Les épées demandées sont fabriquées même si on en possède.
    expect(plan.steps.find((s) => s.itemId === 200)).toMatchObject({ owned: 0, crafts: 3 });
  });
});

describe('coûts et rentabilité', () => {
  const prices = new Map<number, CraftPrice>([
    [500, price(100)],
    [600, price(500)],
    [2, price(10)],
    [100, price(400)],
    [200, price(2000, 3000, 6)],
  ]);

  it('choisit d’acheter ou de fabriquer chaque étape au moins cher', () => {
    const cost = unitCosts(book, prices);
    // Lingot fabriqué : (3 × 100 + 10) / 2 = 155, moins cher que 400 au marché.
    expect(cost(100)).toEqual({ buy: 400, craft: 155, best: 155, choice: 'craft' });
    const profit = recipeProfit(sword, cost, prices.get(200));
    // Épée : 2 × 155 + 500 + 3 × 10 = 840 ; vendue HQ 3 000.
    expect(profit).toMatchObject({ craftCost: 840, sale: 3000, hq: true, profit: 2160, velocity: 6 });
  });

  it('retient un prix de vente prudent', () => {
    const cost = unitCosts(book, prices);
    const pricey: CraftPrice = { nq: { min: null, average: null, velocity: 0 }, hq: { min: 9000, average: 2500, velocity: 3 } };
    expect(recipeProfit(sword, cost, pricey).sale).toBe(2500);
  });

  it('classe les recettes qui se vendent par bénéfice possible par jour', () => {
    const slow = recipe(30, 300, 'Bague', [ing(500, 1)], [], { canHq: false });
    const rows = rankProfits([sword, slow], new Map([...prices, [300, price(5000, null, 0.1)]]));
    // La bague ne se vend presque pas : écartée. L'épée, ingrédients achetés tels quels : 2×400 + 500 + 30 = 1 330.
    expect(rows.map((r) => [r.recipe.name, r.craftCost, r.profit, r.perDay])).toEqual([['Épée', 1330, 1670, 10020]]);
  });
});

describe('inventaire et montée en niveau', () => {
  it('compte ce qu’on possède, partout', () => {
    const snapshot = {
      inventories: [{ key: 'sacs', label: 'Sacs', updatedAt: '', items: [{ id: 500, qty: 3, hq: false }, { id: 500, qty: 2, hq: true }] }],
      retainers: [{ name: 'Alpha', items: [{ id: 500, qty: 4, hq: false }], crystals: [{ id: 2, qty: 99, hq: false }], market: [{ id: 500, qty: 9, hq: false, price: 1 }] }],
    } as unknown as PrivateSnapshot;
    const owned = ownedItems(snapshot);
    expect(owned.get(500)).toEqual({ count: 9, places: [{ place: 'Sacs', count: 5 }, { place: 'Alpha', count: 4 }] });
    expect(ownedCounts(owned).get(2)).toBe(99);
  });

  it('propose les mandats du bon palier et compte les remises', () => {
    const leve = (level: number, exp: number) => ({ id: level, name: '', level, exp, gil: 0, place: null, client: null, repeats: 0, items: [] }) as CraftLeve;
    const leves = [leve(45, 10), leve(50, 20), leve(52, 30), leve(54, 40)];
    expect(leveBrackets(leves, 53)).toEqual([52, 50]);
    expect(turnInsNeeded(100, leve(52, 30))).toBe(4);
    expect(turnInsNeeded(100, leve(52, 30), true)).toBe(2);
  });
});
