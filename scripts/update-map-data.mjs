#!/usr/bin/env node
/**
 * Données de la carte interactive, tirées des données du jeu (XIVAPI) :
 * - toutes les cartes (monde, régions, zones, villes, quartiers résidentiels, donjons, défis, raids…), avec leur
 *   échelle, leur décalage, leur région et le contenu associé ;
 * - les marqueurs officiels de chaque carte (noms de lieux, éthérites, passages vers les autres cartes, services…) ;
 * - les coins de pêche (feuille FishingSpot) ;
 * - les aléas et les cartes au trésor, dont les positions viennent de Teamcraft (licence MIT).
 *
 * Toutes les positions sont exprimées en pixels de la texture de la carte (2048 × 2048), comme dans le jeu.
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:carte
 *
 * Résultat : src/data/map.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'map.json');
/** Cartes de région assemblées (parchemin + terres des zones), livrées avec l'appli. */
const REGION_DIR = join(ROOT, 'assets', 'maps', 'regions');
const REGION_INDEX = join(ROOT, 'src', 'data', 'region-images.ts');
/** Les terres sont posées à 70 % d'opacité, comme le rendu du jeu. */
const OVERLAY_OPACITY = 0.7;
const OVERLAY_SIZE = 1024;
const MAP_SIZE = 2048;
const XIVAPI = 'https://v2.xivapi.com/api';
const UA = { 'User-Agent': 'Clavicule (companion FFXIV)' };
const PAGE = 500;
/** Données Teamcraft (licence MIT) : positions des aléas et des cartes au trésor. */
const TEAMCRAFT = 'https://raw.githubusercontent.com/ffxiv-teamcraft/ffxiv-teamcraft/staging/libs/data/src/lib/json';

async function json(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (attempt >= 3 || res.status < 500) throw new Error(`${url} : HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

/** Toute une feuille, page par page (les feuilles à sous-lignes se reprennent avec « ligne:sous-ligne »). */
async function sheet(name, fields) {
  const rows = [];
  let after = null;
  for (;;) {
    const params = new URLSearchParams({
      fields,
      language: 'fr',
      limit: String(PAGE),
    });
    if (after !== null) params.set('after', after);
    const page = await json(`${XIVAPI}/sheet/${name}?${params}`);
    if (!page.rows.length) return rows;
    rows.push(...page.rows);
    const last = page.rows[page.rows.length - 1];
    after = last.subrow_id !== undefined ? `${last.row_id}:${last.subrow_id}` : String(last.row_id);
    if (page.rows.length < PAGE) return rows;
  }
}

/** Des lignes précises. XIVAPI répond 404 si une seule manque : on coupe alors le lot en deux jusqu'à l'isoler. */
async function rowsOf(name, fields, ids) {
  const out = [];
  const load = async (batch) => {
    const params = new URLSearchParams({
      rows: batch.join(','),
      fields,
      language: 'fr',
    });
    try {
      out.push(...(await json(`${XIVAPI}/sheet/${name}?${params}`)).rows);
    } catch (error) {
      if (!String(error).includes('HTTP 404')) throw error;
      if (batch.length === 1) return;
      const half = Math.ceil(batch.length / 2);
      await load(batch.slice(0, half));
      await load(batch.slice(half));
    }
  };
  for (let i = 0; i < ids.length; i += 100) await load(ids.slice(i, i + 100));
  return out;
}

/** Les textes du jeu contiennent des césures conditionnelles (U+00AD) : on les retire. */
const clean = (text) => (text ?? '').replace(/\u00ad/g, '').trim();

/**
 * Types de contenu gardés comme « instances » (ContentType) : donjons, défis, raids, raids fatals, raids chaotiques,
 * donjons sans fond et spéciaux, zones d'exploration (Eurêka, Bozja, Lunule), chasse aux trésors, JcJ, batailles de quête.
 */
const INSTANCE_TYPES = new Set([2, 4, 5, 6, 7, 9, 21, 26, 28, 29, 30, 37, 38]);

/** Utilisations de territoire gardées hors instances : 0 villes, 1 zones, 13 quartiers résidentiels, 23 Gold Saucer. */
const OVERWORLD_USES = new Map([
  [0, 'city'],
  [1, 'zone'],
  [13, 'housing'],
  [23, 'city'],
]);

async function main() {
  const names = new Map();
  for (const r of await sheet('PlaceName', 'Name')) names.set(r.row_id, clean(r.fields.Name));
  const nameOf = (id) => names.get(id) || '';

  const territories = new Map();
  for (const r of await sheet(
    'TerritoryType',
    'TerritoryIntendedUse@as(raw),ContentFinderCondition@as(raw),ExVersion@as(raw),Map@as(raw),PlaceName@as(raw)',
  )) {
    territories.set(r.row_id, r.fields);
  }

  const duties = new Map();
  for (const r of await sheet('ContentFinderCondition', 'Name,ContentType@as(raw),ClassJobLevelRequired,ItemLevelRequired,HighEndDuty')) {
    duties.set(r.row_id, r.fields);
  }
  const contentTypes = {};
  for (const r of await sheet('ContentType', 'Name,Icon@as(raw)')) {
    if (INSTANCE_TYPES.has(r.row_id))
      contentTypes[r.row_id] = {
        n: clean(r.fields.Name),
        i: r.fields['Icon@as(raw)'] ?? 0,
      };
  }

  // Cartes. Plusieurs lignes peuvent partager la même texture (variantes selon l'avancée) : on n'en garde qu'une,
  // et on note les autres comme alias pour y ramener les marqueurs, aléas et quêtes.
  const mapRows = await sheet(
    'Map',
    'Id,SizeFactor,OffsetX,OffsetY,PlaceName@as(raw),PlaceNameRegion@as(raw),PlaceNameSub@as(raw),TerritoryType@as(raw),MapType@as(raw),MapIndex,MapMarkerRange,PriorityCategoryUI,PriorityUI,IsEvent',
  );
  const maps = {};
  const alias = {};
  const byTexture = new Map();
  for (const r of mapRows) {
    const f = r.fields;
    const id = f.Id;
    if (!id || id.startsWith('default/') || id.endsWith('/99') || f.IsEvent || !f.SizeFactor) continue;
    const territory = territories.get(f['TerritoryType@as(raw)']);
    const name = nameOf(f['PlaceName@as(raw)']);
    let kind = null;
    let content = null;
    const type = f['MapType@as(raw)'];
    if (type === 2) kind = 'world';
    else if (type >= 3) kind = 'region';
    else if (territory) {
      const duty = duties.get(territory['ContentFinderCondition@as(raw)']);
      const contentType = duty?.['ContentType@as(raw)'];
      if (duty && INSTANCE_TYPES.has(contentType)) {
        kind = 'instance';
        content = {
          c: contentType,
          d: clean(duty.Name),
          l: duty.ClassJobLevelRequired || 0,
          il: duty.ItemLevelRequired || 0,
          ...(duty.HighEndDuty ? { h: 1 } : {}),
        };
      } else {
        kind = OVERWORLD_USES.get(territory['TerritoryIntendedUse@as(raw)']) ?? null;
      }
    }
    // Instances de quête rangées parmi les villes (identifiant de donjon « xxdN ») : on les écarte.
    if (kind === 'city' && /^[a-z]\dd/.test(id)) continue;
    if (!kind || !name) continue;
    const key = `${id}|${f['TerritoryType@as(raw)']}`;
    const existing = byTexture.get(key);
    if (existing !== undefined) {
      alias[r.row_id] = existing;
      continue;
    }
    byTexture.set(key, r.row_id);
    maps[r.row_id] = {
      i: id,
      n: name,
      ...(nameOf(f['PlaceNameSub@as(raw)']) ? { s: nameOf(f['PlaceNameSub@as(raw)']) } : {}),
      r: nameOf(f['PlaceNameRegion@as(raw)']),
      t: f['TerritoryType@as(raw)'],
      sf: f.SizeFactor,
      ...(f.OffsetX ? { ox: f.OffsetX } : {}),
      ...(f.OffsetY ? { oy: f.OffsetY } : {}),
      k: kind,
      ...(territory?.['ExVersion@as(raw)'] ? { x: territory['ExVersion@as(raw)'] } : {}),
      ...(content ?? {}),
      _range: f.MapMarkerRange,
      _order: [f.PriorityCategoryUI, f.PriorityUI],
    };
  }
  const canonical = (id) => (maps[id] ? id : alias[id]);

  // Marqueurs officiels.
  const markerRows = new Map();
  for (const r of await sheet('MapMarker', 'X,Y,Icon@as(raw),PlaceNameSubtext@as(raw),SubtextOrientation,Type,DataType,DataKey@as(raw)')) {
    const list = markerRows.get(r.row_id) ?? [];
    list.push(r.fields);
    markerRows.set(r.row_id, list);
  }
  const aetherytes = new Map();
  for (const r of await sheet('Aetheryte', 'PlaceName@as(raw)')) aetherytes.set(r.row_id, r.fields['PlaceName@as(raw)'] ?? 0);

  const usedNames = new Set();
  const label = (id) => {
    const text = nameOf(id);
    if (!text) return 0;
    usedNames.add(id);
    return id;
  };

  /**
   * Un marqueur : [x, y, icône, nom (PlaceName), genre, lien, orientation du texte].
   * Genres : 0 repère, 1 grand nom de zone, 2 passage vers une autre carte, 3 éthérite, 4 éthernet.
   * Lien : carte cible (passage) ou numéro d'éthérite.
   */
  const markers = {};
  /** Terres des zones sur les cartes de région : [x, y, icône]. */
  const overlays = {};
  const parents = {};
  const linkCount = (map) => (markerRows.get(map._range) ?? []).filter((f) => f.DataType === 1).length;
  // Les cartes du monde les plus complètes d'abord : c'est à elles que les régions se rattachent.
  const ordered = Object.entries(maps).sort(([, a], [, b]) => (b.k === 'world' ? linkCount(b) : -1) - (a.k === 'world' ? linkCount(a) : -1));
  for (const [id, map] of ordered) {
    const out = [];
    for (const f of markerRows.get(map._range) ?? []) {
      if (!f.X && !f.Y) continue;
      let icon = f['Icon@as(raw)'] ?? 0;
      // Les icônes 63200 à 63499 sont les terres de chaque zone sur les cartes de région : une image de 1024 pixels
      // de carte, centrée sur le repère, posée sur le parchemin. On la garde à part, et le repère devient un nom
      // cliquable.
      if (icon >= 63200 && icon < 63500) {
        (overlays[id] ??= []).push([f.X, f.Y, icon]);
        icon = 0;
      }
      const dataType = f.DataType;
      const key = f['DataKey@as(raw)'] ?? 0;
      let kind = f.Type === 1 ? 1 : 0;
      let link = 0;
      let name = label(f['PlaceNameSubtext@as(raw)']);
      if (dataType === 1) {
        const target = canonical(key);
        if (!target || String(target) === id) continue;
        kind = 2;
        link = Number(target);
        if (!name) name = label(mapRowsName(target));
        // Une région se rattache à une carte du monde, une zone à une carte de région (les régions se citent aussi
        // entre voisines : ces liens-là ne sont pas des rattachements).
        const child = maps[target].k;
        const isParent = map.k === 'world' ? child === 'region' : map.k === 'region' && !['world', 'region'].includes(child);
        if (isParent) parents[target] ??= Number(id);
      } else if (dataType === 3) {
        kind = 3;
        link = key;
        if (!name) name = label(aetherytes.get(key) ?? 0);
      } else if (dataType === 4) {
        kind = 4;
        name = name || label(key);
      }
      if (!icon && !name) continue;
      out.push([f.X, f.Y, icon, name, kind, link, f.SubtextOrientation ?? 0]);
    }
    if (out.length) markers[id] = out;
  }
  function mapRowsName(target) {
    const row = mapRows.find((r) => r.row_id === target);
    return row?.fields['PlaceName@as(raw)'] ?? 0;
  }

  // Régions : rattachement des zones par le nom de leur région quand aucune carte de région n'y mène.
  const regionByName = new Map(
    Object.entries(maps)
      .filter(([, m]) => m.k === 'region')
      .map(([id, m]) => [m.n, Number(id)]),
  );
  for (const [id, map] of Object.entries(maps)) {
    if (map.k === 'world' || parents[id]) continue;
    const region = regionByName.get(map.r);
    if (region && String(region) !== id) parents[id] = region;
  }
  for (const [id, parent] of Object.entries(parents)) if (maps[id]) maps[id].p = parent;

  // Carte par défaut de chaque territoire (pour placer les points de récolte, les coins de pêche…).
  const territoryMap = {};
  for (const [id, t] of territories) {
    const m = canonical(t['Map@as(raw)']);
    if (m) territoryMap[id] = Number(m);
  }

  /** Coordonnées affichées en jeu (X 22,9 Y 22,2) -> pixels de la carte. */
  const fromMapCoords = (map, x, y) => {
    const c = map.sf / 100;
    return [Math.round(((x - 1) * c * 2048) / 41), Math.round(((y - 1) * c * 2048) / 41)];
  };

  // Aléas : nom, niveau et icône tirés du jeu ; position relevée par Teamcraft (le jeu la range dans les fichiers de
  // décor des zones, hors des feuilles de données).
  const teamcraftFates = await json(`${TEAMCRAFT}/fates.json`);
  const fates = {};
  let fateCount = 0;
  for (const r of await sheet('Fate', 'Name,ClassJobLevel,MapIcon@as(raw),Icon@as(raw)')) {
    const position = teamcraftFates[r.row_id]?.position;
    const name = clean(r.fields.Name);
    // Les aléas jamais sortis en Europe gardent un nom japonais : on les écarte.
    if (/[\u3040-\u30ff\u4e00-\u9fff]/.test(name)) continue;
    const mapId = position && canonical(position.map);
    const map = mapId && maps[mapId];
    if (!map || !name) continue;
    const [x, y] = fromMapCoords(map, position.x, position.y);
    (fates[mapId] ??= []).push([r.row_id, name, r.fields.ClassJobLevel || 0, x, y, r.fields['MapIcon@as(raw)'] || 60501]);
    fateCount++;
  }

  // Cartes au trésor : emplacements relevés par Teamcraft, objet (carte) tiré du jeu.
  const teamcraftTreasures = await json(`${TEAMCRAFT}/treasures.json`);
  const treasures = {};
  const treasureItems = {};
  for (const r of await rowsOf('Item', 'Name,Icon@as(raw)', [...new Set(teamcraftTreasures.map((t) => t.item).filter(Boolean))])) {
    treasureItems[r.row_id] = {
      n: clean(r.fields.Name),
      i: r.fields['Icon@as(raw)'] ?? 0,
    };
  }
  let treasureCount = 0;
  for (const t of teamcraftTreasures) {
    const mapId = canonical(t.map);
    const map = mapId && maps[mapId];
    if (!map || !treasureItems[t.item] || !t.coords) continue;
    const [x, y] = fromMapCoords(map, t.coords.x, t.coords.y);
    (treasures[mapId] ??= []).push([x, y, t.item, t.partySize || 1]);
    treasureCount++;
  }

  // Coins de pêche : la feuille donne déjà la position en pixels de la carte.
  const fishing = {};
  let spotCount = 0;
  for (const r of await sheet('FishingSpot', 'PlaceName@as(raw),TerritoryType@as(raw),X,Z,Radius,GatheringLevel')) {
    const mapId = territoryMap[r.fields['TerritoryType@as(raw)']];
    if (!mapId || !nameOf(r.fields['PlaceName@as(raw)']) || (!r.fields.X && !r.fields.Z)) continue;
    (fishing[mapId] ??= []).push([
      r.row_id,
      label(r.fields['PlaceName@as(raw)']),
      r.fields.GatheringLevel || 0,
      r.fields.X,
      r.fields.Z,
      r.fields.Radius || 0,
    ]);
    spotCount++;
  }

  // Icônes des quêtes sur la carte : EventIconType.MapIconAvailable + 1 (quête disponible).
  const questIcons = {};
  for (const r of await sheet('EventIconType', 'MapIconAvailable@as(raw)')) {
    const icon = r.fields['MapIconAvailable@as(raw)'];
    if (icon) questIcons[r.row_id] = icon + 1;
  }

  // Ordre d'affichage du jeu, puis nettoyage des champs de travail.
  const order = Object.entries(maps)
    .sort(([, a], [, b]) => a._order[0] - b._order[0] || a._order[1] - b._order[1])
    .map(([id]) => Number(id));
  for (const map of Object.values(maps)) {
    delete map._range;
    delete map._order;
  }

  const placeNames = {};
  for (const id of [...usedNames].sort((a, b) => a - b)) placeNames[id] = nameOf(id);

  const data = {
    sources: ['Données du jeu via XIVAPI', 'Teamcraft (ffxiv-teamcraft/ffxiv-teamcraft, MIT) : positions des aléas et des trésors'],
    updatedAt: new Date().toISOString().slice(0, 10),
    contentTypes,
    maps,
    order,
    alias,
    territoryMap,
    names: placeNames,
    markers,
    fates,
    fishing,
    treasures,
    treasureItems,
    questIcons,
  };
  writeFileSync(OUT, JSON.stringify(data));
  await buildRegionImages(maps, overlays);
  const count = (k) => Object.values(maps).filter((m) => m.k === k).length;
  console.log(
    `${Object.keys(maps).length} cartes (${count('world')} mondes, ${count('region')} régions, ${count('zone')} zones, ${count('city')} villes, ${count('housing')} quartiers, ${count('instance')} instances)`,
  );
  console.log(`${Object.values(markers).flat().length} marqueurs, ${fateCount} aléas, ${spotCount} coins de pêche, ${treasureCount} trésors`);
  console.log(`Écrit : ${OUT}`);
}

async function download(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Cartes de région « toutes faites » : le parchemin du jeu avec les terres de chaque zone déjà posées dessus
 * (icônes 63200 à 63499 : 1024 pixels de carte centrés sur le repère de la zone). Une seule image à afficher au lieu
 * d'une douzaine.
 */
async function buildRegionImages(maps, overlays) {
  mkdirSync(REGION_DIR, { recursive: true });
  const entries = [];
  for (const [id, list] of Object.entries(overlays)) {
    const map = maps[id];
    const base = await download(`${XIVAPI}/asset/map/${map.i}`);
    const layers = [];
    for (const [x, y, icon] of list) {
      const group = String(Math.floor(icon / 1000) * 1000).padStart(6, '0');
      const file = String(icon).padStart(6, '0');
      const png = await download(`${XIVAPI}/asset?${new URLSearchParams({ path: `ui/icon/${group}/${file}_hr1.tex`, format: 'png' })}`);
      const { data, info } = await sharp(png).resize(OVERLAY_SIZE, OVERLAY_SIZE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * OVERLAY_OPACITY);
      // Partie de l'image qui tombe sur la carte (une terre peut déborder du bord).
      const left = Math.round(x - OVERLAY_SIZE / 2);
      const top = Math.round(y - OVERLAY_SIZE / 2);
      const cropLeft = Math.max(0, -left);
      const cropTop = Math.max(0, -top);
      const width = Math.min(OVERLAY_SIZE - cropLeft, MAP_SIZE - Math.max(0, left));
      const height = Math.min(OVERLAY_SIZE - cropTop, MAP_SIZE - Math.max(0, top));
      if (width <= 0 || height <= 0) continue;
      const input = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .extract({ left: cropLeft, top: cropTop, width, height })
        .png()
        .toBuffer();
      layers.push({ input, left: Math.max(0, left), top: Math.max(0, top) });
    }
    const name = map.i.replace('/', '-');
    await sharp(base).resize(MAP_SIZE, MAP_SIZE).composite(layers).jpeg({ quality: 82, mozjpeg: true }).toFile(join(REGION_DIR, `${name}.jpg`));
    entries.push([Number(id), name]);
    console.log(`Région ${map.n} : ${layers.length} terres posées`);
  }
  const lines = entries.map(([id, name]) => `  ${id}: require('../../assets/maps/regions/${name}.jpg'),`);
  writeFileSync(
    REGION_INDEX,
    `/** Généré par scripts/update-map-data.mjs : cartes de région assemblées (parchemin + terres des zones). */\n` +
      `export const REGION_IMAGES: Record<number, number> = {\n${lines.join('\n')}\n};\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
