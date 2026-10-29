import {
  articleParagraphs,
  isSpoiler,
  linkify,
  loreBacklinks,
  loreCardsOf,
  loreEntries,
  loreEntry,
  loreNeighbours,
  lorePick,
  searchLore,
} from '@/utils/lore';

describe('Légende', () => {
  it('rassemble les catégories, avec les fiches rédigées', () => {
    for (const type of ['perso', 'lieu', 'recit', 'monture', 'mascotte'] as const) expect(loreEntries(type).length).toBeGreaterThan(100);
    expect(loreEntries('notion').length).toBeGreaterThan(10);
    // La carte d'Ysayle mène à sa fiche rédigée.
    expect(loreEntry('p90')?.k).toBe('x-ysayle');
  });

  it('une seule fiche par personnage, avec toutes ses cartes', () => {
    expect(loreEntry('p201')).toBe(loreEntry('p346'));
    const zenos = loreEntry('x-zenos')!;
    expect(loreCardsOf(zenos).map((c) => c.k)).toEqual(['p201', 'p346']);
    expect(loreEntries('perso').filter((e) => e.n.startsWith('Zenos'))).toHaveLength(1);
  });

  it('relie les fiches dans les deux sens', () => {
    const ysayle = loreBacklinks('p90');
    expect(ysayle.length).toBeGreaterThan(0);
    for (const e of ysayle)
      expect([...(e.lx ?? []), ...(e.le ?? []), ...(e.lb ?? []).flat()].some(([, , target]) => target === 'x-ysayle')).toBe(true);
    // Les mentions d'Eulmore dans les textes du jeu mènent à la fiche de la cité.
    expect(loreBacklinks('x-eulmore').some((e) => e.t === 'lieu' && !e.b)).toBe(true);
  });

  it('trouve un personnage par ses autres noms', () => {
    expect(searchLore('hades')[0].entry.k).toBe('x-emet-selch');
    expect(searchLore('exarque')[0].entry.k).toBe('x-graha');
  });

  it('voile la suite d’un article au-delà de la progression', () => {
    const emet = loreEntry('x-emet-selch')!;
    expect(articleParagraphs(emet, 2).map((p) => p.hidden)).toEqual([false, true, true]);
    expect(articleParagraphs(emet, 5).every((p) => !p.hidden)).toBe(true);
  });

  it('trouve par le nom puis par le texte, sans accents ni majuscules', () => {
    const hits = searchLore('NIDHOGG');
    expect(hits[0]).toMatchObject({ byName: true });
    expect(hits[0].entry.n).toBe('Nidhogg');
    const mention = hits.find((h) => !h.byName);
    expect(mention?.snippet?.toLowerCase()).toContain('nidhogg');
  });

  it('voile ce qui vient après la progression', () => {
    expect(isSpoiler({ v: 4 }, 2)).toBe(true);
    expect(isSpoiler({ v: 1 }, 2)).toBe(false);
    expect(isSpoiler({}, 0)).toBe(false);
  });

  it('feuillette et tire au sort de façon stable', () => {
    const first = loreEntries('lieu')[0];
    expect(loreNeighbours(first).previous).toBeUndefined();
    expect(loreNeighbours(first).next).toBeDefined();
    expect(lorePick('perso', 5, 42).map((e) => e.k)).toEqual(lorePick('perso', 5, 42).map((e) => e.k));
  });

  it('relie les noms d’un texte écrit pour l’appli', () => {
    const text = 'Ysayle rejoint Ishgard.';
    const links = linkify(text, [{ id: 218, name: 'Ishgard' }]);
    expect(links.map(([start, length, target]) => [text.slice(start, start + length), target])).toEqual([
      ['Ysayle', 'x-ysayle'],
      ['Ishgard', 'x-ishgard'],
    ]);
  });
});
