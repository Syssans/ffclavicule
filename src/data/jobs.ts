/**
 * Jobs affichés dans l'appli. `key` est la clé utilisée par les sélecteurs du Lodestone
 * (profile/classjob.json), `id` la ligne de la feuille ClassJob du jeu.
 * Noms et abréviations : données du jeu en français (via ffxiv-teamcraft).
 */
export type Role = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster' | 'limited' | 'crafter' | 'gatherer';

export interface Job {
  id: number;
  key: string;
  name: string;
  abbr: string;
  role: Role;
}

export const ROLE_LABELS: Record<Role, string> = {
  tank: 'Tanks',
  healer: 'Soigneurs',
  melee: 'DPS mêlée',
  ranged: 'DPS distance physique',
  caster: 'DPS distance magique',
  limited: 'Jobs limités',
  crafter: 'Artisans',
  gatherer: 'Récolteurs',
};

export const ROLE_ORDER: Role[] = ['tank', 'healer', 'melee', 'ranged', 'caster', 'limited', 'crafter', 'gatherer'];

export const JOBS: Job[] = [
  { id: 19, key: 'PALADIN', name: 'Paladin', abbr: 'PLD', role: 'tank' },
  { id: 21, key: 'WARRIOR', name: 'Guerrier', abbr: 'GUE', role: 'tank' },
  { id: 32, key: 'DARKKNIGHT', name: 'Chevalier noir', abbr: 'CHN', role: 'tank' },
  { id: 37, key: 'GUNBREAKER', name: 'Pistosabreur', abbr: 'PSB', role: 'tank' },
  { id: 24, key: 'WHITEMAGE', name: 'Mage blanc', abbr: 'MBL', role: 'healer' },
  { id: 28, key: 'SCHOLAR', name: 'Érudit', abbr: 'ÉRU', role: 'healer' },
  { id: 33, key: 'ASTROLOGIAN', name: 'Astromancien', abbr: 'AST', role: 'healer' },
  { id: 40, key: 'SAGE', name: 'Sage', abbr: 'SAG', role: 'healer' },
  { id: 20, key: 'MONK', name: 'Moine', abbr: 'MOI', role: 'melee' },
  { id: 22, key: 'DRAGOON', name: 'Chevalier dragon', abbr: 'DRG', role: 'melee' },
  { id: 30, key: 'NINJA', name: 'Ninja', abbr: 'NIN', role: 'melee' },
  { id: 34, key: 'SAMURAI', name: 'Samouraï', abbr: 'SAM', role: 'melee' },
  { id: 39, key: 'REAPER', name: 'Faucheur', abbr: 'FCH', role: 'melee' },
  { id: 41, key: 'VIPER', name: 'Rôdeur vipère', abbr: 'VPR', role: 'melee' },
  { id: 23, key: 'BARD', name: 'Barde', abbr: 'BRD', role: 'ranged' },
  { id: 31, key: 'MACHINIST', name: 'Machiniste', abbr: 'MCH', role: 'ranged' },
  { id: 38, key: 'DANCER', name: 'Danseur', abbr: 'DNS', role: 'ranged' },
  { id: 25, key: 'BLACKMAGE', name: 'Mage noir', abbr: 'MNO', role: 'caster' },
  { id: 27, key: 'SUMMONER', name: 'Invocateur', abbr: 'INV', role: 'caster' },
  { id: 35, key: 'REDMAGE', name: 'Mage rouge', abbr: 'MRG', role: 'caster' },
  { id: 42, key: 'PICTOMANCER', name: 'Pictomancien', abbr: 'PIC', role: 'caster' },
  { id: 36, key: 'BLUEMAGE', name: 'Mage bleu', abbr: 'MBU', role: 'limited' },
  { id: 43, key: 'BEASTMASTER', name: 'Dresseur', abbr: 'DRE', role: 'limited' },
  { id: 8, key: 'CARPENTER', name: 'Menuisier', abbr: 'MEN', role: 'crafter' },
  { id: 9, key: 'BLACKSMITH', name: 'Forgeron', abbr: 'FRG', role: 'crafter' },
  { id: 10, key: 'ARMORER', name: 'Armurier', abbr: 'ARM', role: 'crafter' },
  { id: 11, key: 'GOLDSMITH', name: 'Orfèvre', abbr: 'ORF', role: 'crafter' },
  { id: 12, key: 'LEATHERWORKER', name: 'Tanneur', abbr: 'TAN', role: 'crafter' },
  { id: 13, key: 'WEAVER', name: 'Couturier', abbr: 'COU', role: 'crafter' },
  { id: 14, key: 'ALCHEMIST', name: 'Alchimiste', abbr: 'ALC', role: 'crafter' },
  { id: 15, key: 'CULINARIAN', name: 'Cuisinier', abbr: 'CUI', role: 'crafter' },
  { id: 16, key: 'MINER', name: 'Mineur', abbr: 'MIN', role: 'gatherer' },
  { id: 17, key: 'BOTANIST', name: 'Botaniste', abbr: 'BTN', role: 'gatherer' },
  { id: 18, key: 'FISHER', name: 'Pêcheur', abbr: 'PÊC', role: 'gatherer' },
];

export const JOBS_BY_KEY: Record<string, Job> = Object.fromEntries(JOBS.map((j) => [j.key, j]));
