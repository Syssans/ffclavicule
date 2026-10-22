import { formatAgo, formatGil, percent, toMillis } from '../format';

describe('mise en forme', () => {
  it('affiche les gils avec séparateurs français', () => {
    // Intl insère une espace insécable fine entre les milliers.
    expect(formatGil(1234567).replace(/\s/g, ' ')).toBe('1 234 567 gils');
    expect(formatGil(null)).toBe('—');
  });

  it('affiche une durée relative', () => {
    const now = 1_000_000_000_000;
    expect(formatAgo(now - 30_000, now)).toBe("à l'instant");
    expect(formatAgo(now - 5 * 60_000, now)).toBe('il y a 5 min');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('il y a 3 h');
    expect(formatAgo(now - 2 * 86_400_000, now)).toBe('il y a 2 j');
    expect(formatAgo(null, now)).toBe('jamais');
  });

  it('accepte les dates Universalis en secondes ou millisecondes', () => {
    expect(toMillis(1_760_000_000)).toBe(1_760_000_000_000);
    expect(toMillis(1_760_000_000_000)).toBe(1_760_000_000_000);
  });

  it('calcule un pourcentage sans diviser par zéro', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(5, 0)).toBe(0);
  });
});
