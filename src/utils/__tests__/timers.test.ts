import { eorzeaTime, formatCountdown, formatEorzeaTime, nextUtc, upcomingResets } from '@/utils/timers';

// Mercredi 22 octobre 2026, 14 h 30 UTC.
const NOW = Date.UTC(2026, 9, 22, 14, 30);

describe('heure d’Éorzéa et réinitialisations', () => {
  it('calcule l’heure d’Éorzéa', () => {
    expect(eorzeaTime(0)).toEqual({ hours: 0, minutes: 0 });
    // 175 secondes réelles = 1 heure d'Éorzéa ; 70 minutes = une journée.
    expect(eorzeaTime(175_000)).toEqual({ hours: 1, minutes: 0 });
    expect(eorzeaTime(70 * 60_000)).toEqual({ hours: 0, minutes: 0 });
    expect(formatEorzeaTime(175_000 * 13.5)).toBe('13:30');
  });

  it('trouve la prochaine occurrence', () => {
    expect(nextUtc(NOW, 15)).toBe(Date.UTC(2026, 9, 22, 15));
    expect(nextUtc(NOW, 8)).toBe(Date.UTC(2026, 9, 23, 8));
    // Mardi suivant, 8 h UTC.
    expect(nextUtc(NOW, 8, 2)).toBe(Date.UTC(2026, 9, 27, 8));
    // Un mardi après 8 h : la semaine suivante.
    expect(nextUtc(Date.UTC(2026, 9, 27, 9), 8, 2)).toBe(Date.UTC(2026, 10, 3, 8));
  });

  it('range les réinitialisations de la plus proche à la plus lointaine', () => {
    const resets = upcomingResets(NOW, 'eu');
    expect(resets.map((r) => r.key)).toEqual(['daily', 'gc', 'cactpot', 'weekly']);
    expect(resets[0].at - NOW).toBe(30 * 60_000);
  });

  it('formate un compte à rebours', () => {
    expect(formatCountdown(30 * 60_000)).toBe('30 min');
    expect(formatCountdown((3 * 60 + 5) * 60_000)).toBe('3 h 05');
    expect(formatCountdown((2 * 1440 + 4 * 60) * 60_000)).toBe('2 j 4 h');
  });
});
