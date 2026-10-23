#!/usr/bin/env node
/**
 * Instantané des données de FFXIV Collect (https://ffxivcollect.com, code sous licence MIT) intégré à l'appli :
 * provenances saisies par leur communauté (butins de donjon, boutique en ligne, événements…) et part des joueurs
 * qui possèdent chaque élément.
 *
 * L'appli ne contacte jamais FFXIV Collect : elle lit ce fichier. Pour le rafraîchir (après un patch, par exemple) :
 *   npm run donnees:collect
 *
 * Résultat : src/data/collect-reference.json
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://ffxivcollect.com/api';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'collect-reference.json');

/** Collection de l'appli → point d'accès de l'API. */
const COLLECTIONS = {
  mounts: 'mounts',
  minions: 'minions',
  orchestrions: 'orchestrions',
  emotes: 'emotes',
  hairstyles: 'hairstyles',
  bardings: 'bardings',
  fashions: 'fashions',
  facewear: 'facewear',
  cards: 'triad/cards',
  spells: 'spells',
  titles: 'titles',
  armoire: 'armoires',
};

/** Types de provenance de FFXIV Collect (noms français) → clés de l'appli (voir src/utils/collections.ts). */
const SOURCE_TYPES = {
  'Hauts faits': 'achievement',
  Dresseur: 'beastmaster',
  Bozja: 'bozja',
  'Mage bleu': 'blue-mage',
  'Raid chaotique': 'chaotic-raid',
  'Exploration cosmique': 'cosmic',
  Artisanat: 'crafting',
  'Donjon sans fond': 'deep-dungeon',
  Donjon: 'dungeon',
  Eurêka: 'eureka',
  'Événement saisonnier': 'event',
  ALEA: 'fate',
  Récolte: 'gathering',
  'Gold Saucer': 'gold-saucer',
  Chasse: 'hunts',
  'Félicité insulaire': 'island',
  PNJ: 'npc',
  "L'île de Lunule": 'occult',
  Autre: 'other',
  Premium: 'premium',
  Achetable: 'purchase',
  JcJ: 'pvp',
  Quête: 'quest',
  Raid: 'raid',
  Azurée: 'skybuilders',
  'Chasse aux trésors': 'treasure',
  Défi: 'trial',
  Tribus: 'tribal',
  'Raid fatal': 'ultimate',
  'Donjon à embranchements': 'vc-dungeon',
  'Tâches de servant': 'venture',
  Expéditions: 'voyages',
  'Aventures imaginaires': 'wondrous-tails',
};

/** « 12.3% » → 12.3 ; null si inconnu. */
export function parseOwned(text) {
  const value = Number.parseFloat(String(text ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Une entrée compacte : i (id du jeu), n (nom), t (objet), o (% de joueurs), s ([type, texte]) ; e (nom anglais) ajouté à part. */
export function compact(record) {
  const entry = { i: record.id, n: record.name };
  if (record.item_id) entry.t = record.item_id;
  const owned = parseOwned(record.owned);
  if (owned !== null) entry.o = owned;
  const sources = (record.sources ?? [])
    .filter((s) => s.text)
    .map((s) => [SOURCE_TYPES[s.type] ?? 'other', String(s.text).trim()]);
  // Titres : leur provenance est le haut fait qui les donne.
  if (sources.length === 0 && record.achievement?.name) sources.push(['achievement', record.achievement.name]);
  if (sources.length > 0) entry.s = sources;
  return entry;
}

/** Collections que le Lodestone liste (en anglais) : on garde aussi le nom anglais pour les retrouver. */
const WITH_ENGLISH = new Set(['mounts', 'minions']);

async function fetchCollection(path, language = 'fr') {
  const response = await fetch(`${API}/${path}?language=${language}`, { headers: { 'User-Agent': 'Clavicule (companion FFXIV)' } });
  if (!response.ok) throw new Error(`${path} : HTTP ${response.status}`);
  const body = await response.json();
  return Array.isArray(body) ? body : body.results;
}

async function main() {
  const collections = {};
  for (const [key, path] of Object.entries(COLLECTIONS)) {
    const records = await fetchCollection(path);
    collections[key] = records.map(compact).sort((a, b) => a.i - b.i);
    if (WITH_ENGLISH.has(key)) {
      const english = new Map((await fetchCollection(path, 'en')).map((r) => [r.id, r.name]));
      for (const entry of collections[key]) {
        const name = english.get(entry.i);
        if (name) entry.e = name;
      }
    }
    console.log(`${key} : ${records.length}`);
  }
  const reference = {
    source: 'FFXIV Collect (ffxivcollect.com)',
    updatedAt: new Date().toISOString().slice(0, 10),
    collections,
  };
  writeFileSync(OUT, JSON.stringify(reference));
  console.log(`Écrit : ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
