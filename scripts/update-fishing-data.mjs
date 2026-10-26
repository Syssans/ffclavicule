#!/usr/bin/env node
/**
 * Données de pêche intégrées à l'appli (aucun appel pendant l'utilisation) :
 *  - poissons, coins de pêche, fenêtres (heures d'Éorzéa, météo), appâts et chaînes de mooching, taux de météo
 *    des zones : FF14 Fish Tracker (https://github.com/icykoneko/ff14-fish-tracker-app, licence MIT) ;
 *  - pêche en mer (moment de la journée, appât, poissons d'intuition) : Teamcraft
 *    (https://github.com/ffxiv-teamcraft/ffxiv-teamcraft, licence MIT) ;
 *  - itinéraires et escales de la pêche en mer, poissons de chaque coin, étoiles et rareté : données du jeu (XIVAPI).
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:peche
 *
 * Résultat : src/data/fishing.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'fishing.json');
const TRACKER = 'https://raw.githubusercontent.com/icykoneko/ff14-fish-tracker-app/master/js/app/data.js';
const TEAMCRAFT = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json/fishing-sources.json';
const XIVAPI = 'https://v2.xivapi.com/api';
const UA = { 'User-Agent': 'Clavicule (companion FFXIV)' };

async function text(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return res.text();
}
const json = async (url) => JSON.parse(await text(url));

/**
 * data.js déclare « const DATA = { FISH: {…}, … } » : du JSON dont seules les clés de premier niveau ne sont pas
 * entre guillemets. On le lit comme des données, sans jamais l'exécuter.
 */
function parseTracker(source) {
  const start = source.indexOf('{');
  const body = source
    .slice(start, source.lastIndexOf('}') + 1)
    .replace(/^(\s*)([A-Z_]+):/gm, '$1"$2":')
    .replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(body);
}

const num = (s) => (s === null || s === undefined || s === '' ? 0 : Number(s));

/** Teamcraft : 0 n'importe quand, 1 crépuscule, 2 jour, 3 nuit → jeu (IKDTimeDefine) : 1 jour, 2 crépuscule, 3 nuit. */
const OCEAN_TIME = { 0: 0, 1: 2, 2: 1, 3: 3 };

async function sheetRows(sheet, fields, rows) {
  const out = [];
  for (let i = 0; i < rows.length; i += 100) {
    const params = new URLSearchParams({ rows: rows.slice(i, i + 100).join(','), fields, language: 'fr' });
    const data = await json(`${XIVAPI}/sheet/${sheet}?${params}`);
    out.push(...data.rows);
  }
  return out;
}

async function searchAll(sheet, query, fields) {
  const rows = [];
  let params = new URLSearchParams({ sheets: sheet, query, fields, language: 'fr', limit: '500' });
  for (;;) {
    const page = await json(`${XIVAPI}/search?${params}`);
    rows.push(...page.results);
    if (!page.next) return rows;
    params = new URLSearchParams({ cursor: page.next, fields, language: 'fr', limit: '500' });
  }
}

async function main() {
  const D = parseTracker(await text(TRACKER));

  const weathers = {};
  for (const [id, w] of Object.entries(D.WEATHER_TYPES)) weathers[id] = { n: w.name_fr || w.name_en, i: num(w.icon) };

  // Zones : clé = identifiant de territoire (celui des coins de pêche), taux de météo cumulés.
  const zones = {};
  for (const [territory, w] of Object.entries(D.WEATHER_RATES)) {
    const zone = D.ZONES[w.zone_id];
    const region = D.REGIONS[w.region_id];
    zones[territory] = { n: zone?.name_fr || zone?.name_en || `Zone ${territory}`, r: region?.name_fr || region?.name_en || '', w: w.weather_rates };
  }

  const spots = {};
  for (const s of Object.values(D.FISHING_SPOTS)) {
    spots[s._id] = { n: s.name_fr || s.name_en, t: s.territory_id, c: s.map_coords ? [Math.round(s.map_coords[0] * 10) / 10, Math.round(s.map_coords[1] * 10) / 10] : null };
  }
  for (const s of Object.values(D.SPEARFISHING_SPOTS)) spots[`h${s._id}`] = { n: s.name_fr || s.name_en, t: s.territory_id, c: null, h: 1 };

  const items = {};
  for (const it of Object.values(D.ITEMS)) items[it._id] = { n: it.name_fr || it.name_en, i: num(it.icon) };

  const folklore = {};
  for (const [id, f] of Object.entries(D.FOLKLORE)) folklore[id] = f.name_fr || f.name_en;

  const fish = [];
  for (const f of Object.values(D.FISH)) {
    if (!items[f._id] || !f.location) continue;
    const entry = { id: f._id, s: f.gig ? `h${f.location}` : f.location, h: [f.startHour ?? 0, f.endHour ?? 24] };
    if (f.weatherSet?.length) entry.w = f.weatherSet;
    if (f.previousWeatherSet?.length) entry.pw = f.previousWeatherSet;
    if (f.bestCatchPath?.length) entry.b = f.bestCatchPath;
    if (f.predators?.length) entry.p = f.predators;
    if (f.intuitionLength) entry.il = f.intuitionLength;
    if (f.hookset) entry.hk = f.hookset;
    if (f.tug) entry.tg = f.tug;
    if (f.folklore) entry.fl = f.folklore;
    if (f.collectable) entry.co = 1;
    if (f.fishEyes) entry.fe = 1;
    if (f.bigFish) entry.big = 1;
    if (f.snagging) entry.sn = 1;
    if (f.lure) entry.lu = f.lure;
    if (f.gig) entry.g = f.gig;
    if (f.patch) entry.pt = f.patch;
    fish.push(entry);
  }

  // Pêche en mer : calendrier et escales (données du jeu).
  const table = await json(`${XIVAPI}/sheet/IKDRouteTable?limit=200&fields=IndigoRoute,RubyRoute`);
  const indigo = table.rows.map((r) => r.fields.IndigoRoute.value);
  const ruby = table.rows.map((r) => r.fields.RubyRoute.value);
  const routeIds = [...new Set([...indigo, ...ruby])].sort((a, b) => a - b);
  const routeRows = await sheetRows('IKDRoute', 'Name,Spot[].PlaceName.Name,Spot[].SpotMain,Spot[].SpotSub,Time[].TimeOfDay', routeIds);
  const routes = {};
  const oceanSpots = new Set();
  for (const r of routeRows) {
    const stops = (r.fields.Spot ?? []).map((s, i) => {
      oceanSpots.add(s.fields.SpotMain.value);
      oceanSpots.add(s.fields.SpotSub.value);
      return { p: s.fields.PlaceName.fields.Name, m: s.fields.SpotMain.value, s: s.fields.SpotSub.value, t: r.fields.Time[i].fields.TimeOfDay };
    });
    routes[r.row_id] = { n: r.fields.Name, s: stops };
  }

  // Poissons de chaque coin de la pêche en mer, avec rareté (bleu = 3) et étoiles.
  const spotRows = await sheetRows('FishingSpot', 'PlaceName.Name,Item[].Name,Item[].Icon,Item[].Rarity', [...oceanSpots]);
  const spotFish = {};
  const oceanItems = {};
  for (const s of spotRows) {
    spots[s.row_id] = spots[s.row_id] ?? { n: s.fields.PlaceName.fields.Name, t: 0, c: null };
    spots[s.row_id].n = s.fields.PlaceName.fields.Name;
    spotFish[s.row_id] = [];
    for (const it of s.fields.Item ?? []) {
      if (!it.value || !it.fields?.Name) continue;
      spotFish[s.row_id].push(it.value);
      oceanItems[it.value] = { r: it.fields.Rarity ?? 1 };
      items[it.value] = { n: it.fields.Name, i: it.fields.Icon?.id ?? 0 };
    }
  }
  const stars = await searchAll('FishParameter', Object.keys(oceanItems).map((id) => `Item=${id}`).join(' ').slice(0, 1e6), 'Item,OceanStars');
  for (const row of stars) {
    const id = row.fields.Item?.value;
    if (oceanItems[id]) oceanItems[id].st = row.fields.OceanStars ?? 0;
  }

  const sources = await json(TEAMCRAFT);
  const baits = new Set();
  for (const [itemId, list] of Object.entries(sources)) {
    if (!oceanItems[itemId]) continue;
    const src = list.find((s) => oceanSpots.has(s.spot)) ?? list[0];
    if (!src) continue;
    oceanItems[itemId].t = OCEAN_TIME[src.oceanFishingTime ?? 0] ?? 0;
    if (src.bait) {
      oceanItems[itemId].b = src.bait;
      baits.add(src.bait);
    }
    if (src.predators?.length) oceanItems[itemId].p = src.predators.map((p) => [p.id, p.amount]);
  }
  const missingBaits = [...baits].filter((id) => !items[id]);
  for (const row of await sheetRows('Item', 'Name,Icon', missingBaits)) items[row.row_id] = { n: row.fields.Name, i: row.fields.Icon?.id ?? 0 };

  const data = {
    sources: [
      'FF14 Fish Tracker (icykoneko/ff14-fish-tracker-app, MIT)',
      'Teamcraft (ffxiv-teamcraft/ffxiv-teamcraft, MIT)',
      'Données du jeu via XIVAPI',
    ],
    updatedAt: new Date().toISOString().slice(0, 10),
    weathers,
    zones,
    spots,
    items,
    folklore,
    fish,
    ocean: { indigo, ruby, routes, spotFish, fish: oceanItems },
  };
  writeFileSync(OUT, JSON.stringify(data));
  console.log(`${fish.length} poissons, ${Object.keys(spots).length} coins, ${Object.keys(zones).length} zones, ${Object.keys(routes).length} itinéraires, ${Object.keys(oceanItems).length} poissons de mer`);
  console.log(`Écrit : ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
