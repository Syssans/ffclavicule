import { ET_DAY, ET_HOUR, eorzeaHour } from '@/utils/fishing';
import {
  gatherableItems,
  gatheringData,
  kindOf,
  nodeItems,
  nodeStatus,
  nodeWindows,
  scheduleText,
  type GatheringNode,
} from '@/utils/gathering';

const DAY0 = Math.floor(Date.UTC(2026, 9, 26, 12) / ET_DAY) * ET_DAY;
const node = (patch: Partial<GatheringNode>): GatheringNode => ({ b: 1, j: 0, l: 50, t: 5, z: 1, p: '', it: [], ...patch });

describe('points à horaires', () => {
  it('trouve les apparitions d’un point légendaire (deux par jour d’Éorzéa)', () => {
    const legendary = node({ ti: [[480, 120], [1200, 120]] });
    const windows = nodeWindows(legendary, DAY0, 3);
    expect(windows.map((w) => eorzeaHour(w.start))).toEqual([8, 20, 8]);
    expect((windows[0].end - windows[0].start) / ET_HOUR).toBe(2);
    expect(scheduleText(legendary)).toBe('8:00 et 20:00 · 2 h');
  });

  it('gère un point éphémère qui passe minuit', () => {
    const ephemeral = node({ t: 4, e: [1200, 0] });
    const [w] = nodeWindows(ephemeral, DAY0, 1);
    expect(eorzeaHour(w.start)).toBe(20);
    expect((w.end - w.start) / ET_HOUR).toBe(4);
    expect(kindOf(ephemeral)).toBe('ephemeral');
  });

  it('dit si le point est ouvert ou quand il ouvre', () => {
    const legendary = node({ ti: [[480, 120]] });
    expect(nodeStatus(legendary, DAY0 + 9 * ET_HOUR)).toEqual({ kind: 'open', until: DAY0 + 10 * ET_HOUR });
    expect(nodeStatus(legendary, DAY0 + 11 * ET_HOUR)).toEqual({ kind: 'soon', at: DAY0 + ET_DAY + 8 * ET_HOUR });
    expect(nodeStatus(node({ t: 1 }), DAY0)).toEqual({ kind: 'always' });
  });
});

describe('données de récolte', () => {
  const data = gatheringData();

  it('chaque point a sa zone et ses objets', () => {
    expect(data.nodes.length).toBeGreaterThan(400);
    for (const n of data.nodes) {
      expect(data.zones[String(n.z)]).toBeDefined();
      expect(nodeItems(n).length).toBeGreaterThan(0);
    }
  });

  it('retrouve où récolter un objet', () => {
    // Minerai de cuivre : récolté par un mineur, dès le niveau 1.
    const copper = gatherableItems().get(5106)!;
    expect(copper.name).toBe('Minerai de cuivre');
    expect(copper.nodes.length).toBeGreaterThan(0);
    expect(copper.nodes.every((n) => n.j <= 1)).toBe(true);
  });

  it('les points légendaires ont leurs horaires et leur livre de légendes', () => {
    const legendary = data.nodes.filter((n) => kindOf(n) === 'legendary');
    expect(legendary.length).toBeGreaterThan(50);
    expect(legendary.every((n) => n.ti?.length && n.fl)).toBe(true);
  });
});
