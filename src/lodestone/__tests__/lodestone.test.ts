import { parseHtml, evaluate, extractPage, toInt, translateRegex, type Definition } from '../interpreter';
import { parseCharacterProfile, parseCharacterSearch, parseClassJobs } from '../client';
import characterSelectors from '../selectors/profile/character.json';
import classJobSelectors from '../selectors/profile/classjob.json';
import gearSelectors from '../selectors/profile/gearset.json';
import { buildHtml, parseSelector, type Fill } from './build-html';

type Leaf = { selector: string; attribute?: string };
type Group = { [key: string]: Leaf | Group };

/** Toutes les feuilles (sélecteurs) d'un fichier, avec leur chemin de clés. */
function leaves(group: Group, path: string[] = []): { path: string[]; leaf: Leaf }[] {
  return Object.entries(group).flatMap(([key, value]) =>
    typeof (value as Leaf).selector === 'string'
      ? [{ path: [...path, key], leaf: value as Leaf }]
      : leaves(value as Group, [...path, key]),
  );
}

describe('interpréteur de sélecteurs', () => {
  it('convertit les entiers du Lodestone', () => {
    expect(toInt('1,234,567')).toBe(1234567);
    expect(toInt('Item Level 730')).toBe(730);
    expect(toInt('-')).toBeNull();
    expect(toInt('')).toBeNull();
  });

  it('traduit les regex Python et accepte toutes les formes de <br>', () => {
    const re = translateRegex('(?P<Name>.*)<br/>');
    expect(re.exec('Savage Aim Materia XII<br>Critical Hit +54')?.groups?.Name).toBe('Savage Aim Materia XII');
    expect(re.exec('A<br />B')?.groups?.Name).toBe('A');
    expect(translateRegex('(?P<Race>.*)<br\\/?>(?P<Tribe>.*)').exec('Hyur<br>Midlander')?.groups).toEqual({
      Race: 'Hyur',
      Tribe: 'Midlander',
    });
  });

  it('lit texte, attribut, regex typée, listes et groupes avec ROOT', () => {
    const doc = parseHtml(`
      <div class="list">
        <div class="row"><a class="name" href="/x/12/">Alpha &amp; Co</a><span class="n">1,500</span></div>
        <div class="row"><a class="name" href="/x/34/">Beta</a><span class="n">-</span></div>
      </div>`);
    const def: Definition = {
      ROWS: {
        ROOT: { selector: '.row', multiple: true },
        NAME: { selector: '.name', type: 'string' },
        ID: { selector: '.name', attribute: 'href', regex: '/x/(?P<ID>\\d+)/', type: { ID: 'integer' } },
        N: { selector: '.n', type: 'integer' },
      },
      MISSING: { selector: '.nothing', type: 'string' },
      ALL_NAMES: { selector: '.name', multiple: true, type: 'string' },
    };
    expect(evaluate(def, doc)).toEqual({
      ROWS: [
        { NAME: 'Alpha & Co', ID: { ID: 12 }, N: 1500 },
        { NAME: 'Beta', ID: { ID: 34 }, N: null },
      ],
      MISSING: null,
      ALL_NAMES: ['Alpha & Co', 'Beta'],
    });
  });

  it('garde en texte les identifiants trop longs pour un nombre', () => {
    const page = '<a class="fc" href="/lodestone/freecompany/9229001536389012345/">FC</a>';
    const def: Definition = {
      ID: { selector: '.fc', attribute: 'href', regex: '/freecompany/(?P<ID>.+)/', type: { ID: 'integer' } },
    };
    expect(extractPage(page, def)).toEqual({ ID: { ID: '9229001536389012345' } });
  });

  it('accepte la syntaxe de chacun des sélecteurs communautaires', () => {
    const doc = parseHtml('<html><body></body></html>');
    for (const file of [characterSelectors, classJobSelectors, gearSelectors]) {
      for (const { leaf } of leaves(file as Group)) {
        expect(() => doc.querySelector(leaf.selector)).not.toThrow();
        expect(() => parseSelector(leaf.selector)).not.toThrow();
      }
    }
  });
});

describe('recherche de personnages', () => {
  it('lit les résultats et la pagination', () => {
    const html = `
      <div class="ldst__window">
        <div class="entry">
          <a class="entry__link" href="/lodestone/character/12345678/">
            <div class="entry__chara__face"><img src="https://img.finalfantasyxiv.com/a.jpg"></div>
            <div class="entry__box"><p class="entry__name">Anton Millien</p>
            <p class="entry__world"><i class="xiv-lds"></i>Moogle [Chaos]</p></div>
          </a>
        </div>
        <div class="entry">
          <a class="entry__link" href="/lodestone/character/87654321/">
            <p class="entry__name">Anton Other</p><p class="entry__world">Cerberus [Chaos]</p>
          </a>
        </div>
        <ul class="btn__pager"><li></li><li></li><li>Page 1 of 3</li><li><a href="?page=2">next</a></li></ul>
      </div>`;
    expect(parseCharacterSearch(html)).toEqual({
      page: 1,
      totalPages: 3,
      results: [
        { id: 12345678, name: 'Anton Millien', world: 'Moogle', dataCenter: 'Chaos', avatar: 'https://img.finalfantasyxiv.com/a.jpg' },
        { id: 87654321, name: 'Anton Other', world: 'Cerberus', dataCenter: 'Chaos', avatar: null },
      ],
    });
  });

  it('renvoie une liste vide sans résultat', () => {
    const html = '<div class="ldst__window"><p class="parts__zero">Your search yielded no results.</p></div>';
    expect(parseCharacterSearch(html)).toEqual({ results: [], page: 1, totalPages: 0 });
  });
});

/** Valeurs d'exemple pour chaque champ de la fiche personnage. */
const PROFILE_VALUES: Record<string, Omit<Fill, 'selector'>> = {
  'ACTIVE_CLASSJOB_LEVEL': { html: 'LEVEL 100' },
  'AVATAR': { attrs: { src: 'https://img/avatar.jpg' } },
  'BIO': { html: 'Bonjour &amp; bienvenue' },
  'FREE_COMPANY.ID': { attrs: { href: '/lodestone/freecompany/9229001536389012345/' } },
  'FREE_COMPANY.NAME': { html: 'Les Chocobos' },
  'GRAND_COMPANY': { html: 'Maelstrom / Second Storm Lieutenant' },
  'GUARDIAN_DEITY.NAME': { html: 'Althyk, the Keeper' },
  'NAME': { html: 'Anton Millien' },
  'NAMEDAY': { html: '1st Sun of the 1st Astral Moon' },
  'PORTRAIT': { attrs: { src: 'https://img/portrait.jpg' } },
  'RACE_CLAN_GENDER': { html: 'Hyur<br>Midlander / ♀' },
  'SERVER': { html: '<i class="xiv-lds"></i>Moogle [Chaos]' },
  'TITLE': { html: 'Warrior of Light' },
  'TOWN.NAME': { html: 'Limsa Lominsa' },
};

function gearFills(): Fill[] {
  const fills: Fill[] = [];
  for (const { path, leaf } of leaves(gearSelectors as Group)) {
    const [slot, field] = path;
    if (slot !== 'MAINHAND' && slot !== 'HEAD' && slot !== 'SOULCRYSTAL') continue;
    const value: Record<string, string> = {
      NAME: `Item ${slot}`,
      ITEM_LEVEL: 'Item Level 730',
      MIRAGE_NAME: slot === 'MAINHAND' ? 'Glamour Blade' : '',
      STAIN: slot === 'MAINHAND' ? 'Jet Black' : '',
      MATERIA_1: slot === 'MAINHAND' ? 'Savage Aim Materia XII<br/>Critical Hit +54' : '',
      MATERIA_2: slot === 'MAINHAND' ? 'Heavens&#39; Eye Materia XII<br/>Direct Hit Rate +54' : '',
      CREATOR_NAME: slot === 'HEAD' ? 'Crafty Crafter' : '',
    };
    if (value[field]) fills.push({ selector: leaf.selector, html: value[field] });
  }
  return fills;
}

describe('fiche personnage', () => {
  const fills: Fill[] = [];
  for (const { path, leaf } of leaves(characterSelectors as Group)) {
    const value = PROFILE_VALUES[path.join('.')];
    if (value) fills.push({ selector: leaf.selector, ...value });
  }
  const html = buildHtml([...fills, ...gearFills()]);

  it('lit le profil', () => {
    const profile = parseCharacterProfile(12345678, html);
    expect(profile).toMatchObject({
      id: 12345678,
      name: 'Anton Millien',
      title: 'Warrior of Light',
      world: 'Moogle',
      dataCenter: 'Chaos',
      avatar: 'https://img/avatar.jpg',
      portrait: 'https://img/portrait.jpg',
      race: 'Hyur',
      tribe: 'Midlander',
      gender: '♀',
      nameday: '1st Sun of the 1st Astral Moon',
      guardian: 'Althyk, the Keeper',
      cityState: 'Limsa Lominsa',
      grandCompany: { name: 'Maelstrom', rank: 'Second Storm Lieutenant' },
      freeCompany: { id: '9229001536389012345', name: 'Les Chocobos' },
      activeJobLevel: 100,
      bio: 'Bonjour & bienvenue',
    });
  });

  it("lit l'équipement", () => {
    const { gear } = parseCharacterProfile(1, html);
    expect(gear.map((g) => g.slot)).toEqual(['MAINHAND', 'HEAD', 'SOULCRYSTAL']);
    expect(gear[0]).toEqual({
      slot: 'MAINHAND',
      slotLabel: 'Arme',
      name: 'Item MAINHAND',
      itemLevel: 730,
      glamour: 'Glamour Blade',
      dye: 'Jet Black',
      materia: ['Savage Aim Materia XII', "Heavens' Eye Materia XII"],
      creator: null,
    });
    expect(gear[1]).toMatchObject({ slotLabel: 'Tête', itemLevel: 730, creator: 'Crafty Crafter', materia: [] });
  });

  it('refuse une page qui ne ressemble pas à une fiche', () => {
    expect(() => parseCharacterProfile(1, '<html><body>Maintenance</body></html>')).toThrow(/Lodestone/);
  });
});

describe('niveaux des jobs', () => {
  it('lit niveau et expérience, et marque les jobs non débloqués', () => {
    const fills: Fill[] = [];
    for (const { path, leaf } of leaves(classJobSelectors as Group)) {
      const [job, field] = path;
      if (job === 'PALADIN') {
        if (field === 'LEVEL') fills.push({ selector: leaf.selector, html: '90' });
        if (field === 'EXP') fills.push({ selector: leaf.selector, html: '1,234,567 / 2,000,000' });
      }
      if (job === 'PICTOMANCER' && field === 'LEVEL') fills.push({ selector: leaf.selector, html: '100' });
      if (job === 'FISHER' && field === 'LEVEL') fills.push({ selector: leaf.selector, html: '-' });
    }
    const jobs = parseClassJobs(buildHtml(fills));
    const byKey = Object.fromEntries(jobs.map((j) => [j.job.key, j]));
    expect(byKey.PALADIN).toMatchObject({ level: 90, exp: 1234567, maxExp: 2000000 });
    expect(byKey.PICTOMANCER).toMatchObject({ level: 100 });
    expect(byKey.FISHER.level).toBeNull();
    expect(byKey.MONK.level).toBeNull();
    expect(jobs).toHaveLength(34);
  });
});
