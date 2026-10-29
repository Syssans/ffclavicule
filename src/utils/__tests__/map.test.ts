import { fishingData } from '@/utils/fishing';
import { gatheringData } from '@/utils/gathering';
import {
  breadcrumb,
  cityCrest,
  childrenOf,
  fatePoints,
  findFishingSpot,
  findGatheringNode,
  floorsOf,
  fromGameCoords,
  fromWorld,
  getMap,
  instancesByType,
  mapData,
  mapImage,
  regionZonePoints,
  assembledZones,
  mapPoints,
  nearestPoint,
  officialPoints,
  labelAt,
  placeLabels,
  searchMap,
  toGameCoords,
  type MapPoint,
  cityParts,
  partLabel,
  WORLDS,
} from '@/utils/map';

const CENTRAL_SHROUD = 4;

describe('coordonnées', () => {
  it('passe des coordonnées du jeu aux pixels et retour', () => {
    for (const sf of [100, 200, 400, 95]) {
      const [x, y] = fromGameCoords({ sf }, 12.3, 7.8);
      expect(toGameCoords({ sf }, x, y)).toEqual({ x: 12.3, y: 7.8 });
    }
  });

  it('place les coins de pêche du jeu aux coordonnées connues des pêcheurs', () => {
    // Le Fish Tracker donne les coordonnées en jeu des coins ; la feuille FishingSpot, des pixels de la carte.
    const spots = fishingData().spots;
    let checked = 0;
    for (const [id, spot] of Object.entries(spots)) {
      if (!/^\d+$/.test(id) || !spot.c || spot.c[1] > 50) continue;
      const found = findFishingSpot(Number(id));
      const map = found && getMap(found.mapId);
      if (!found || !map || map.sf === 180) continue;
      const at = toGameCoords(map, found.x, found.y);
      expect(Math.abs(at.x - spot.c[0])).toBeLessThan(0.3);
      expect(Math.abs(at.y - spot.c[1])).toBeLessThan(0.3);
      checked++;
    }
    expect(checked).toBeGreaterThan(250);
  });

  it('place les points de récolte à leurs coordonnées', () => {
    const node = gatheringData().nodes.find((n) => n.c && n.t === 5)!;
    const found = findGatheringNode(node)!;
    expect(toGameCoords(getMap(found.mapId)!, found.x, found.y)).toEqual({
      x: node.c![0],
      y: node.c![1],
    });
  });

  it('convertit une position du monde (donneur de quête) en pixels', () => {
    const map = getMap(CENTRAL_SHROUD)!;
    const [x, y] = fromWorld(map, 55.005, 40.8088);
    expect(toGameCoords(map, x, y)).toEqual({ x: 22.6, y: 22.3 });
  });
});

describe('hiérarchie des cartes', () => {
  it('remonte de la zone à la région puis au monde', () => {
    expect(breadcrumb(CENTRAL_SHROUD).map((b) => b.map.n)).toEqual(['Hydaelyn', 'Forêt de Sombrelinceul', 'Forêt centrale']);
  });

  it('liste les zones et les villes d’une région', () => {
    const shroud = breadcrumb(CENTRAL_SHROUD)[1].id;
    const names = childrenOf(shroud).map((id) => getMap(id)!.n);
    expect(names).toEqual(expect.arrayContaining(['Forêt centrale', 'Forêt de l’est'.replace('’', "'"), 'Nouvelle Gridania', 'Vieille Gridania']));
  });

  it('rattache toutes les zones à une région et toutes les régions à un monde', () => {
    for (const map of Object.values(mapData().maps)) {
      if (map.k === 'zone') expect(getMap(map.p!)?.k).toBe('region');
      if (map.k === 'region') expect(getMap(map.p!)?.k).toBe('world');
    }
  });

  it('regroupe les étages d’une instance', () => {
    const tower = Object.entries(mapData().maps).find(([, m]) => m.n === 'Tour de Syrcus')!;
    expect(floorsOf(Number(tower[0])).length).toBeGreaterThan(1);
  });

  it('range les instances par type, du plus bas niveau au plus haut', () => {
    const groups = instancesByType();
    expect(groups[0].name).toBe('Donjons');
    const levels = groups[0].maps.map((id) => getMap(id)!.l ?? 0);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(groups.map((g) => g.name)).toEqual(expect.arrayContaining(['Défis', 'Raids']));
  });
});

describe('points de la carte', () => {
  it('livre les cartes de région déjà assemblées avec l’appli', () => {
    const noscea = breadcrumb(16)[1].id;
    // Fichier livré avec l'appli (pas une adresse XIVAPI).
    expect(JSON.stringify(mapImage(noscea, getMap(noscea)!))).not.toContain('xivapi');
    expect(mapImage(16, getMap(16)!)).toEqual({ uri: 'https://v2.xivapi.com/api/asset/map/s1f2/00' });
  });

  it('assemble les régions avec les cartes de leurs zones, et y montre leurs éthérites', () => {
    const noscea = breadcrumb(16)[1].id;
    const zones = assembledZones(noscea);
    const lower = zones.find((z) => z.zone === 16)!;
    expect(lower).toBeDefined();
    const aetheryte = regionZonePoints(noscea, ['aetherytes']).find((p) => p.label === 'Chantier naval de Moraby')!;
    expect(aetheryte.source?.mapId).toBe(16);
    // La zone est réduite de moitié et centrée sur son repère de la région.
    expect(aetheryte.x).toBeCloseTo(lower.cx + (aetheryte.source!.x - 1024) / 2);
    expect(aetheryte.y).toBeCloseTo(lower.cy + (aetheryte.source!.y - 1024) / 2);
  });

  it('nomme les éthérites et les range dans leur calque', () => {
    const aetherytes = officialPoints(CENTRAL_SHROUD).filter((p) => p.layer === 'aetherytes');
    expect(aetherytes.map((p) => p.label)).toContain('Ranch de Brancharquée');
  });

  it('relie les cartes entre elles (passages)', () => {
    const links = officialPoints(CENTRAL_SHROUD).filter((p) => p.data.type === 'marker' && p.data.kind === 2);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(getMap(link.data.type === 'marker' ? link.data.link : 0)).toBeDefined();
  });

  it('place les aléas à la position relevée par Teamcraft', () => {
    const fate = fatePoints(16).find((p) => p.label === 'L’éveil des bêtes'.replace('’', "'"));
    expect(fate).toBeDefined();
    expect(toGameCoords(getMap(16)!, fate!.x, fate!.y)).toEqual({
      x: 31.5,
      y: 15.2,
    });
  });

  it('ne montre que les calques demandés', () => {
    const only = mapPoints(CENTRAL_SHROUD, ['fishing']);
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((p) => p.layer === 'fishing')).toBe(true);
  });

  it('attrape le point le plus proche dans le rayon', () => {
    const point = (id: string, x: number, y: number): MapPoint => ({
      id,
      x,
      y,
      layer: 'places',
      icon: 0,
      label: id,
      orientation: 0,
      rank: 0,
      data: { type: 'marker', kind: 0, link: 0 },
    });
    const points = [point('a', 100, 100), point('b', 130, 100)];
    expect(nearestPoint(points, 120, 100, 30)?.id).toBe('b');
    expect(nearestPoint(points, 300, 300, 30)).toBeNull();
  });

  it('cache les noms qui se chevauchent, sauf les grands noms et le point choisi', () => {
    const point = (id: string, x: number, rank: number): MapPoint => ({
      id,
      x,
      y: 100,
      layer: 'places',
      icon: 60442,
      label: 'Un nom assez long',
      orientation: 2,
      rank,
      data: { type: 'marker', kind: 0, link: 0 },
    });
    const points = [point('a', 100, 2), point('b', 101, 2), point('c', 102, 0), point('d', 900, 2)];
    expect([...placeLabels(points, 1, 2, null, 26, 170).keys()].sort()).toEqual(['c', 'd']);
    expect(placeLabels(points, 1, 2, 'b', 26, 170).has('b')).toBe(true);
    // Trop dézoomé : seuls les noms toujours visibles.
    expect([...placeLabels(points, 1, 0, null, 26, 170).keys()]).toEqual(['c']);
  });

  it('montre une cité par son blason, une seule fois, sur sa région', () => {
    const noscea = Number(Object.entries(mapData().maps).find(([, m]) => m.k === 'region' && m.n === 'Noscea')![0]);
    const limsa = officialPoints(noscea).filter((p) => p.label === 'Limsa Lominsa');
    expect(limsa).toHaveLength(1);
    expect(limsa[0].icon).toBe(60881);
    expect(cityCrest(limsa[0].data.type === 'marker' ? limsa[0].data.link : 0)).toBe(60881);
  });

  it('décale un grand nom qui en chevauche un autre au lieu de les superposer', () => {
    const zone = (id: string, y: number): MapPoint => ({
      id,
      x: 500,
      y,
      layer: 'places',
      icon: 0,
      label: 'Noscea extérieure',
      orientation: 0,
      rank: 0,
      data: { type: 'marker', kind: 2, link: 1 },
    });
    const placed = placeLabels([zone('a', 500), zone('b', 505)], 1, 0, null, 26, 170);
    expect(placed.get('a')).toBe(0);
    expect(Math.abs(placed.get('b')!)).toBeGreaterThanOrEqual(20);
    // Le nom décalé se touche à sa nouvelle place.
    expect(labelAt([zone('b', 505)], placed, 500, 505 + placed.get('b')!, 1, 26, 170)?.id).toBe('b');
  });

  it('attrape un nom affiché quand on le touche, loin de son icône', () => {
    const zone: MapPoint = {
      id: 'z',
      x: 500,
      y: 500,
      layer: 'places',
      icon: 60442,
      label: 'Forêt centrale',
      orientation: 2,
      rank: 0,
      data: { type: 'marker', kind: 2, link: 4 },
    };
    // Le nom est à droite de l'icône (orientation 2) : on touche son milieu, à 2× de zoom.
    expect(labelAt([zone], new Map([['z', 0]]), 500 + 30, 500, 2, 26, 170)?.id).toBe('z');
    // Nom masqué, ou toucher ailleurs : rien.
    expect(labelAt([zone], new Map(), 530, 500, 2, 26, 170)).toBeNull();
    expect(labelAt([zone], new Map([['z', 0]]), 500, 560, 2, 26, 170)).toBeNull();
  });

  it('trouve les lieux, les donjons et les aléas', () => {
    expect(searchMap('sastasha').some((r) => r.subtitle.startsWith('Donjons'))).toBe(true);
    expect(searchMap('brancharquee').length).toBeGreaterThan(0);
  });
});

describe('villes en plusieurs quartiers et mondes', () => {
  it('chaque quartier mène aux autres, avec un nom court', () => {
    expect(cityParts(2)).toEqual([2, 3]);
    expect(cityParts(12)).toEqual([11, 12]);
    expect(cityParts(370)).toEqual([]);
    expect(cityParts(218).map((id) => partLabel(getMap(id)!))).toEqual(["L'Assise", 'Les Contreforts']);
    expect(partLabel(getMap(3)!)).toBe('Vieille Gridania');
  });

  it('les mondes existent et ont des régions', () => {
    for (const w of WORLDS) {
      expect(getMap(w.id)?.k).toBe('world');
      expect(childrenOf(w.id).length).toBeGreaterThan(0);
    }
  });
});
