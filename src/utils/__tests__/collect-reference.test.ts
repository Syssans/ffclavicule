import type { CatalogEntry } from '@/api/private';
import { enrich, findReference, formatRarity, indexReference, loadReference } from '@/utils/collect-reference';

const entry = (over: Partial<CatalogEntry>): CatalogEntry => ({ id: 1, name: 'X', icon: 0, tradeable: false, sources: [], ...over });

describe('instantané FFXIV Collect', () => {
  it('apparie par objet, par identifiant ou par nom', () => {
    const facewear = indexReference('facewear', [{ i: 61, n: 'Lunettes demi-cerclées', t: 52448, o: 12 }]);
    // Identifiant différent du jeu : appariement par objet, puis par nom.
    expect(findReference(facewear, entry({ id: 3, name: 'Autre nom', item: 52448 }))?.o).toBe(12);
    expect(findReference(facewear, entry({ id: 3, name: 'lunettes DEMI-cerclees' }))?.o).toBe(12);
    // Même identifiant mais autre élément : pas de confusion.
    expect(findReference(facewear, entry({ id: 61, name: 'Monocle' }))).toBeUndefined();
    // Montures : identifiants du jeu, même si le nom diffère un peu.
    const mounts = indexReference('mounts', [{ i: 1, n: 'Chocobo de compagnie', o: 99.5 }]);
    expect(findReference(mounts, entry({ id: 1, name: 'Chocobo destrier' }))?.o).toBe(99.5);
  });

  it('préfère les provenances de FFXIV Collect, sinon garde celles du plugin', () => {
    const index = indexReference('mounts', [
      { i: 1, n: 'A', o: 3.2, s: [['dungeon', 'Le Palais aux vents']] },
      { i: 2, n: 'B', o: 50 },
    ]);
    const plugin = [{ type: 'purchase', text: '1 000 gils' }];
    expect(enrich(index, entry({ id: 1, name: 'A', sources: plugin }))).toMatchObject({ rarity: 3.2, sources: [{ type: 'dungeon', text: 'Le Palais aux vents' }] });
    expect(enrich(index, entry({ id: 2, name: 'B', sources: plugin }))).toMatchObject({ rarity: 50, sources: plugin });
    expect(enrich(index, entry({ id: 3, name: 'C', sources: plugin })).rarity).toBeUndefined();
  });

  it('formate la rareté', () => {
    expect(formatRarity(12.04)).toBe('12 %');
    expect(formatRarity(0.4)).toBe('0,4 %');
    expect(formatRarity(undefined)).toBeUndefined();
  });

  it('le fichier intégré contient les collections attendues', () => {
    const reference = loadReference();
    expect(Object.keys(reference.collections)).toEqual(
      expect.arrayContaining(['mounts', 'minions', 'orchestrions', 'emotes', 'hairstyles', 'bardings', 'fashions', 'facewear', 'cards', 'spells', 'titles', 'armoire']),
    );
    expect(reference.collections.mounts.length).toBeGreaterThan(300);
    expect(reference.collections.mounts.some((m) => m.s?.some(([type]) => type === 'dungeon'))).toBe(true);
  });
});
