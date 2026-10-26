import {
  ET_HOUR,
  eorzeaHour,
  fishingData,
  fishStatus,
  forecast,
  forecastTarget,
  nextWindows,
  routeOf,
  stopFish,
  upcomingVoyages,
  weatherAt,
  WEATHER_PERIOD,
  type FishEntry,
} from '@/utils/fishing';

/** Calcul de référence de FF14 Fish Tracker (icykoneko, MIT), recopié tel quel. */
function referenceTarget(ms: number): number {
  const unixTime = parseInt(String(+ms / 1000), 10);
  const bell = unixTime / 175;
  const inc = (bell + 8 - (bell % 8)) % 24;
  const totalDays = ((unixTime / 4200) << 32) >>> 0;
  const calcBase = totalDays * 100 + inc;
  const step1 = ((calcBase << 11) ^ calcBase) >>> 0;
  const step2 = ((step1 >>> 8) ^ step1) >>> 0;
  return step2 % 100;
}

// Une période de météo commence à 0 h, 8 h ou 16 h d'Éorzéa.
const T0 = Math.floor(Date.UTC(2026, 9, 26, 12) / WEATHER_PERIOD) * WEATHER_PERIOD;

describe('météo d’Éorzéa', () => {
  it('calcule comme le jeu, sur des milliers de périodes', () => {
    for (let i = 0; i < 5000; i++) {
      const ms = T0 + i * WEATHER_PERIOD + 1234;
      expect(forecastTarget(ms)).toBe(referenceTarget(ms));
    }
  });

  it('donne la même météo pendant toute une période de 8 heures d’Éorzéa', () => {
    const rates: [number, number][] = [[1, 30], [2, 60], [7, 100]];
    for (let i = 0; i < 50; i++) {
      const start = T0 + i * WEATHER_PERIOD;
      expect(weatherAt(rates, start)).toBe(weatherAt(rates, start + WEATHER_PERIOD - 1000));
    }
    expect(forecast(rates, T0 + 10, 3).map((p) => p.start)).toEqual([T0, T0 + WEATHER_PERIOD, T0 + 2 * WEATHER_PERIOD]);
  });
});

describe('fenêtres de pêche', () => {
  const rates: [number, number][] = [[1, 50], [2, 100]];

  it('trouve les heures d’Éorzéa voulues, même à cheval sur minuit', () => {
    const fish: FishEntry = { id: 1, s: 1, h: [22, 2] };
    const [w] = nextWindows(fish, rates, T0, 1);
    expect(eorzeaHour(w.start)).toBeCloseTo(22);
    // 4 heures d'Éorzéa, réunies d'une période à l'autre.
    expect((w.end - w.start) / ET_HOUR).toBeCloseTo(4);
  });

  it('respecte la météo exigée et la météo d’avant', () => {
    const fish: FishEntry = { id: 2, s: 1, h: [0, 24], w: [2], pw: [1] };
    for (const w of nextWindows(fish, rates, T0, 5)) {
      expect(weatherAt(rates, w.start)).toBe(2);
      expect(weatherAt(rates, w.start - WEATHER_PERIOD)).toBe(1);
    }
  });

  it('dit si un poisson mord en ce moment ou quand', () => {
    expect(fishStatus({ id: 3, s: 1, h: [0, 24] }, rates, T0)).toEqual({ kind: 'always' });
    const status = fishStatus({ id: 4, s: 1, h: [4, 6] }, rates, T0);
    expect(status.kind).toBe('soon');
  });
});

describe('données et pêche en mer', () => {
  const data = fishingData();

  it('les poissons pointent vers des coins et des zones connus', () => {
    expect(data.fish.length).toBeGreaterThan(1000);
    for (const f of data.fish) {
      const spot = data.spots[String(f.s)];
      expect(spot).toBeDefined();
      expect(data.zones[String(spot.t)]).toBeDefined();
    }
  });

  it('suit le cycle de 144 départs', () => {
    // Départ du 22 octobre 2026 à 16 h UTC : créneau n = 245 692.
    const departure = 245_692 * 7_200_000;
    expect(routeOf('indigo', departure, data.ocean)).toBe(data.ocean.indigo[(88 + 245_692) % 144]);
    expect(routeOf('ruby', departure, data.ocean)).toBe(data.ocean.ruby[(136 + 245_692) % 144]);
    // Inscriptions ouvertes pendant les 15 premières minutes.
    const [now] = upcomingVoyages('indigo', departure + 5 * 60_000, 2, data.ocean);
    expect(now).toMatchObject({ departure, boarding: true });
    const [next] = upcomingVoyages('indigo', departure + 20 * 60_000, 1, data.ocean);
    expect(next.departure).toBe(departure + 7_200_000);
  });

  it('repère les poissons bleus du courant spectral et leur moment', () => {
    // Baie de Galadion : le Sothis (bleu) mord la nuit dans le courant spectral.
    const route = Object.values(data.ocean.routes).find((r) => r.s.some((s) => s.m === 237))!;
    const stop = { ...route.s.find((s) => s.m === 237)!, t: 3 };
    const sothis = stopFish(stop, data.ocean).find((f) => f.id === 29788)!;
    expect(sothis).toMatchObject({ spectral: true, blue: true, time: 3, active: true });
    expect(stopFish({ ...stop, t: 1 }, data.ocean).find((f) => f.id === 29788)?.active).toBe(false);
  });
});
