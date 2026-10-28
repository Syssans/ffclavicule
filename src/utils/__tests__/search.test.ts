import { searchItemIndex } from '@/utils/items-index';
import { searchMap } from '@/utils/map';
import { highlightRanges, matchScore, parseQuery, rankMatches, searchKey } from '@/utils/search';

describe('clé de recherche', () => {
  it('ignore majuscules, accents, ligatures et ponctuation', () => {
    expect(searchKey('ÉPÉE')).toBe('epee');
    expect(searchKey('Cache-œil')).toBe('cache oeil');
    expect(searchKey('  Poisson-gil ! ')).toBe('poisson gil');
    expect(searchKey('Val d’Aurum')).toBe('val d aurum');
  });
});

describe('classement', () => {
  const names = ['Épée longue', 'Porte-épée', 'Épée', 'Snook-épée', 'Calmar épée géant'];
  const rank = (text: string) => rankMatches(names, searchKey, parseQuery(text));

  it('met le nom identique, puis les noms qui commencent par la recherche, devant', () => {
    expect(rank('epee')).toEqual(['Épée', 'Épée longue', 'Porte-épée', 'Snook-épée', 'Calmar épée géant']);
    expect(rank('EPEE')[0]).toBe('Épée');
  });

  it('accepte les mots dans le désordre', () => {
    expect(rank('geant calmar')).toEqual(['Calmar épée géant']);
    expect(rank('epee x')).toEqual([]);
  });

  it('préfère un mot trouvé au début d’un mot du nom', () => {
    const start = matchScore(searchKey('Minerai de mythrite'), parseQuery('mythr'))!;
    const middle = matchScore(searchKey('Cristal ythrite'), parseQuery('ythr'))!;
    expect(start).toBeLessThan(3000);
    expect(middle).toBeLessThan(3000);
    expect(matchScore(searchKey('Amythrite'), parseQuery('mythr'))).toBeGreaterThanOrEqual(3000);
  });
});

describe('surlignage', () => {
  it('retrouve les mots cherchés dans le texte d’origine', () => {
    const text = 'Cache-œil coeurl';
    const ranges = highlightRanges(text, parseQuery('OEIL'));
    expect(ranges.map(([a, b]) => text.slice(a, b))).toEqual(['œil']);
    const sword = 'Snook-épée';
    expect(highlightRanges(sword, parseQuery('epee snook')).map(([a, b]) => sword.slice(a, b))).toEqual(['Snook', 'épée']);
  });
});

describe('index des objets', () => {
  it('trouve un objet sans accent ni majuscule', () => {
    const { items } = searchItemIndex('NAUTILE');
    expect(items[0]).toMatchObject({ id: 4906, name: 'Nautile', marketable: true });
    expect(items[0].icon).toContain('029006');
  });

  it('ne garde qu’un objet par nom et peut se limiter aux objets vendables', () => {
    const all = searchItemIndex('epee', { limit: 500 });
    expect(new Set(all.items.map((i) => i.name)).size).toBe(all.items.length);
    expect(searchItemIndex('epee', { marketableOnly: true, limit: 500 }).items.every((i) => i.marketable)).toBe(true);
  });

  it('ne cherche rien avant deux caractères', () => {
    expect(searchItemIndex('é').total).toBe(0);
  });
});

describe('recherche sur la carte', () => {
  it('classe les instances et lieux, sans tenir compte des accents', () => {
    // L'entrée du donjon (sur la carte de la zone) et le donjon lui-même portent le même nom : tous deux en tête.
    const top = searchMap('SASTASHA').slice(0, 2);
    expect(top.map((r) => r.title)).toEqual(['Sastasha', 'Sastasha']);
    expect(top.map((r) => r.kind).sort()).toEqual(['instance', 'place']);
    expect(searchMap('etherite').length).toBeGreaterThan(0);
  });
});
