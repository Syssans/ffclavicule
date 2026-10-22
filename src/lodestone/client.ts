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
  bio: string | null;
  gear: GearPiece[];
}

function parseGear(html: string): GearPiece[] {
  const raw = extractPage(html, gearSelectors as Definition);
  const pieces: GearPiece[] = [];
  for (const { key, label } of GEAR_SLOTS) {
    const slot = obj(raw[key]);
    const name = str(slot?.NAME);
    if (!slot || !name) continue;
    const materia: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const m = str(obj(slot[`MATERIA_${i}`])?.Name);
      if (m) materia.push(m);
    }
    pieces.push({
      slot: key,
      slotLabel: label,
      name,
      itemLevel: num(slot.ITEM_LEVEL),
      glamour: str(slot.MIRAGE_NAME),
      dye: str(slot.STAIN),
      materia,
      creator: str(slot.CREATOR_NAME),
    });
  }
  return pieces;
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
    bio: str(raw.BIO),
    gear: parseGear(html),
  };
}

export async function getCharacter(region: LodestoneRegion, id: number): Promise<CharacterProfile> {
  return parseCharacterProfile(id, await fetchPage(`${baseUrl(region)}/character/${id}/`));
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
