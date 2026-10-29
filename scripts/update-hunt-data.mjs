#!/usr/bin/env node
/**
 * Données de chasse intégrées à l'appli :
 * - marques de chaque zone (rangs B, A, S, SS) et contrats de chasse (quotidiens et d'élite), tirés des données
 *   du jeu (tables extraites par xivapi/ffxiv-datamining, noms français via XIVAPI) ;
 * - points d'apparition des marques, repris du plugin HuntHelper (licence MIT) ;
 * - positions des cibles des contrats, reprises de Teamcraft (licence MIT).
 *
 * Les conditions d'apparition des rangs S, rédigées à la main, sont dans src/data/hunt-notes.ts.
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:chasse
 *
 * Résultat : src/data/hunt.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'hunt.json');
const XIVAPI = 'https://v2.xivapi.com/api';
const CSV = 'https://raw.githubusercontent.com/xivapi/ffxiv-datamining/master/csv/en';
const SPAWNS = 'https://raw.githubusercontent.com/imaginary-png/HuntHelper/main/HuntHelper/Data/SpawnPointData.json';
const MONSTERS = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/monsters.json';
const UA = { 'User-Agent': 'Clavicule (companion FFXIV)' };

async function get(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res;
}

/** Une table du jeu au format CSV : lignes de valeurs (texte), l'identifiant en premier. */
async function table(name) {
  const text = await (await get(`${CSV}/${name}.csv`)).text();
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') ((cell += '"'), i++);
        else if (c === '"') quoted = false;
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') (cells.push(cell), (cell = ''));
      else cell += c;
    }
    cells.push(cell);
    // Les lignes d'en-tête commencent par « key » ou « # » ; les sous-lignes s'écrivent « 12.3 ».
    if (/^\d+(\.\d+)?$/.test(cells[0])) rows.push(cells);
  }
  return rows;
}

async function rowsOf(name, fields, ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 100) {
    const params = new URLSearchParams({ rows: ids.slice(i, i + 100).join(','), fields, language: 'fr' });
    out.push(...(await (await get(`${XIVAPI}/sheet/${name}?${params}`)).json()).rows);
  }
  return out;
}

/** Extension d'une zone de chasse, d'après son numéro de territoire. */
function expansionOf(territory) {
  if (territory < 300) return 0;
  if (territory < 600) return 1;
  if (territory < 800) return 2;
  if (territory < 900) return 3;
  if (territory < 1100) return 4;
  return 5;
}

/** Extension de chaque type de contrat (index du jeu). */
const BILL_EXPANSION = [0, 1, 1, 1, 0, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5];

const RANKS = { 1: 'B', 2: 'A', 3: 'S' };

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Positions distinctes sur une carte (au dixième), au plus `max`, sans les relevés isolés loin du groupe. */
function distinct(points, max) {
  const seen = new Set();
  const out = [];
  const mx = median(points.map((p) => p[0]));
  const my = median(points.map((p) => p[1]));
  for (const [x, y] of points) {
    if (Math.hypot(x - mx, y - my) > 7) continue;
    const key = `${Math.round(x)}:${Math.round(y)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    if (out.length >= max) break;
  }
  return out;
}

async function main() {
  const [notorious, notoriousTerritory, territoryType, orderTypes, orders, targets] = await Promise.all(
    ['NotoriousMonster', 'NotoriousMonsterTerritory', 'TerritoryType', 'MobHuntOrderType', 'MobHuntOrder', 'MobHuntTarget'].map(table),
  );
  const monsters = await (await get(MONSTERS)).json();
  const spawnData = await (await get(SPAWNS)).json();

  // Marques de chaque zone : TerritoryType (colonne NotoriousMonsterTerritory) -> NotoriousMonster.
  const nm = new Map(notorious.map((r) => [r[0], { name: Number(r[1]), rank: Number(r[4]) }]));
  const nmt = new Map(notoriousTerritory.map((r) => [r[0], r.slice(1)]));
  const zones = [];
  const names = new Set();
  for (const r of territoryType) {
    const list = nmt.get(r[16]);
    if (!list || r[16] === '0') continue;
    const territory = Number(r[0]);
    const marks = [];
    list.forEach((id, slot) => {
      const m = nm.get(id);
      if (!m || id === '0' || !m.name) return;
      // À partir de Shadowbringers, les cases 5 à 9 sont l'événement du rang SS : 4 sbires puis le SS.
      const rank = slot >= 5 ? (slot === 9 ? 'SS' : 'sbire') : RANKS[m.rank];
      if (!rank || marks.some((x) => x.n === m.name && x.r === rank)) return;
      marks.push({ n: m.name, r: rank });
      names.add(m.name);
    });
    zones.push({ t: territory, x: expansionOf(territory), marks });
  }

  // Points d'apparition (coordonnées de carte) ; drapeaux : 1 rang B, 2 rang A, 4 rang S.
  const spawns = {};
  for (const zone of spawnData) {
    spawns[zone.MapID] = zone.Positions.map((p) => [p.X, p.Y, (p.B ? 1 : 0) | (p.A ? 2 : 0) | (p.S ? 4 : 0)]);
  }

  // Contrats : type -> contrats possibles (MobHuntOrder) -> cibles (MobHuntTarget).
  const targetRows = new Map(targets.map((r) => [r[0], r]));
  const byOrder = new Map();
  for (const r of orders) {
    const [row] = r[0].split('.');
    const target = Number(r[1]);
    if (!target) continue;
    if (!byOrder.has(row)) byOrder.set(row, []);
    byOrder.get(row).push([target, Number(r[2])]);
  }
  const usedTargets = new Set();
  const bills = [];
  for (const r of orderTypes) {
    const index = Number(r[0]);
    const start = Number(r[3]);
    const amount = Number(r[5]);
    const list = {};
    for (let row = start; row < start + amount; row++) {
      const t = byOrder.get(String(row));
      if (!t) continue;
      list[row] = t;
      t.forEach(([id]) => usedTargets.add(id));
    }
    bills.push({
      k: index,
      q: Number(r[1]),
      e: Number(r[2]),
      type: Number(r[4]) === 2 ? 'elite' : 'daily',
      x: BILL_EXPANSION[index] ?? 0,
      orders: list,
    });
  }

  const targetOut = {};
  const placeIds = new Set();
  for (const id of usedTargets) {
    const r = targetRows.get(String(id));
    if (!r) continue;
    const name = Number(r[2]);
    const map = Number(r[4]);
    const place = Number(r[5]);
    names.add(name);
    if (place) placeIds.add(place);
    const positions = (monsters[String(name)]?.positions ?? [])
      .filter((p) => p.map === map && !(p.x === 21.5 && p.y === 21.5))
      .map((p) => [p.x, p.y]);
    targetOut[id] = {
      n: name,
      i: Number(r[1]),
      m: map,
      ...(place ? { p: place } : {}),
      ...(Number(r[3]) ? { f: Number(r[3]) } : {}),
      c: distinct(positions, 8),
    };
  }

  // Noms français.
  const nameOut = {};
  for (const r of await rowsOf('BNpcName', 'Singular', [...names])) nameOut[r.row_id] = r.fields.Singular ?? '';
  const places = {};
  for (const r of await rowsOf('PlaceName', 'Name', [...placeIds])) places[r.row_id] = r.fields.Name ?? '';
  const billNames = {};
  for (const r of await rowsOf(
    'EventItem',
    'Name,Icon',
    bills.map((b) => b.e),
  ))
    billNames[r.row_id] = { n: r.fields.Name ?? '', i: r.fields.Icon?.id ?? 0 };
  const quests = {};
  for (const r of await rowsOf('Quest', 'Name', bills.map((b) => b.q).filter(Boolean))) quests[r.row_id] = r.fields.Name ?? '';
  for (const b of bills) {
    b.n = billNames[b.e]?.n || (b.type === 'elite' ? 'Contrat d’élite' : 'Contrats de chasse');
    b.i = billNames[b.e]?.i ?? 0;
    if (b.q && quests[b.q]) b.qn = quests[b.q];
    delete b.e;
  }

  const data = {
    source: 'Données du jeu (XIVAPI, ffxiv-datamining) ; points d’apparition : HuntHelper (© 2022 imaginary-png, licence MIT) ; positions des cibles : Teamcraft (licence MIT)',
    updatedAt: new Date().toISOString().slice(0, 10),
    zones,
    spawns,
    bills,
    targets: targetOut,
    names: nameOut,
    places,
  };
  writeFileSync(OUT, JSON.stringify(data));
  const placed = Object.values(targetOut).filter((t) => t.c.length).length;
  console.log(
    `${zones.length} zones, ${Object.keys(spawns).length} avec points d’apparition, ${bills.length} types de contrats, ${placed}/${Object.keys(targetOut).length} cibles placées`,
  );
  console.log(`Écrit : ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
