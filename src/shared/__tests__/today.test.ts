import { lastReset, nextReset, remainingBefore, remainingText, TASK_BY_KEY, taskState, trackedStates, type DutyProgress } from '@/shared/today';

// Jeudi 29 octobre 2026, 14 h UTC : une heure avant la réinitialisation quotidienne.
const NOW = Date.UTC(2026, 9, 29, 14, 0);
const HOUR = 3_600_000;

const progress = (over: Partial<DutyProgress> = {}, at = NOW - HOUR): DutyProgress => ({
  updatedAt: new Date(at).toISOString(),
  dailyCycle: 0,
  weeklyCycle: 0,
  roulettes: [5],
  tribeAllowances: 6,
  mapReadyAt: 0,
  deliveries: 4,
  bingo: { journal: true, stickers: 7, expiresAt: NOW / 1000 + 86400 * 5, secondChances: 1, turnedIn: false },
  tomestones: 450,
  tomestoneLimit: 450,
  ...over,
});

describe('réinitialisations', () => {
  it('quotidienne à 15 h, hebdomadaire le mardi à 8 h, Cactpot selon la région', () => {
    expect(nextReset({ hour: 15 }, NOW)).toBe(Date.UTC(2026, 9, 29, 15));
    expect(lastReset({ hour: 15 }, NOW)).toBe(Date.UTC(2026, 9, 28, 15));
    expect(nextReset({ hour: 8, weekday: 2 }, NOW)).toBe(Date.UTC(2026, 10, 3, 8));
    expect(lastReset({ hour: 8, weekday: 2 }, NOW)).toBe(Date.UTC(2026, 9, 27, 8));
    expect(nextReset({ cactpot: true }, NOW, 'eu')).toBe(Date.UTC(2026, 9, 31, 19));
    expect(nextReset({ cactpot: true }, NOW, 'na')).toBe(Date.UTC(2026, 10, 1, 2));
  });
});

describe('état des tâches', () => {
  it('lit le jeu tant que le relevé est de ce cycle', () => {
    const expert = taskState(TASK_BY_KEY.get('roulette:5')!, progress(), undefined, NOW);
    expect(expert).toMatchObject({ done: true, fromGame: true });
    const tribes = taskState(TASK_BY_KEY.get('tribes')!, progress(), undefined, NOW);
    expect(tribes).toMatchObject({ done: false, detail: '6 quêtes', fromGame: true });
    expect(taskState(TASK_BY_KEY.get('wondrous')!, progress(), undefined, NOW).detail).toBe('7/9');
    expect(taskState(TASK_BY_KEY.get('tomestones')!, progress(), undefined, NOW).done).toBe(true);
  });

  it('ignore un relevé d’avant la réinitialisation, sauf pour la carte', () => {
    const old = progress({ mapReadyAt: NOW / 1000 + 3 * 3600 }, Date.UTC(2026, 9, 28, 14));
    expect(taskState(TASK_BY_KEY.get('roulette:5')!, old, undefined, NOW)).toMatchObject({ done: false, fromGame: false });
    expect(taskState(TASK_BY_KEY.get('map')!, old, undefined, NOW)).toMatchObject({ done: true, detail: 'Dans 3 h 00' });
  });

  it('une case cochée compte jusqu’à la réinitialisation suivante', () => {
    const mini = TASK_BY_KEY.get('miniCactpot')!;
    expect(taskState(mini, null, NOW - HOUR, NOW).done).toBe(true);
    expect(taskState(mini, null, Date.UTC(2026, 9, 28, 14, 59), NOW).done).toBe(false);
    // La Grande Compagnie revient à 20 h : cochée à 19 h la veille, elle ne compte plus.
    expect(taskState(TASK_BY_KEY.get('gc')!, null, Date.UTC(2026, 9, 28, 19), NOW).done).toBe(false);
    expect(taskState(TASK_BY_KEY.get('gc')!, null, Date.UTC(2026, 9, 28, 21), NOW).done).toBe(true);
  });

  it('carnet de Khloé : à prendre, à rendre, rendu', () => {
    const wondrous = TASK_BY_KEY.get('wondrous')!;
    const bingo = (b: Partial<NonNullable<DutyProgress['bingo']>>) => progress({ bingo: { ...progress().bingo!, ...b } });
    expect(taskState(wondrous, bingo({ journal: false }), undefined, NOW).detail).toBe('Carnet à prendre');
    expect(taskState(wondrous, bingo({ stickers: 9 }), undefined, NOW)).toMatchObject({ done: false, detail: 'À rendre à Khloé' });
    expect(taskState(wondrous, bingo({ journal: false, turnedIn: true }), undefined, NOW).done).toBe(true);
  });
});

describe('rappel avant la réinitialisation', () => {
  it('ne cite que les tâches qui reviennent à cette heure-là', () => {
    const tracked = ['roulette:5', 'roulette:6', 'tribes', 'map', 'gc', 'miniCactpot', 'wondrous'];
    const left = remainingBefore('daily', tracked, progress(), { miniCactpot: NOW - HOUR }, NOW);
    expect(left.map((s) => s.task.key)).toEqual(['roulette:6', 'tribes']);
    expect(remainingText(left)).toBe('Défis, Peuples alliés (6 quêtes)');
    expect(remainingText(remainingBefore('weekly', tracked, progress(), {}, NOW))).toBe('Aventures imaginaires (7/9)');
  });

  it('regroupe les missions aléatoires quand il en reste beaucoup', () => {
    const tracked = ['roulette:1', 'roulette:2', 'roulette:3', 'roulette:4'];
    expect(remainingText(remainingBefore('daily', tracked, null, {}, NOW))).toBe('4 missions aléatoires');
    expect(trackedStates(tracked, null, {}, NOW)).toHaveLength(4);
  });
});
