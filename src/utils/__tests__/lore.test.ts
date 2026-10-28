import { isSpoiler, linkify, loreBacklinks, loreEntries, loreEntry, loreNeighbours, lorePick, searchLore } from '@/utils/lore';

describe('Légende', () => {
  it('rassemble les cinq catégories', () => {
    for (const type of ['perso', 'lieu', 'recit', 'monture', 'mascotte'] as const) expect(loreEntries(type).length).toBeGreaterThan(100);
    expect(loreEntry('p90')?.n).toBe('Ysayle');
  });

  it('relie les fiches dans les deux sens', () => {
    const ysayle = loreBacklinks('p90');
    expect(ysayle.length).toBeGreaterThan(0);
    for (const e of ysayle) expect([...(e.lx ?? []), ...(e.le ?? [])].some(([, , target]) => target === 'p90')).toBe(true);
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
      ['Ysayle', 'p90'],
      ['Ishgard', 'map:218'],
    ]);
  });
});
