import { matchLodestone, referenceTotal } from '@/utils/collect-reference';

describe('montures et mascottes du Lodestone', () => {
  it('retrouve le nom français, la provenance et la rareté à partir du nom anglais', () => {
    const [chocobo, unknown] = matchLodestone('mounts', [
      { name: 'company chocobo', icon: 'https://img/a.png' },
      { name: 'Monture inconnue', icon: null },
    ]);
    expect(chocobo).toMatchObject({ id: 1, name: 'Chocobo destrier', icon: 'https://img/a.png' });
    expect(chocobo.rarity).toBeGreaterThan(50);
    expect(chocobo.sources[0].type).toBe('quest');
    expect(unknown).toEqual({ id: null, name: 'Monture inconnue', icon: null, rarity: undefined, sources: [] });
  });

  it('donne le total de chaque collection', () => {
    expect(referenceTotal('mounts')).toBeGreaterThan(300);
    expect(referenceTotal('minions')).toBeGreaterThan(500);
  });
});
