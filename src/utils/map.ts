/**
 * Carte interactive : cartes du jeu (monde, régions, zones, villes, instances), passage des coordonnées du jeu aux
 * pixels de la carte, et points à afficher par calque (repères officiels, aléas, pêche, récolte, trésors, quêtes).
 *
 * Toutes les positions sont en pixels de la texture de la carte (2048 × 2048), comme dans le jeu.
 * Données : src/data/map.json (voir scripts/update-map-data.mjs).
 */
import { gatherableItems, gatheringData, isTimed, kindOf, KIND_LABEL, nodeKey, type GatheringNode } from '@/utils/gathering';
import { REGION_IMAGES } from '@/data/region-images';
import { fold } from '@/utils/inventory';

export const MAP_SIZE = 2048;

export type MapKind = 'world' | 'region' | 'zone' | 'city' | 'housing' | 'instance';

export interface MapInfo {
  /** Texture du jeu (« s1f1/00 »). */
  i: string;
  n: string;
  /** Sous-titre (étage, partie de la zone). */
  s?: string;
  /** Région. */
  r: string;
  t: number;
  /** Échelle (100 = zone ordinaire, 200 = ville…). */
  sf: number;
  ox?: number;
  oy?: number;
  k: MapKind;
  /** Extension (0 ARR, 1 HW…). */
  x?: number;
  /** Carte parente (région d'une zone, monde d'une région). */
  p?: number;
  /** Instance : type de contenu, nom du contenu, niveau, niveau d'objet, contenu difficile. */
  c?: number;
  d?: string;
  l?: number;
  il?: number;
  h?: 1;
}

/** [x, y, icône, nom (PlaceName), genre, lien, orientation du texte]. */
export type RawMarker = [number, number, number, number, number, number, number];

export interface MapData {
  sources: string[];
  updatedAt: string;
  contentTypes: Record<string, { n: string; i: number }>;
  maps: Record<string, MapInfo>;
  order: number[];
  alias: Record<string, number>;
  territoryMap: Record<string, number>;
  names: Record<string, string>;
  markers: Record<string, RawMarker[]>;
  /** [aléa, nom, niveau, x, y, icône]. */
  fates: Record<string, [number, string, number, number, number, number][]>;
  /** [coin de pêche, nom (PlaceName), niveau, x, y, rayon]. */
  fishing: Record<string, [number, number, number, number, number, number][]>;
  /** [x, y, objet (carte au trésor), taille du groupe]. */
  treasures: Record<string, [number, number, number, number][]>;
  treasureItems: Record<string, { n: string; i: number }>;
  questIcons: Record<string, number>;
}

let cache: MapData | null = null;
export function mapData(): MapData {
  cache ??= require('@/data/map.json') as MapData;
  return cache;
}

/** Carte principale : le monde entier (Hydaelyn, toutes les régions). */
export const WORLD_MAP = 919;

export function getMap(id: number): MapInfo | undefined {
  const d = mapData();
  return d.maps[String(id)] ?? d.maps[String(d.alias[String(id)])];
}

/** Numéro de carte gardé (les variantes d'une même carte renvoient à une seule). */
export function canonicalMap(id: number): number {
  const d = mapData();
  return d.maps[String(id)] ? id : (d.alias[String(id)] ?? id);
}

/** Toutes les lignes du jeu qui désignent cette carte (elle-même et ses variantes). */
export function mapRowIds(id: number): number[] {
  const d = mapData();
  return [
    id,
    ...Object.entries(d.alias)
      .filter(([, target]) => target === id)
      .map(([row]) => Number(row)),
  ];
}

export function mapForTerritory(territory: number): number | undefined {
  return mapData().territoryMap[String(territory)];
}

/**
 * Image de la carte : les cartes de région sont livrées avec l'appli, déjà assemblées (parchemin + terres des zones,
 * voir scripts/update-map-data.mjs) ; les autres sont assemblées comme en jeu (fond et calque) par XIVAPI.
 */
export function mapImage(id: number, map: MapInfo): number | { uri: string } {
  return REGION_IMAGES[id] ?? { uri: `https://v2.xivapi.com/api/asset/map/${map.i}` };
}

export function mapTitle(map: MapInfo): string {
  return map.s && map.s !== map.n ? `${map.n} – ${map.s}` : map.n;
}

// ——— Coordonnées ———

/** Pixels de la carte -> coordonnées affichées en jeu (X 22,9 Y 22,2). */
export function toGameCoords(map: Pick<MapInfo, 'sf'>, px: number, py: number): { x: number; y: number } {
  const c = map.sf / 100;
  const round = (v: number) => Math.round(((41 / c) * (v / MAP_SIZE) + 1) * 10) / 10;
  return { x: round(px), y: round(py) };
}

/** Coordonnées du jeu -> pixels de la carte. */
export function fromGameCoords(map: Pick<MapInfo, 'sf'>, x: number, y: number): [number, number] {
  const c = map.sf / 100;
  return [((x - 1) * c * MAP_SIZE) / 41, ((y - 1) * c * MAP_SIZE) / 41];
}

/** Position dans le monde (feuille Level, X et Z) -> pixels de la carte. */
export function fromWorld(map: Pick<MapInfo, 'sf' | 'ox' | 'oy'>, x: number, z: number): [number, number] {
  const c = map.sf / 100;
  return [(x + (map.ox ?? 0)) * c + MAP_SIZE / 2, (z + (map.oy ?? 0)) * c + MAP_SIZE / 2];
}

export function formatCoords({ x, y }: { x: number; y: number }): string {
  const f = (v: number) => v.toFixed(1).replace('.', ',');
  return `X ${f(x)} · Y ${f(y)}`;
}

// ——— Hiérarchie ———

/** Fil d'Ariane : monde › région › zone. */
export function breadcrumb(id: number): { id: number; map: MapInfo }[] {
  const out: { id: number; map: MapInfo }[] = [];
  const seen = new Set<number>();
  let current: number | undefined = canonicalMap(id);
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    const map = getMap(current);
    if (!map) break;
    out.unshift({ id: current, map });
    current = map.p;
  }
  return out;
}

/** Cartes rattachées (régions d'un monde ; zones, puis villes et quartiers d'une région), dans l'ordre du jeu. */
export function childrenOf(id: number): number[] {
  const d = mapData();
  const KIND_ORDER: MapKind[] = ['region', 'zone', 'city', 'housing'];
  const seen = new Set<string>();
  return d.order
    .filter((child) => {
      const m = d.maps[String(child)];
      if (m?.p !== id || m.k === 'instance') return false;
      // Une seule entrée par nom (les variantes et les étages s'ouvrent depuis la carte).
      const key = `${m.n}|${m.s ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => KIND_ORDER.indexOf(d.maps[String(a)].k) - KIND_ORDER.indexOf(d.maps[String(b)].k));
}

/** Étages : les autres cartes du même territoire. */
export function floorsOf(id: number): number[] {
  const map = getMap(id);
  if (!map || !map.t) return [id];
  const d = mapData();
  return d.order.filter((other) => d.maps[String(other)]?.t === map.t);
}

/** Instances groupées par type de contenu, du plus bas niveau au plus haut. */
export function instancesByType(): {
  type: number;
  name: string;
  icon: number;
  maps: number[];
}[] {
  const d = mapData();
  const groups = new Map<number, number[]>();
  const seenDuty = new Set<string>();
  for (const id of d.order) {
    const map = d.maps[String(id)];
    if (map.k !== 'instance' || map.c === undefined) continue;
    // Une entrée par contenu (les étages s'ouvrent depuis la carte).
    const key = `${map.c}|${map.t}`;
    if (seenDuty.has(key)) continue;
    seenDuty.add(key);
    const list = groups.get(map.c) ?? [];
    list.push(id);
    groups.set(map.c, list);
  }
  const sortKey = (id: number) => {
    const m = d.maps[String(id)];
    return (m.l ?? 0) * 10_000 + (m.il ?? 0);
  };
  const ORDER = [2, 4, 5, 28, 37, 21, 30, 26, 29, 38, 9, 7, 6];
  return [...groups.entries()]
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map(([type, maps]) => ({
      type,
      name: d.contentTypes[String(type)]?.n ?? 'Autres',
      icon: d.contentTypes[String(type)]?.i ?? 0,
      maps: maps.sort((a, b) => sortKey(a) - sortKey(b)),
    }));
}

// ——— Points affichés ———

export type LayerKey = 'places' | 'aetherytes' | 'landmarks' | 'fates' | 'fishing' | 'gathering' | 'treasures' | 'quests';

export interface LayerInfo {
  key: LayerKey;
  label: string;
  icon: number;
}

export const LAYERS: LayerInfo[] = [
  { key: 'places', label: 'Lieux', icon: 60442 },
  { key: 'aetherytes', label: 'Éthérites', icon: 60453 },
  { key: 'landmarks', label: 'Repères', icon: 60412 },
  { key: 'fates', label: 'Aléas', icon: 60502 },
  { key: 'quests', label: 'Quêtes', icon: 71021 },
  { key: 'gathering', label: 'Récolte', icon: 60438 },
  { key: 'fishing', label: 'Pêche', icon: 60465 },
  { key: 'treasures', label: 'Trésors', icon: 60570 },
];

export const DEFAULT_LAYERS: LayerKey[] = ['places', 'aetherytes', 'landmarks', 'fates', 'gathering', 'fishing'];

export type PointData =
  | { type: 'marker'; kind: number; link: number }
  | { type: 'fate'; fateId: number; level: number }
  | { type: 'fishing'; spotId: number; level: number; radius: number }
  | { type: 'gathering'; node: GatheringNode }
  | { type: 'treasure'; itemId: number; party: number }
  | { type: 'quest'; questId: number; level: number; genre: string };

export interface MapPoint {
  id: string;
  layer: LayerKey;
  x: number;
  y: number;
  /** Icône du jeu (0 : texte seul). */
  icon: number;
  label: string;
  /** Orientation du texte autour de l'icône (comme le jeu) : 1 gauche, 2 droite, 3 haut, 4 bas ; 0 centré. */
  orientation: number;
  /** Importance pour l'affichage des noms : 0 toujours, 1 zoom moyen, 2 zoom fort, 3 calques ajoutés (zoom fort). */
  rank: number;
  data: PointData;
}

/** Icônes de repère officiel qui comptent comme « lieux » (épingle de nom de lieu). */
const PLACE_ICONS = new Set([0, 60442]);

function markerLayer(kind: number, icon: number): LayerKey {
  if (kind === 3 || kind === 4) return 'aetherytes';
  if (kind === 1 || kind === 2 || PLACE_ICONS.has(icon)) return 'places';
  return 'landmarks';
}

/** Repères officiels d'une carte (noms de lieux, éthérites, passages, services…). */
export function officialPoints(id: number): MapPoint[] {
  const d = mapData();
  const map = getMap(id);
  return (d.markers[String(id)] ?? []).map(([x, y, icon, name, kind, link, orientation], i) => {
    const label = d.names[String(name)] ?? '';
    const big = kind === 1 || ((map?.k === 'world' || map?.k === 'region') && kind === 2);
    return {
      id: `m${i}`,
      layer: markerLayer(kind, icon),
      x,
      y,
      icon,
      label,
      orientation: icon ? orientation : 0,
      rank: big || kind === 3 ? 0 : icon === 0 || kind === 2 ? 1 : 2,
      data: { type: 'marker', kind, link },
    };
  });
}

export function fatePoints(id: number): MapPoint[] {
  return (mapData().fates[String(id)] ?? []).map(([fateId, name, level, x, y, icon]) => ({
    id: `f${fateId}`,
    layer: 'fates',
    x,
    y,
    icon,
    label: name,
    orientation: 2,
    rank: 3,
    data: { type: 'fate', fateId, level },
  }));
}

export function fishingPoints(id: number): MapPoint[] {
  const d = mapData();
  return (d.fishing[String(id)] ?? []).map(([spotId, name, level, x, y, radius]) => ({
    id: `p${spotId}`,
    layer: 'fishing',
    x,
    y,
    icon: 60465,
    label: d.names[String(name)] ?? '',
    orientation: 2,
    rank: 3,
    data: { type: 'fishing', spotId, level, radius },
  }));
}

/** Icônes de récolte du jeu : minerai, pierre, coupe, fauche (et leurs versions « légendaire »). */
const GATHERING_ICONS = [60438, 60437, 60433, 60432];
const GATHERING_RARE_ICONS = [60464, 60463, 60462, 60461];

export function gatheringPoints(id: number): MapPoint[] {
  const map = getMap(id);
  if (!map) return [];
  const out: MapPoint[] = [];
  for (const node of gatheringData().nodes) {
    if (!node.c || mapForTerritory(node.z) !== id) continue;
    const [x, y] = fromGameCoords(map, node.c[0], node.c[1]);
    const timed = isTimed(node);
    const items = node.it.map((g) => gatheringData().gitems[String(g)]?.[0]).filter(Boolean);
    const first = items.length ? gatherableItems().get(items[0]!)?.name : undefined;
    out.push({
      id: `g${nodeKey(node)}`,
      layer: 'gathering',
      x,
      y,
      icon: (timed ? GATHERING_RARE_ICONS : GATHERING_ICONS)[node.j] ?? GATHERING_ICONS[0],
      label: timed ? `${KIND_LABEL[kindOf(node)]} · ${first ?? node.p}` : `Niv. ${node.l} · ${node.p || first || ''}`,
      orientation: 2,
      rank: timed ? 2 : 3,
      data: { type: 'gathering', node },
    });
  }
  return out;
}

export function treasurePoints(id: number): MapPoint[] {
  const d = mapData();
  return (d.treasures[String(id)] ?? []).map(([x, y, itemId, party], i) => ({
    id: `t${i}`,
    layer: 'treasures',
    x,
    y,
    icon: 60570,
    label: d.treasureItems[String(itemId)]?.n ?? 'Carte au trésor',
    orientation: 2,
    rank: 3,
    data: { type: 'treasure', itemId, party },
  }));
}

/** Points des calques demandés (les quêtes, chargées à la demande, s'ajoutent à part). */
export function mapPoints(id: number, layers: readonly LayerKey[]): MapPoint[] {
  const on = new Set(layers);
  const out: MapPoint[] = officialPoints(id).filter((p) => on.has(p.layer));
  if (on.has('fates')) out.push(...fatePoints(id));
  if (on.has('fishing')) out.push(...fishingPoints(id));
  if (on.has('gathering')) out.push(...gatheringPoints(id));
  if (on.has('treasures')) out.push(...treasurePoints(id));
  return out;
}

/** Nombre de points de chaque calque sur une carte (pour griser les calques vides). */
export function layerCounts(id: number): Partial<Record<LayerKey, number>> {
  const counts: Partial<Record<LayerKey, number>> = {};
  for (const p of officialPoints(id)) counts[p.layer] = (counts[p.layer] ?? 0) + 1;
  counts.fates = fatePoints(id).length;
  counts.fishing = fishingPoints(id).length;
  counts.gathering = gatheringPoints(id).length;
  counts.treasures = treasurePoints(id).length;
  return counts;
}

/** Point le plus proche d'une position, dans un rayon donné (pixels de la carte). */
export function nearestPoint(points: readonly MapPoint[], x: number, y: number, radius: number): MapPoint | null {
  let best: MapPoint | null = null;
  let bestDistance = radius * radius;
  for (const p of points) {
    // Les noms de zone sans icône sont de grands textes : on les attrape un peu plus loin.
    const dx = p.x - x;
    const dy = p.y - y;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      best = p;
      bestDistance = distance;
    }
  }
  return best;
}

/** Les noms à afficher selon le zoom (en plus de ceux toujours visibles). */
export function visibleRank(scale: number, fit: number): number {
  const zoom = scale / fit;
  return zoom >= 3.6 ? 3 : zoom >= 2.4 ? 2 : zoom >= 1.4 ? 1 : 0;
}

type Box = [number, number, number, number];

/** Place approximative d'un nom à l'écran (pixels), selon son orientation autour de l'icône. */
export function labelBox(point: MapPoint, scale: number, big: boolean, iconSize: number, maxWidth: number): Box {
  const charWidth = big ? 10 : 6.6;
  const lineHeight = big ? 20 : 16;
  const raw = point.label.length * charWidth + 4;
  const width = Math.min(raw, maxWidth);
  const height = raw > maxWidth ? lineHeight * 2 : lineHeight;
  const x = point.x * scale;
  const y = point.y * scale;
  const half = point.icon ? iconSize / 2 + 2 : 0;
  switch (point.icon ? point.orientation : 0) {
    case 1:
      return [x - half - width, y - 9, x - half, y - 9 + height];
    case 2:
      return [x + half, y - 9, x + half + width, y - 9 + height];
    case 3:
      return [x - width / 2, y - half - height, x + width / 2, y - half];
    case 4:
      return [x - width / 2, y + half, x + width / 2, y + half + height];
    default:
      return [x - width / 2, y - height / 2, x + width / 2, y + height / 2];
  }
}

/**
 * Noms affichés : les plus importants d'abord, et un nom n'apparaît que s'il ne chevauche pas un nom déjà placé
 * (comme le jeu, qui cache les noms qui se marchent dessus). Le point choisi garde toujours son nom.
 */
export function placeLabels(
  points: readonly MapPoint[],
  scale: number,
  rank: number,
  selectedId: string | null | undefined,
  iconSize: number,
  maxWidth: number,
): Set<string> {
  const shown = new Set<string>();
  const boxes: Box[] = [];
  const candidates = points
    .filter((p) => p.label && (p.rank <= rank || p.id === selectedId))
    .sort((a, b) => Number(b.id === selectedId) - Number(a.id === selectedId) || a.rank - b.rank);
  for (const p of candidates) {
    const box = labelBox(p, scale, p.icon === 0 && p.rank === 0, iconSize, maxWidth);
    const overlaps = boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
    // Les grands noms (zones, régions) restent toujours visibles : ce sont aussi des liens.
    if (overlaps && p.id !== selectedId && p.rank > 0) continue;
    boxes.push(box);
    shown.add(p.id);
  }
  return shown;
}

// ——— Recherche ———

export interface SearchResult {
  key: string;
  mapId: number;
  title: string;
  subtitle: string;
  icon: number;
  /** Position à montrer (pixels), si le résultat est un lieu précis. */
  x?: number;
  y?: number;
}

let searchIndex: { text: string; result: SearchResult }[] | null = null;

function buildSearchIndex(): { text: string; result: SearchResult }[] {
  const d = mapData();
  const entries: { text: string; result: SearchResult }[] = [];
  const kindLabel: Record<MapKind, string> = {
    world: 'Monde',
    region: 'Région',
    zone: 'Zone',
    city: 'Ville',
    housing: 'Quartier résidentiel',
    instance: 'Instance',
  };
  const seenMaps = new Set<string>();
  for (const id of d.order) {
    const map = d.maps[String(id)];
    const key = `${map.n}|${map.k}`;
    if (seenMaps.has(key)) continue;
    seenMaps.add(key);
    const type = map.c !== undefined ? d.contentTypes[String(map.c)]?.n : kindLabel[map.k];
    entries.push({
      text: fold(`${map.n} ${map.d ?? ''} ${map.r}`),
      result: {
        key: `map${id}`,
        mapId: id,
        title: map.k === 'instance' && map.d ? capitalize(map.d) : map.n,
        subtitle: [type, map.l ? `niv. ${map.l}` : null, map.k !== 'region' && map.k !== 'world' ? map.r : null].filter(Boolean).join(' · '),
        icon: map.k === 'instance' ? (d.contentTypes[String(map.c)]?.i ?? 60414) : map.k === 'region' || map.k === 'world' ? 60441 : 60442,
      },
    });
  }
  for (const id of d.order) {
    const map = d.maps[String(id)];
    if (map.k === 'world' || map.k === 'region') continue;
    const seen = new Set<string>();
    for (const p of officialPoints(id)) {
      if (!p.label || p.data.type !== 'marker' || p.data.kind === 2 || seen.has(p.label)) continue;
      seen.add(p.label);
      entries.push({
        text: fold(p.label),
        result: {
          key: `m${id}-${p.id}`,
          mapId: id,
          title: p.label,
          subtitle: `${p.layer === 'aetherytes' ? 'Éthérite · ' : ''}${map.n} · ${formatCoords(toGameCoords(map, p.x, p.y))}`,
          icon: p.icon || 60442,
          x: p.x,
          y: p.y,
        },
      });
    }
    for (const p of fatePoints(id)) {
      entries.push({
        text: fold(p.label),
        result: {
          key: `f${id}-${p.id}`,
          mapId: id,
          title: p.label,
          subtitle: `Aléa niv. ${p.data.type === 'fate' ? p.data.level : ''} · ${map.n}`,
          icon: p.icon,
          x: p.x,
          y: p.y,
        },
      });
    }
    for (const p of fishingPoints(id)) {
      entries.push({
        text: fold(p.label),
        result: {
          key: `p${id}-${p.id}`,
          mapId: id,
          title: p.label,
          subtitle: `Coin de pêche · ${map.n}`,
          icon: p.icon,
          x: p.x,
          y: p.y,
        },
      });
    }
  }
  return entries;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function searchMap(query: string, limit = 60): SearchResult[] {
  const words = fold(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  searchIndex ??= buildSearchIndex();
  const out: SearchResult[] = [];
  for (const entry of searchIndex) {
    if (words.every((w) => entry.text.includes(w))) out.push(entry.result);
    if (out.length >= limit) break;
  }
  return out;
}

/** Nom d'une instance, avec majuscule (le jeu écrit « le Val d'Aurum »). */
export function dutyName(map: MapInfo): string {
  return map.d ? capitalize(map.d) : map.n;
}

/** Où se trouve un coin de pêche sur la carte. */
export function findFishingSpot(spotId: number): { mapId: number; x: number; y: number } | null {
  for (const [mapId, spots] of Object.entries(mapData().fishing)) {
    const spot = spots.find(([id]) => id === spotId);
    if (spot) return { mapId: Number(mapId), x: spot[3], y: spot[4] };
  }
  return null;
}

/** Où se trouve un point de récolte sur la carte. */
export function findGatheringNode(node: GatheringNode): { mapId: number; x: number; y: number } | null {
  const mapId = mapForTerritory(node.z);
  const map = mapId !== undefined ? getMap(mapId) : undefined;
  if (mapId === undefined || !map || !node.c) return null;
  const [x, y] = fromGameCoords(map, node.c[0], node.c[1]);
  return { mapId, x, y };
}
