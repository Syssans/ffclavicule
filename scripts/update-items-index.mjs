#!/usr/bin/env node
/**
 * Index des objets du jeu intégré à l'appli, pour une recherche instantanée qui ignore majuscules, accents et
 * ligatures (« epee » trouve « Épée », « oeil » trouve « Cache-œil »), même hors connexion.
 *
 * Pour rafraîchir après un patch :
 *   npm run donnees:objets
 *
 * Résultat : src/data/items.json
 *   - items : une ligne par objet, « id|nom|icône|catégorie|niveau d'objet|vendable » (1 si vendable au marché) ;
 *   - categories : nom de chaque catégorie d'objet (ItemUICategory).
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'items.json');
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
    if (!page.rows.length) return rows;
    rows.push(...page.rows);
    after = page.rows[page.rows.length - 1].row_id;
    process.stdout.write(`\r${name} : ${rows.length} lignes`);
    if (page.rows.length < PAGE) break;
  }
  process.stdout.write('\n');
  return rows;
}

const categories = {};
for (const row of await sheet('ItemUICategory', 'Name')) {
  if (row.fields.Name) categories[row.row_id] = row.fields.Name;
}

const lines = [];
for (const row of await sheet('Item', 'Name,Icon@as(raw),ItemUICategory@as(raw),LevelItem@as(raw),ItemSearchCategory@as(raw)')) {
  const f = row.fields;
  // Les noms vides sont des lignes inutilisées ; « | » ne figure dans aucun nom.
  const name = (f.Name ?? '').replace(/­/g, '').trim();
  if (!name || name.includes('|')) continue;
  const level = f['LevelItem@as(raw)'] > 1 ? f['LevelItem@as(raw)'] : '';
  lines.push(
    [row.row_id, name, f['Icon@as(raw)'] || '', f['ItemUICategory@as(raw)'] || '', level, f['ItemSearchCategory@as(raw)'] > 0 ? 1 : ''].join('|'),
  );
}

writeFileSync(OUT, JSON.stringify({ categories, items: lines.join('\n') }) + '\n');
console.log(`${lines.length} objets écrits dans ${OUT}`);
