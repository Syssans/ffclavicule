import { DEFAULT_SETTINGS, oceanLocalLabel, planReminders, type LocalClock, type ReminderSettings } from '@/notifications/reminders';

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

describe('rappels du jeu', () => {
  it('rien n’est programmé par défaut', () => {
    expect(planReminders(DEFAULT_SETTINGS, 'eu', NOW, paris)).toEqual([]);
  });

  it('convertit les heures du jeu en heure locale, avec l’avance choisie', () => {
    const planned = planReminders(settings({ roulettes: { enabled: true, lead: 15 }, gc: { enabled: true, lead: 0 } }), 'eu', NOW, paris);
    expect(planned.map((p) => [p.id, p.trigger])).toEqual([
      // 15 h UTC = 17 h à Paris, 15 min avant.
      ['rappel-roulettes', { type: 'daily', hour: 16, minute: 45 }],
      ['rappel-gc', { type: 'daily', hour: 22, minute: 0 }],
    ]);
    expect(planned[0].body).toContain('dans 15 min');
  });

  it('les rappels hebdomadaires tombent le bon jour local', () => {
    const planned = planReminders(
      settings({ weekly: { enabled: true, lead: 0 }, cactpot: { enabled: true, lead: 30 }, fashion: { enabled: true, lead: 0 } }),
      'eu',
      NOW,
      paris,
    );
    // Mardi 8 h UTC = mardi 10 h ; samedi 19 h UTC - 30 min = samedi 20 h 30 ; vendredi 8 h UTC = vendredi 10 h.
    expect(planned.map((p) => p.trigger)).toEqual([
      { type: 'weekly', weekday: 3, hour: 10, minute: 0 },
      { type: 'weekly', weekday: 7, hour: 20, minute: 30 },
      { type: 'weekly', weekday: 6, hour: 10, minute: 0 },
    ]);
    // Amérique du Nord : dimanche 2 h UTC.
    const na = planReminders(settings({ cactpot: { enabled: true, lead: 0 } }), 'na', NOW, paris);
    expect(na[0].trigger).toEqual({ type: 'weekly', weekday: 1, hour: 4, minute: 0 });
  });

  it('pêche en mer : seulement les départs choisis', () => {
    const planned = planReminders(settings({ ocean: { enabled: true, lead: 15 } }, [0, 18, 3]), 'eu', NOW, paris);
    expect(planned.map((p) => [p.id, p.trigger])).toEqual([
      ['rappel-peche-0', { type: 'daily', hour: 1, minute: 45 }],
      ['rappel-peche-18', { type: 'daily', hour: 19, minute: 45 }],
    ]);
    expect(oceanLocalLabel(18, NOW, paris)).toBe('20:00');
  });

  it('mandats : deux rappels par jour', () => {
    expect(planReminders(settings({ leves: { enabled: true, lead: 0 } }), 'eu', NOW, paris).map((p) => p.id)).toEqual(['rappel-mandats-0', 'rappel-mandats-12']);
  });
});
