#!/usr/bin/env node
/**
 * Données de récolte intégrées à l'appli, tirées des données du jeu (XIVAPI) : points de récolte (métier, niveau,
 * zone, coordonnées, objets), horaires des points légendaires, immaculés et éphémères, objets récoltables.
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:recolte
 *
 * Résultat : src/data/gathering.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'gathering.json');
const XIVAPI = 'https://v2.xivapi.com/api';
const UA = { 'User-Agent': 'Clavicule (companion FFXIV)' };
const NONE = 65535;

async function json(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.json();
}

/** Toute une feuille, page par page. */
async function sheet(name, fields) {
  const rows = [];
  let after = null;
  for (;;) {
    const params = new URLSearchParams({ fields, language: 'fr', limit: '250' });
    if (after !== null) params.set('after', String(after));
    const page = await json(`${XIVAPI}/sheet/${name}?${params}`);
    if (!page.rows.length) return rows;
    rows.push(...page.rows);
    after = page.rows[page.rows.length - 1].row_id;
    if (page.rows.length < 250) return rows;
  }
}

async function rowsOf(name, fields, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const params = new URLSearchParams({ rows: ids.slice(i, i + 100).join(','), fields, language: 'fr' });
    out.push(...(await json(`${XIVAPI}/sheet/${name}?${params}`)).rows);
  }
  return out;
}

/** Le jeu écrit heures et durées en « HHMM » (600 = 6 h, 160 = 1 h 60 = 2 h) : on les convertit en minutes d'Éorzéa. */
function hhmm(value) {
  return Math.floor(value / 100) * 60 + (value % 100);
}

/** Coordonnée de carte (comme en jeu) à partir d'une position du monde. */
function mapCoord(raw, offset, sizeFactor) {
  const c = sizeFactor / 100;
  return Math.round(((41 / c) * (((raw + offset) * c + 1024) / 2048) + 1) * 10) / 10;
}

async function main() {
  // Objets récoltables : GatheringItem -> objet, niveau, étoiles, caché.
  const gatheringItems = new Map();
  for (const r of await sheet('GatheringItem', 'Item@as(raw),GatheringItemLevel.GatheringItemLevel,GatheringItemLevel.Stars,IsHidden')) {
    const item = r.fields['Item@as(raw)'];
    // Les objets d'événement (quêtes) ont des numéros à partir de 2 000 000 : on ne garde que les vrais objets.
    if (!item || item <= 0 || item >= 2_000_000) continue;
    const level = r.fields.GatheringItemLevel?.fields ?? {};
    gatheringItems.set(r.row_id, [item, level.GatheringItemLevel ?? 0, level.Stars ?? 0, r.fields.IsHidden ? 1 : 0]);
  }

  // Points : base (métier, niveau, objets) et emplacements (zone, lieu, type).
  const bases = new Map();
  for (const r of await sheet('GatheringPointBase', 'GatheringType@as(raw),GatheringLevel,Item@as(raw)')) {
    const type = r.fields['GatheringType@as(raw)'] ?? 0;
    if (type > 3) continue; // pêche au harpon : dans le module Pêche
    const items = (r.fields['Item@as(raw)'] ?? []).filter((id) => gatheringItems.has(id));
    if (items.length === 0) continue;
    bases.set(r.row_id, { type, level: r.fields.GatheringLevel ?? 0, items });
  }

  const transient = new Map();
  for (const r of await sheet(
    'GatheringPointTransient',
    'GatheringRarePopTimeTable.StartTime,GatheringRarePopTimeTable.Duration,EphemeralStartTime,EphemeralEndTime',
  )) {
    const pop = r.fields.GatheringRarePopTimeTable;
    const starts = (pop?.fields?.StartTime ?? [])
      .map((s, i) => [s, pop.fields.Duration?.[i] ?? 0])
      .filter(([s, d]) => s !== NONE && d > 0)
      .map(([s, d]) => [hhmm(s), hhmm(d)]);
    const eph =
      r.fields.EphemeralStartTime !== NONE && r.fields.EphemeralEndTime !== NONE ? [hhmm(r.fields.EphemeralStartTime), hhmm(r.fields.EphemeralEndTime)] : null;
    if (starts.length || eph) transient.set(r.row_id, { pop: starts, eph });
  }

  const exported = new Map();
  for (const r of await sheet('ExportedGatheringPoint', 'X,Y,GatheringPointType')) {
    if (r.fields.X || r.fields.Y) exported.set(r.row_id, { x: r.fields.X, y: r.fields.Y, kind: r.fields.GatheringPointType ?? 0 });
  }

  // Un point par base et par zone (le jeu en déclare plusieurs, un par emplacement possible).
  const nodes = new Map();
  for (const r of await sheet('GatheringPoint', 'Type,GatheringPointBase@as(raw),TerritoryType@as(raw),PlaceName.Name,GatheringSubCategory.FolkloreBook')) {
    const baseId = r.fields['GatheringPointBase@as(raw)'];
    const territory = r.fields['TerritoryType@as(raw)'];
    const base = bases.get(baseId);
    if (!base || !territory) continue;
    const key = `${baseId}:${territory}`;
    const node = nodes.get(key) ?? { b: baseId, j: base.type, l: base.level, t: r.fields.Type ?? 0, z: territory, p: r.fields.PlaceName?.fields?.Name || '', it: base.items };
    const folklore = r.fields.GatheringSubCategory?.fields?.FolkloreBook;
    if (folklore) node.fl = folklore;
    const timing = transient.get(r.row_id);
    if (timing?.pop.length) node.ti = timing.pop;
    if (timing?.eph) node.e = timing.eph;
    nodes.set(key, node);
  }

  // Zones et coordonnées.
  const territories = [...new Set([...nodes.values()].map((n) => n.z))];
  const zones = {};
  const maps = new Map();
  for (const r of await rowsOf('TerritoryType', 'PlaceName.Name,PlaceNameRegion.Name,Map.SizeFactor,Map.OffsetX,Map.OffsetY', territories)) {
    zones[r.row_id] = { n: r.fields.PlaceName?.fields?.Name || `Zone ${r.row_id}`, r: r.fields.PlaceNameRegion?.fields?.Name || '' };
    const m = r.fields.Map?.fields;
    if (m) maps.set(r.row_id, m);
  }
  for (const node of nodes.values()) {
    const pos = exported.get(node.b);
    const m = maps.get(node.z);
    if (pos && m) node.c = [mapCoord(pos.x, m.OffsetX ?? 0, m.SizeFactor || 100), mapCoord(pos.y, m.OffsetY ?? 0, m.SizeFactor || 100)];
  }

  // Objets : noms, icônes, vendable au marché.
  const itemIds = [...new Set([...gatheringItems.values()].map(([id]) => id))];
  const items = {};
  for (const r of await rowsOf('Item', 'Name,Icon,ItemSearchCategory@as(raw)', itemIds)) {
    if (!r.fields.Name) continue;
    items[r.row_id] = { n: r.fields.Name, i: r.fields.Icon?.id ?? 0, ...(r.fields['ItemSearchCategory@as(raw)'] > 0 ? { m: 1 } : {}) };
  }
  const gitems = {};
  for (const [id, entry] of gatheringItems) if (items[entry[0]]) gitems[id] = entry;

  const data = {
    source: 'Données du jeu via XIVAPI',
    updatedAt: new Date().toISOString().slice(0, 10),
    zones,
    items,
    gitems,
    // Types de points : 2 immaculé, 4 éphémère, 5 légendaire (les autres sont des points ordinaires).
    nodes: [...nodes.values()].filter((n) => zones[n.z] && !/^Zone \d+$/.test(zones[n.z].n)).sort((a, b) => a.l - b.l || a.b - b.b),
  };
  writeFileSync(OUT, JSON.stringify(data));
  const timed = data.nodes.filter((n) => n.ti || n.e);
  console.log(`${data.nodes.length} points (${timed.length} à horaires), ${Object.keys(gitems).length} objets récoltables, ${Object.keys(zones).length} zones`);
  console.log(`Types de points à horaires : ${JSON.stringify(Object.fromEntries([...new Set(timed.map((n) => n.t))].map((t) => [t, timed.filter((n) => n.t === t).length])))}`);
  console.log(`Écrit : ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
