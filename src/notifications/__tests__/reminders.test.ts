import {
  DEFAULT_SETTINGS,
  describeSchedule,
  migrateReminders,
  oceanLocalLabel,
  planReminders,
  REMINDERS,
  type LocalClock,
  type ReminderSettings,
} from '@/notifications/reminders';

// Mercredi 22 octobre 2026, 14 h 30 UTC ; le téléphone est à Paris (UTC+2 en octobre).
const NOW = Date.UTC(2026, 9, 22, 14, 30);
const paris = (at: number): LocalClock => {
  const d = new Date(at + 2 * 3600_000);
  return { hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() + 1 };
};

const settings = (patch: Partial<ReminderSettings['reminders']>, oceanHours = DEFAULT_SETTINGS.oceanHours): ReminderSettings => ({
  reminders: { ...DEFAULT_SETTINGS.reminders, ...patch },
  oceanHours,
});
const on = (lead = 0) => ({ enabled: true, lead });

describe('rappels du jeu', () => {
  it('rien n’est programmé par défaut, et chaque rappel a son réglage', () => {
    expect(planReminders(DEFAULT_SETTINGS, 'eu', NOW, paris)).toEqual([]);
    expect(Object.keys(DEFAULT_SETTINGS.reminders).sort()).toEqual(REMINDERS.map((r) => r.key).sort());
  });

  it('un rappel seul porte son propre titre, à l’heure locale avec l’avance choisie', () => {
    const planned = planReminders(settings({ roulettes: on(15), gc: on() }), 'eu', NOW, paris);
    expect(planned.map((p) => [p.title, p.trigger])).toEqual([
      // 15 h UTC = 17 h à Paris, 15 min avant.
      ['Missions aléatoires', { type: 'daily', hour: 16, minute: 45 }],
      ['Grande Compagnie', { type: 'daily', hour: 22, minute: 0 }],
    ]);
    expect(planned[0].body).toBe('Bonus des roulettes renouvelés dans 15 min.');
  });

  it('les rappels de la même minute sont réunis en une notification', () => {
    const planned = planReminders(settings({ tomestones: on(), raids: on(), wondrous: on(), huntElite: on(5) }), 'eu', NOW, paris);
    expect(planned).toHaveLength(2);
    // Mardi 8 h UTC = mardi 10 h à Paris.
    expect(planned[0]).toMatchObject({
      title: 'Réinitialisation hebdomadaire',
      body: 'Mémoquartz, Raids, Aventures imaginaires : maintenant.',
      trigger: { type: 'weekly', weekday: 3, hour: 10, minute: 0 },
    });
    expect(planned[1]).toMatchObject({ title: 'Contrats de chasse d’élite', trigger: { type: 'weekly', weekday: 3, hour: 9, minute: 55 } });
  });

  it('Jumbo Cactpot et Défilé de mode tombent le bon jour local', () => {
    const planned = planReminders(settings({ jumboCactpot: on(30), fashionJudging: on() }), 'eu', NOW, paris);
    // Samedi 19 h UTC - 30 min = samedi 20 h 30 ; vendredi 8 h UTC = vendredi 10 h.
    expect(planned.map((p) => p.trigger)).toEqual([
      { type: 'weekly', weekday: 7, hour: 20, minute: 30 },
      { type: 'weekly', weekday: 6, hour: 10, minute: 0 },
    ]);
    // Amérique du Nord : dimanche 2 h UTC.
    const na = planReminders(settings({ jumboCactpot: on() }), 'na', NOW, paris);
    expect(na[0].trigger).toEqual({ type: 'weekly', weekday: 1, hour: 4, minute: 0 });
  });

  it('pêche en mer : seulement les départs choisis ; mandats : deux fois par jour', () => {
    const ocean = planReminders(settings({ ocean: on(15) }, [0, 18, 3]), 'eu', NOW, paris);
    expect(ocean.map((p) => p.trigger)).toEqual([
      { type: 'daily', hour: 1, minute: 45 },
      { type: 'daily', hour: 19, minute: 45 },
    ]);
    expect(oceanLocalLabel(18, NOW, paris)).toBe('20:00');
    expect(planReminders(settings({ leves: on() }), 'eu', NOW, paris)).toHaveLength(2);
  });

  it('missions des servants : une notification par retour à venir', () => {
    const at = (h: number) => Math.floor((NOW + h * 3600_000) / 1000);
    const planned = planReminders(settings({ ventures: on() }), 'eu', NOW, paris, [
      { characterId: 7, retainer: 'Alpha', at: at(1) },
      { characterId: 7, retainer: 'Beta', at: at(1) },
      { characterId: 7, retainer: 'Gamma', at: at(-1) },
    ]);
    expect(planned).toHaveLength(1);
    expect(planned[0]).toMatchObject({ title: 'Missions des servants', body: 'Alpha, Beta sont revenus de mission.', url: '/retainers/7' });
    expect(planned[0].trigger).toEqual({ type: 'date', at: Math.floor((NOW + 3600_000) / 60_000) * 60_000 });
  });

  it('les anciens réglages par familles activent les rappels détaillés', () => {
    const migrated = migrateReminders({ weekly: on(5), cactpot: on(30), gc: on(), roulettes: { enabled: false, lead: 0 } });
    expect(migrated.tomestones).toEqual(on(5));
    expect(migrated.raids).toEqual(on(5));
    expect(migrated.jumboCactpot).toEqual(on(30));
    expect(migrated.gc).toEqual(on());
    expect(migrated.roulettes.enabled).toBe(false);
    expect('weekly' in migrated).toBe(false);
  });

  it('décrit l’heure locale de chaque rappel', () => {
    const find = (key: string) => REMINDERS.find((r) => r.key === key)!;
    expect(describeSchedule(find('leves'), 'eu', NOW, paris)).toBe('Chaque jour à 02:00 et 14:00');
    expect(describeSchedule(find('raids'), 'eu', NOW, paris)).toBe('Le mardi à 10:00');
  });
});
