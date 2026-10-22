import { dailyPrices, trendPercent } from '../prices';

// Midi heure locale, pour ne pas dépendre du fuseau.
const day = (n: number) => new Date(2026, 9, n, 12).getTime();

describe('prix par jour', () => {
  it('donne un prix médian par jour, insensible aux ventes aberrantes', () => {
    const sales = [
      { pricePerUnit: 100, quantity: 2, timestamp: day(20) / 1000 },
      { pricePerUnit: 120, quantity: 1, timestamp: day(20) / 1000 + 60 },
      { pricePerUnit: 90_909_090, quantity: 1, timestamp: day(20) / 1000 + 120 },
      { pricePerUnit: 150, quantity: 5, timestamp: day(22) },
    ];
    const points = dailyPrices(sales, 7, day(22));
    expect(points.map((p) => [new Date(p.day).getDate(), p.median, p.units])).toEqual([
      [20, 120, 4],
      [22, 150, 5],
    ]);
  });

  it('ignore les ventes hors période et les prix nuls', () => {
    const sales = [
      { pricePerUnit: 100, quantity: 1, timestamp: day(1) },
      { pricePerUnit: 0, quantity: 1, timestamp: day(21) },
      { pricePerUnit: 200, quantity: 1, timestamp: day(21) },
    ];
    expect(dailyPrices(sales, 7, day(22)).map((p) => p.median)).toEqual([200]);
  });

  it('calcule la tendance entre le premier et le dernier jour', () => {
    expect(trendPercent([{ day: 1, median: 100, units: 1 }, { day: 2, median: 125, units: 1 }])).toBe(25);
    expect(trendPercent([{ day: 1, median: 100, units: 1 }])).toBeNull();
  });
});
