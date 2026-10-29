import { TASK_BY_KEY, type DutyProgress } from '@/shared/today';
import {
  billByIndex,
  billTargets,
  hoursText,
  huntData,
  huntZone,
  mainMarks,
  markName,
  mergeKills,
  planHuntReminders,
  respawnWindow,
  sRankNote,
  spawnPoints,
  windowState,
  type HuntKill,
} from '@/utils/hunt';

const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 29, 12);

describe('données de chasse', () => {
  it('chaque zone a un rang S, des rangs A et B, et des points d’apparition', () => {
    const zones = huntData().zones;
    expect(zones).toHaveLength(47);
    for (const zone of zones) {
      const marks = mainMarks(zone);
      expect(marks.filter((m) => m.r === 'S')).toHaveLength(1);
      expect(marks.filter((m) => m.r === 'A').length).toBe(zone.x === 0 ? 1 : 2);
      expect(spawnPoints(zone.t, 'S').length).toBeGreaterThan(0);
      // Tous les rangs S ont une condition rédigée.
      expect(sRankNote(zone.t)?.how).toBeTruthy();
    }
    // Shadowbringers et après : l'événement du rang SS.
    expect(mainMarks(huntZone(956)!).some((m) => m.r === 'SS')).toBe(true);
  });

  it('noms français, comme des noms propres', () => {
    const bonnacon = huntZone(138)!.marks.find((m) => m.r === 'S')!;
    expect(markName(bonnacon.n)).toBe('Bonnacon');
    const hellsclaw = huntZone(137)!.marks.find((m) => m.r === 'A')!;
    expect(markName(hellsclaw.n)).toBe('Griffe des enfers magitek');
  });

  it('contrats : cibles possibles, positions sur la carte', () => {
    const elite = billByIndex(21)!;
    expect(elite.type).toBe('elite');
    const targets = billTargets(elite);
    expect(targets.length).toBeGreaterThan(5);
    expect(targets.filter((t) => t.target.c.length > 0).length).toBeGreaterThan(targets.length / 2);
  });
});

describe('réapparition', () => {
  it('délais selon le rang et l’extension', () => {
    expect(respawnWindow('A', 138)?.window).toEqual([3.5, 4.5]);
    expect(respawnWindow('A', 1187)?.window).toEqual([4, 6]);
    expect(respawnWindow('S', 1187)).toEqual({ window: [84, 132], afterMaintenance: [50, 80] });
    // A Realm Reborn : délai propre à chaque rang S, connu pour certains seulement.
    expect(respawnWindow('S', 154)?.window).toEqual([57, 63]);
    expect(respawnWindow('S', 138)).toBeNull();
    expect(respawnWindow('B', 138)).toBeNull();
    expect(hoursText([3.5, 4.5])).toBe('3 h 30 à 4 h 30');
    expect(hoursText([84, 132])).toBe('84 à 132 h');
  });

  it('fenêtre fermée, ouverte, passée', () => {
    expect(windowState(NOW, [4, 6], NOW + 3 * H).kind).toBe('closed');
    const open = windowState(NOW, [4, 6], NOW + 5 * H);
    expect(open).toMatchObject({ kind: 'open', progress: 0.5 });
    expect(windowState(NOW, [4, 6], NOW + 7 * H).kind).toBe('due');
  });

  it('rappels : seulement les fenêtres à venir, les plus proches d’abord', () => {
    const kill = (territory: number, mark: number, rank: 'A' | 'S', hoursAgo: number) => ({
      territory,
      mark,
      rank,
      at: NOW - hoursAgo * H,
      world: 'Omega',
    });
    const s = huntZone(1187)!.marks.find((m) => m.r === 'S')!.n;
    const a = huntZone(1187)!.marks.find((m) => m.r === 'A')!.n;
    const plan = planHuntReminders([kill(1187, s, 'S', 10), kill(1187, a, 'A', 1), kill(1187, a + 1, 'A', 5)], NOW);
    expect(plan.map((p) => p.at)).toEqual([NOW + 3 * H, NOW + 74 * H]);
    expect(plan[0].url).toBe('/hunt/zone/1187');
    expect(plan[0].title).toContain('peut revenir');
  });

  it('morts notées et vues par le plugin : la plus récente l’emporte', () => {
    const k = (at: number, source: HuntKill['source']): HuntKill => ({ territory: 138, mark: 1, rank: 'S', at, world: 'Omega', source });
    const merged = mergeKills({ x: k(NOW - 2 * H, 'manual') }, [k(NOW - H, 'plugin'), { ...k(NOW - H, 'plugin'), world: 'Moogle' }], NOW);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.world === 'Omega')?.source).toBe('plugin');
    // Trop ancienne : oubliée.
    expect(mergeKills({ x: k(NOW - 20 * 24 * H, 'manual') }, [], NOW)).toHaveLength(0);
  });
});

describe('Aujourd’hui : contrats lus en jeu', () => {
  const progress = (bills: NonNullable<DutyProgress['hunt']>['bills']): DutyProgress => ({
    updatedAt: '',
    dailyCycle: 0,
    weeklyCycle: 0,
    roulettes: [],
    hunt: { bills },
  });
  it('terminé quand toutes les cibles des contrats en main sont tuées', () => {
    const daily = TASK_BY_KEY.get('huntDaily')!.auto!;
    const elite = TASK_BY_KEY.get('huntElite')!.auto!;
    const p = progress([
      { k: 18, row: 270, elite: false, kills: [3, 1], needed: [3, 3] },
      { k: 19, row: 280, elite: false, kills: [5], needed: [5] },
      { k: 21, row: 306, elite: true, kills: [1], needed: [1] },
    ]);
    expect(daily(p, NOW)).toEqual({ done: false, detail: '1/2 contrats' });
    expect(elite(p, NOW)).toEqual({ done: true, detail: undefined });
    expect(daily(progress([]), NOW)).toBeNull();
  });
});
