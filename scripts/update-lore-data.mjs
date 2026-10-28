#!/usr/bin/env node
/**
 * La Légende : le lore du jeu intégré à l'appli, tiré des données du jeu (XIVAPI), en français.
 *
 * - Personnages : les cartes de Triple Triade (portrait et citation) ;
 * - Lieux : le carnet d'exploration (tableau du lieu, inscription et impressions) ;
 * - Chroniques : donjons, défis et raids (bannière et récit) ;
 * - Montures et mascottes : leur histoire, telle que la racontent leurs guides.
 *
 * Chaque texte reçoit ses liens : les noms d'autres fiches (personnages, chroniques) et de zones de la carte qu'il
 * cite deviennent touchables, comme dans un wiki.
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:legende
 *
 * Résultat : src/data/lore.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'lore.json');
const MAP = join(ROOT, 'src', 'data', 'map.json');
const XIVAPI = 'https://v2.xivapi.com/api';
const UA = { 'User-Agent': 'Clavicule (companion FFXIV)' };
const PAGE = 500;

async function json(url) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res.json();
    if (attempt >= 4) throw new Error(`${url} : HTTP ${res.status}`);
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

/** Toute une feuille, page par page. */
async function sheet(name, fields) {
  const rows = [];
  let after = null;
  for (;;) {
    const params = new URLSearchParams({ fields, language: 'fr', limit: String(PAGE) });
    if (after !== null) params.set('after', String(after));
    const page = await json(`${XIVAPI}/sheet/${name}?${params}`);
    if (!page.rows.length) break;
    rows.push(...page.rows);
    after = page.rows[page.rows.length - 1].row_id;
    if (page.rows.length < PAGE) break;
  }
  console.log(`${name} : ${rows.length} lignes`);
  return rows;
}

/** Texte du jeu nettoyé : césures invisibles, balises, espaces. */
function clean(text) {
  return String(text ?? '')
    .replace(/­/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? undefined : (v.fields?.[k] ?? v[k])), o);

const entries = [];

// ——— Personnages : cartes de Triple Triade ———
const cardText = new Map((await sheet('TripleTriadCard', 'Name,Description')).map((r) => [r.row_id, r.fields]));
for (const r of await sheet('TripleTriadCardResident', 'TripleTriadCardRarity.Stars,TripleTriadCardType.Name')) {
  const card = cardText.get(r.row_id);
  const name = clean(card?.Name);
  const quote = clean(card?.Description);
  if (!name || !quote) continue;
  entries.push({
    k: `p${r.row_id}`,
    t: 'perso',
    n: name,
    s: clean(get(r.fields, 'TripleTriadCardType.Name')) || null,
    e: quote,
    i: 87000 + r.row_id,
    r: get(r.fields, 'TripleTriadCardRarity.Stars') || 0,
  });
}

// ——— Lieux : carnet d'exploration ———
for (const r of await sheet(
  'Adventure',
  'Name,Description,Impression,PlaceName.Name,IconDiscovered@as(raw),Level.Map@as(raw),Level.X,Level.Z,Level.Territory.ExVersion@as(raw)',
)) {
  const f = r.fields;
  const name = clean(f.Name);
  const impression = clean(f.Impression);
  if (!name || !impression) continue;
  entries.push({
    k: `l${r.row_id}`,
    t: 'lieu',
    n: name,
    s: clean(get(f, 'PlaceName.Name')) || null,
    x: impression,
    e: clean(f.Description) || null,
    i: f['IconDiscovered@as(raw)'] || 0,
    v: get(f, 'Level.Territory.ExVersion@as(raw)') ?? 0,
    m: get(f, 'Level.Map@as(raw)') ? [get(f, 'Level.Map@as(raw)'), get(f, 'Level.X'), get(f, 'Level.Z')] : null,
  });
}

// ——— Chroniques : donjons, défis, raids… ———
const DUTY_TYPES = new Map([
  [2, 'Donjon'],
  [4, 'Défi'],
  [5, 'Raid'],
  [21, 'Donjon sans fond'],
  [26, 'Eurêka'],
  [28, 'Raid fatal'],
  [29, 'Garde-la-Reine'],
  [30, 'Donjon spécial'],
  [37, 'Raid chaotique'],
]);
const dutyText = new Map((await sheet('ContentFinderConditionTransient', 'Description')).map((r) => [r.row_id, clean(r.fields.Description)]));
const seenDuty = new Set();
for (const r of await sheet(
  'ContentFinderCondition',
  'Name,ContentType@as(raw),ClassJobLevelRequired,ItemLevelRequired,Image@as(raw),TerritoryType.ExVersion@as(raw)',
)) {
  const f = r.fields;
  const type = DUTY_TYPES.get(f['ContentType@as(raw)']);
  const name = capitalize(clean(f.Name));
  const text = dutyText.get(r.row_id);
  if (!type || !name || !text || seenDuty.has(name)) continue;
  seenDuty.add(name);
  entries.push({
    k: `d${r.row_id}`,
    t: 'recit',
    n: name,
    s: `${type}${f.ClassJobLevelRequired ? ` · niv. ${f.ClassJobLevelRequired}` : ''}`,
    x: text,
    i: f['Image@as(raw)'] || 0,
    v: get(f, 'TerritoryType.ExVersion@as(raw)') ?? 0,
    g: type,
  });
}

// ——— Montures et mascottes ———
async function companions(base, transient, type, prefix) {
  const lore = new Map((await sheet(transient, 'DescriptionEnhanced,Tooltip')).map((r) => [r.row_id, r.fields]));
  for (const r of await sheet(base, 'Singular,Icon@as(raw)')) {
    const name = capitalize(clean(r.fields.Singular));
    const story = clean(lore.get(r.row_id)?.DescriptionEnhanced);
    const icon = r.fields['Icon@as(raw)'];
    if (!name || !story || !icon) continue;
    entries.push({ k: `${prefix}${r.row_id}`, t: type, n: name, x: story, e: clean(lore.get(r.row_id)?.Tooltip) || null, i: icon + 64000 });
  }
}
await companions('Mount', 'MountTransient', 'monture', 'm');
await companions('Companion', 'CompanionTransient', 'mascotte', 'c');

// ——— Liens : noms de fiches et de zones cités dans les textes ———
const targets = new Map();
const addTarget = (name, key) => {
  const n = name.replace(/^(le|la|les|l’|l')\s*/i, '').trim();
  // Trop court ou trop vague pour être un lien sûr.
  if (n.length < 5 || targets.has(n)) return;
  targets.set(n, key);
};
for (const e of entries) if (e.t === 'perso' || e.t === 'recit') addTarget(e.n, e.k);
const mapData = JSON.parse(readFileSync(MAP, 'utf8'));
for (const [id, m] of Object.entries(mapData.maps)) {
  if (['zone', 'city', 'region'].includes(m.k) && m.n) addTarget(m.n.split(' - ')[0], `map:${id}`);
}
// Les noms les plus longs d'abord : « Limsa Lominsa » avant « Limsa ».
const names = [...targets.keys()].sort((a, b) => b.length - a.length);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = names.map((n) => {
  const key = targets.get(n);
  // Noms propres à l'identique, mots entiers. Seuls les donjons (« le Val d'Aurum ») acceptent une minuscule initiale :
  // un nom de carte comme « Chocobo » ne doit pas attraper chaque « chocobo » des textes.
  const first = key.startsWith('d') ? `[${n[0].toUpperCase()}${n[0].toLowerCase()}]` : escape(n[0]);
  return { key, re: new RegExp(`(?<![\\p{L}\\p{N}])${first}${escape(n.slice(1))}(?![\\p{L}\\p{N}])`, 'gu') };
});

function linksOf(text, self) {
  if (!text) return undefined;
  const taken = [];
  const used = new Set();
  const out = [];
  for (const { key, re } of patterns) {
    if (key === self || used.has(key)) continue;
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      used.add(key);
      out.push([start, m[0].length, key]);
      break;
    }
  }
  return out.length ? out.sort((a, b) => a[0] - b[0]) : undefined;
}
let linkCount = 0;
for (const e of entries) {
  const lx = linksOf(e.x, e.k);
  const le = linksOf(e.e, e.k);
  if (lx) e.lx = lx;
  if (le) e.le = le;
  linkCount += (lx?.length ?? 0) + (le?.length ?? 0);
}

writeFileSync(OUT, JSON.stringify({ updatedAt: new Date().toISOString().slice(0, 10), entries }) + '\n');
const count = (t) => entries.filter((e) => e.t === t).length;
console.log(
  `${entries.length} fiches : ${count('perso')} personnages, ${count('lieu')} lieux, ${count('recit')} chroniques, ${count('monture')} montures, ${count('mascotte')} mascottes ; ${linkCount} liens`,
);
