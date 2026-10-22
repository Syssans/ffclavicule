/**
 * Lecture des pages publiques du Lodestone (site officiel de FFXIV).
 * On lit les pages en anglais (eu ou na) : les expressions régulières des sélecteurs
 * communautaires sont écrites pour cette langue.
 */
import { getText } from '@/api/http';
import { JOBS, type Job } from '@/data/jobs';

import { extractPage, toInt, type Definition, type Extracted, type ExtractedObject } from './interpreter';
import characterSelectors from './selectors/profile/character.json';
import classJobSelectors from './selectors/profile/classjob.json';
import gearSelectors from './selectors/profile/gearset.json';
import meta from './selectors/meta.json';
import searchSelectors from './selectors/search/character.json';

export type LodestoneRegion = 'eu' | 'na';

const SOURCE = 'le Lodestone';

function baseUrl(region: LodestoneRegion): string {
  return `https://${region}.finalfantasyxiv.com/lodestone`;
}

function fetchPage(url: string): Promise<string> {
  return getText(url, { source: SOURCE, headers: { 'User-Agent': meta.userAgentDesktop } });
}

// ---------------------------------------------------------------------------
// Petites aides de lecture du résultat brut
// ---------------------------------------------------------------------------

function obj(value: Extracted | undefined): ExtractedObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function str(value: Extracted | undefined): string | null {
  if (value === null || value === undefined || typeof value === 'object') return null;
  return String(value);
}

function num(value: Extracted | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return toInt(value);
  return null;
}

// ---------------------------------------------------------------------------
// Recherche
// ---------------------------------------------------------------------------

export interface CharacterSearchResult {
  id: number;
  name: string;
  world: string | null;
  dataCenter: string | null;
  avatar: string | null;
}

export interface CharacterSearchPage {
  results: CharacterSearchResult[];
  page: number;
  totalPages: number;
}

export function parseCharacterSearch(html: string): CharacterSearchPage {
  const raw = extractPage(html, searchSelectors as Definition);
  const entries = Array.isArray(raw.ENTRY) ? raw.ENTRY : [];
  const results: CharacterSearchResult[] = [];
  for (const entry of entries) {
    const e = obj(entry);
    const id = num(obj(e?.ID)?.ID);
    const name = str(e?.NAME);
    if (!e || id === null || !name) continue;
    const server = obj(e.SERVER);
    results.push({ id, name, world: str(server?.World), dataCenter: str(server?.DC), avatar: str(e.AVATAR) });
  }
  const pageInfo = obj(raw.PAGE_INFO);
  return {
    results,
    page: num(pageInfo?.CurrentPage) ?? 1,
    totalPages: num(pageInfo?.NumPages) ?? (results.length > 0 ? 1 : 0),
  };
}

export async function searchCharacters(
  region: LodestoneRegion,
  name: string,
  world = '',
  page = 1,
): Promise<CharacterSearchPage> {
  const params = new URLSearchParams({ q: name.trim(), worldname: world, page: String(page) });
  return parseCharacterSearch(await fetchPage(`${baseUrl(region)}/character/?${params}`));
}

// ---------------------------------------------------------------------------
// Profil et équipement
// ---------------------------------------------------------------------------

export const GEAR_SLOTS = [
  { key: 'MAINHAND', label: 'Arme' },
  { key: 'OFFHAND', label: 'Arme secondaire' },
  { key: 'HEAD', label: 'Tête' },
  { key: 'BODY', label: 'Torse' },
  { key: 'HANDS', label: 'Mains' },
  { key: 'LEGS', label: 'Jambes' },
  { key: 'FEET', label: 'Pieds' },
  { key: 'EARRINGS', label: "Boucles d'oreilles" },
  { key: 'NECKLACE', label: 'Collier' },
  { key: 'BRACELETS', label: 'Bracelets' },
  { key: 'RING1', label: 'Bague' },
  { key: 'RING2', label: 'Bague' },
  { key: 'SOULCRYSTAL', label: "Cristal de l'âme" },
] as const;

export interface GearPiece {
  slot: string;
  slotLabel: string;
  name: string;
  /** Pièce de haute qualité. */
  hq: boolean;
  /** Icône de l'objet (serveur d'images du Lodestone). */
  icon: string | null;
  itemLevel: number | null;
  glamour: string | null;
  dye: string | null;
  materia: string[];
  creator: string | null;
}

export interface CharacterProfile {
  id: number;
  name: string;
  title: string | null;
  world: string | null;
  dataCenter: string | null;
  avatar: string | null;
  portrait: string | null;
  race: string | null;
  tribe: string | null;
  gender: string | null;
  nameday: string | null;
  guardian: string | null;
  cityState: string | null;
  grandCompany: { name: string | null; rank: string | null } | null;
  freeCompany: { id: string | null; name: string } | null;
  activeJobLevel: number | null;
  /** Icône du job actif (serveur d'images du Lodestone). */
  activeJobIcon: string | null;
  guardianIcon: string | null;
  cityStateIcon: string | null;
  bio: string | null;
  /** Equipement présent dans la page, s'il y en a (sinon voir `gearTooltips`). */
  gear: GearPiece[];
  /** Pièces dont le détail se charge à part, avec getGear(). */
  gearTooltips: number[];
}

type GearSlotKey = (typeof GEAR_SLOTS)[number]['key'];

/** Symbole « HQ » du jeu (zone Unicode privée), ajouté par le Lodestone après le nom. */
const HQ_GLYPH = '\uE03C';
/** Glyphes propres au jeu (zone Unicode privée), illisibles hors du jeu. */
const GAME_GLYPHS = /[\uE000-\uF8FF]/g;

function toGearPiece(key: GearSlotKey, label: string, slot: ExtractedObject | null): GearPiece | null {
  const rawName = str(slot?.NAME);
  const name = rawName?.replace(GAME_GLYPHS, '').trim();
  if (!slot || !rawName || !name) return null;
  const materia: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const m = str(obj(slot[`MATERIA_${i}`])?.Name);
    if (m) materia.push(m);
  }
  return {
    slot: key,
    slotLabel: label,
    name,
    hq: rawName.includes(HQ_GLYPH),
    icon: null,
    itemLevel: num(slot.ITEM_LEVEL),
    glamour: str(slot.MIRAGE_NAME),
    dye: str(slot.STAIN),
    materia,
    creator: str(slot.CREATOR_NAME),
  };
}

/** Equipement décrit directement dans la page (ancienne présentation du Lodestone). */
function parseInlineGear(html: string): GearPiece[] {
  const raw = extractPage(html, gearSelectors as Definition);
  return GEAR_SLOTS.map(({ key, label }) => toGearPiece(key, label, obj(raw[key]))).filter(
    (p): p is GearPiece => p !== null,
  );
}

/** Numéro de l'emplacement (« icon-c--N ») utilisé par les sélecteurs d'une pièce. */
function slotIndex(key: GearSlotKey): number | null {
  const selectors = JSON.stringify((gearSelectors as Record<string, unknown>)[key] ?? {});
  const match = /icon-c--(\d+)/.exec(selectors);
  return match ? Number(match[1]) : null;
}

/**
 * Le Lodestone charge désormais le détail de chaque pièce à part
 * (/lodestone/character/ID/equipment/tooltip/N). On remet ce détail à sa place d'origine,
 * sous l'icône « icon-c--N », pour que les sélecteurs communautaires s'appliquent tels quels.
 * Sa position parmi les enfants de l'icône varie selon les sélecteurs (4e en général,
 * 3e pour le cristal de l'âme) : on garde celle qui donne le plus de champs.
 */
export function parseGearTooltip(key: GearSlotKey, label: string, fragment: string): GearPiece | null {
  const index = slotIndex(key);
  if (index === null) return null;
  const def = { [key]: (gearSelectors as Record<string, Definition>)[key] } as Definition;
  let best: GearPiece | null = null;
  let bestScore = -1;
  for (const fillers of [3, 2, 1, 0]) {
    const html = `<div class="icon-c--${index}">${'<div></div>'.repeat(fillers)}${fragment}</div>`;
    const piece = toGearPiece(key, label, obj(extractPage(html, def)[key]));
    if (!piece) continue;
    piece.icon = str(extractPage(fragment, { ICON: { selector: '.db-tooltip__item__icon__item_image', attribute: 'src' } }).ICON);
    const score = Object.values(piece).filter((v) => v !== null && !(Array.isArray(v) && v.length === 0)).length;
    if (score > bestScore) {
      best = piece;
      bestScore = score;
    }
  }
  return best;
}

/** Numéros des pièces dont la page indique un détail à charger. */
function gearTooltipIndexes(html: string): number[] {
  const found = new Set<number>();
  for (const m of html.matchAll(/\/equipment\/tooltip\/(\d+)/g)) found.add(Number(m[1]));
  return [...found];
}

export function parseCharacterProfile(id: number, html: string): CharacterProfile {
  const raw = extractPage(html, characterSelectors as Definition);
  const name = str(raw.NAME);
  if (!name) throw new Error('Page de personnage illisible : le Lodestone a peut-être changé.');
  const server = obj(raw.SERVER);
  const rcg = obj(raw.RACE_CLAN_GENDER);
  const gc = obj(raw.GRAND_COMPANY);
  const fc = obj(raw.FREE_COMPANY);
  const fcName = str(fc?.NAME);
  return {
    id,
    name,
    title: str(raw.TITLE),
    world: str(server?.World),
    dataCenter: str(server?.DC),
    avatar: str(raw.AVATAR),
    portrait: str(raw.PORTRAIT),
    race: str(rcg?.Race),
    tribe: str(rcg?.Tribe),
    gender: str(rcg?.Gender),
    nameday: str(raw.NAMEDAY),
    guardian: str(obj(raw.GUARDIAN_DEITY)?.NAME),
    cityState: str(obj(raw.TOWN)?.NAME),
    grandCompany: gc ? { name: str(gc.Name), rank: str(gc.Rank) } : null,
    freeCompany: fcName ? { id: str(obj(fc?.ID)?.ID), name: fcName } : null,
    activeJobLevel: num(obj(raw.ACTIVE_CLASSJOB_LEVEL)?.Level),
    activeJobIcon: str(raw.ACTIVE_CLASSJOB),
    guardianIcon: str(obj(raw.GUARDIAN_DEITY)?.ICON),
    cityStateIcon: str(obj(raw.TOWN)?.ICON),
    // Le Lodestone affiche « - » quand la présentation est vide.
    bio: str(raw.BIO) === '-' ? null : str(raw.BIO),
    gear: parseInlineGear(html),
    gearTooltips: gearTooltipIndexes(html),
  };
}

export async function getCharacter(region: LodestoneRegion, id: number): Promise<CharacterProfile> {
  return parseCharacterProfile(id, await fetchPage(`${baseUrl(region)}/character/${id}/`));
}

/** Equipement porté : celui de la page, sinon le détail de chaque pièce chargé à part. */
export async function getGear(region: LodestoneRegion, profile: CharacterProfile): Promise<GearPiece[]> {
  if (profile.gear.length > 0) return profile.gear;
  const wanted = new Set(profile.gearTooltips);
  const slots = GEAR_SLOTS.filter(({ key }) => {
    const index = slotIndex(key);
    return index !== null && wanted.has(index);
  });
  const pieces = await Promise.all(
    slots.map(async ({ key, label }) => {
      const fragment = await fetchPage(`${baseUrl(region)}/character/${profile.id}/equipment/tooltip/${slotIndex(key)}`);
      return parseGearTooltip(key, label, fragment);
    }),
  );
  return pieces.filter((p): p is GearPiece => p !== null);
}

// ---------------------------------------------------------------------------
// Niveaux des jobs
// ---------------------------------------------------------------------------

export interface JobLevel {
  job: Job;
  /** null si le job n'est pas débloqué. */
  level: number | null;
  exp: number | null;
  maxExp: number | null;
}

export function parseClassJobs(html: string): JobLevel[] {
  const raw = extractPage(html, classJobSelectors as Definition);
  return JOBS.map((job) => {
    const entry = obj(raw[job.key]);
    const exp = obj(entry?.EXP);
    const level = num(entry?.LEVEL);
    return {
      job,
      level: level && level > 0 ? level : null,
      exp: num(exp?.CurrentEXP),
      maxExp: num(exp?.MaxEXP),
    };
  });
}

export async function getClassJobs(region: LodestoneRegion, id: number): Promise<JobLevel[]> {
  return parseClassJobs(await fetchPage(`${baseUrl(region)}/character/${id}/class_job/`));
}

export function lodestoneProfileUrl(region: LodestoneRegion, id: number): string {
  return `${baseUrl(region)}/character/${id}/`;
}

// ---------------------------------------------------------------------------
// Diagnostic
// ---------------------------------------------------------------------------

export interface LodestoneProbe {
  /** La page ressemble à la version ordinateur du Lodestone, celle que l'appli sait lire. */
  recognized: boolean;
  /** Fiches de personnage présentes dans le HTML reçu (comptées sans l'analyseur). */
  rawEntries: number;
  /** Fiches que l'appli a réussi à lire. */
  results: number;
  bytes: number;
  title: string | null;
  /** Extrait du HTML autour de la première fiche, ou du début de la page. */
  excerpt: string;
}

/** Lit une page de recherche et dit si l'appli la reconnaît. */
export async function probeLodestone(region: LodestoneRegion): Promise<LodestoneProbe> {
  const html = await fetchPage(`${baseUrl(region)}/character/?${new URLSearchParams({ q: 'Warrior' })}`);
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null;
  const first = html.indexOf('entry__name');
  const body = html.indexOf('<body');
  const from = first >= 0 ? Math.max(0, first - 600) : Math.max(0, body);
  return {
    recognized: html.includes('ldst__window'),
    rawEntries: html.split('entry__name').length - 1,
    results: parseCharacterSearch(html).results.length,
    bytes: html.length,
    title,
    excerpt: html.slice(from, from + 900).replace(/\s+/g, ' '),
  };
}
