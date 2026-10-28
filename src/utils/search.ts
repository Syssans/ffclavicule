/**
 * Recherche texte de l'appli : on compare des « clés » sans majuscules, accents, ligatures ni ponctuation, pour que
 * « epee », « ÉPÉE » et « Épée » se valent, que « oeil » trouve « Cache-œil » et « poisson gil » trouve « Poisson-gil ».
 *
 * Classement, du meilleur au moins bon : nom identique, nom qui commence par la recherche, chaque mot cherché au
 * début d'un mot du nom, mots cherchés au milieu d'un mot. À égalité, le nom le plus court passe devant.
 */

/** Clé de recherche d'un texte. */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface SearchQuery {
  /** La recherche entière, en clé. */
  key: string;
  /** Ses mots, en clés. */
  words: string[];
}

export function parseQuery(text: string): SearchQuery {
  const key = searchKey(text);
  return { key, words: key ? key.split(' ') : [] };
}

/** Note d'un nom pour une recherche (plus petit = meilleur), ou null s'il ne contient pas tous les mots. */
export function matchScore(key: string, query: SearchQuery): number | null {
  if (!query.words.length) return null;
  let atWordStart = true;
  for (const word of query.words) {
    const at = key.indexOf(word);
    if (at < 0) return null;
    if (at > 0 && !key.includes(` ${word}`)) atWordStart = false;
  }
  const rank = key === query.key ? 0 : key.startsWith(query.key) ? 1 : atWordStart ? 2 : 3;
  // Le rang compte d'abord, puis la longueur du nom (les noms courts sont les plus proches de la recherche).
  return rank * 1000 + Math.min(key.length, 999);
}

/** Les éléments qui correspondent, du plus proche au plus lointain. */
export function rankMatches<T>(entries: readonly T[], keyOf: (entry: T) => string, query: SearchQuery, limit = Infinity): T[] {
  const scored: { entry: T; score: number }[] = [];
  for (const entry of entries) {
    const score = matchScore(keyOf(entry), query);
    if (score !== null) scored.push({ entry, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.entry);
}

/**
 * Passages du texte d'origine à surligner : pour chaque mot cherché, sa première apparition (de préférence au début
 * d'un mot). Les positions renvoyées sont celles du texte d'origine, accents et ponctuation compris.
 */
export function highlightRanges(text: string, query: SearchQuery): [number, number][] {
  // Clé caractère par caractère (sans fusionner les espaces), avec la position d'origine de chaque caractère.
  let key = '';
  const origin: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = searchKey(text[i]) || ' ';
    for (const ch of piece) {
      key += ch;
      origin.push(i);
    }
  }
  const ranges: [number, number][] = [];
  for (const word of query.words) {
    let at = -1;
    for (let from = key.indexOf(word); from >= 0; from = key.indexOf(word, from + 1)) {
      if (at < 0) at = from;
      if (from === 0 || key[from - 1] === ' ') {
        at = from;
        break;
      }
    }
    if (at >= 0) ranges.push([origin[at], origin[at + word.length - 1] + 1]);
  }
  // Dans l'ordre du texte, en fusionnant ce qui se chevauche.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
