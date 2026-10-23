/// <reference types="node" />
import { parseHtml, evaluate, extractPage, toInt, translateRegex, type Definition } from '../interpreter';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getGear, parseCharacterProfile, parseCharacterSearch, parseClassJobs, parseGearTooltip, parseLodestoneCollection } from '../client';
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
        expect(() => evaluate({ selector: leaf.selector }, doc)).not.toThrow();
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

  it('lit une page mal formée comme le ferait un navigateur', () => {
    // Balises non fermées et <div> dans un <p> : fréquent sur un vrai site.
    const html = `<!DOCTYPE html><html><head><title>Lodestone</title>
      <script>var t = "<div class='entry'>faux</div>";</script></head><body>
      <header><span class="unclosed"><p class="notice">Info <div>bloc</div>
      <div class="ldst__window">
        <div class="entry"><a class="entry__link" href="/lodestone/character/111/">
          <div class="entry__chara__face"><img src="https://img/a.jpg" alt=""></div>
          <div class="entry__box"><p class="entry__name">Six Clavicule</p>
          <p class="entry__world"><i class="xiv-lds js__tooltip" data-tooltip="Home World"></i>Moogle [Chaos]</p>
          <ul class="entry__chara_info"><li><i><img src="x.png"></i><span>100</span></li></ul></div></a></div>
        <div class="entry"><a class="entry__link" href="/lodestone/character/222/"><p class="entry__name">Six Autre</p></a></div>
      </div></body></html>`;
    const page = parseCharacterSearch(html);
    expect(page.results.map((r) => [r.id, r.name, r.world])).toEqual([
      [111, 'Six Clavicule', 'Moogle'],
      [222, 'Six Autre', null],
    ]);
    expect(page.results[0].avatar).toBe('https://img/a.jpg');
  });

  it('lit une entrée au format réel du Lodestone (octobre 2026)', () => {
    // Entrée réelle, nom et identifiant remplacés.
    const html = `<div class="ldst__window"><div class="entry"><a href="/lodestone/character/12345678/" class="entry__link"><div class="entry__chara__face"><img src="https://img2.finalfantasyxiv.com/f/a_fc0.jpg?1" alt="Alys Exemple"></div><div class="entry__box entry__box--world"><p class="entry__name">Alys Exemple</p><p class="entry__world"><i class="xiv-lds xiv-lds-home-world js__tooltip" data-tooltip="Home World"></i>Moogle [Chaos]</p><ul class="entry__chara_info"><li><i class="list__ic__class"><img src="https://lds-img.finalfantasyxiv.com/h/P/x.png" width="20" height="20" alt=""></i><span>94</span></li><li class="js__tooltip" data-tooltip="Maelstrom / Second Storm Lieutenant"><img src="https://lds-img.finalfantasyxiv.com/h/0/y.png" width="20" height="20" alt=""></li></ul></div><div class="entry__chara__lang">FR</div></a></div>
      <ul class="btn__pager">
        <li><a href="javascript:void(0);" class="icon-list__pager btn__pager__prev--all btn__pager__no"></a></li>
        <li><a href="javascript:void(0);" class="icon-list__pager btn__pager__prev btn__pager__no"></a></li>
        <li class="btn__pager__current">Page 1 of 1</li>
        <li><a href="javascript:void(0);" class="icon-list__pager btn__pager__next btn__pager__no"></a></li>
      </ul></div>`;
    expect(parseCharacterSearch(html)).toEqual({
      page: 1,
      totalPages: 1,
      results: [
        { id: 12345678, name: 'Alys Exemple', world: 'Moogle', dataCenter: 'Chaos', avatar: 'https://img2.finalfantasyxiv.com/f/a_fc0.jpg?1' },
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
      hq: false,
      icon: null,
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

describe('équipement chargé pièce par pièce', () => {
  const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

  it('lit une vraie fiche d’arme', () => {
    expect(parseGearTooltip('MAINHAND', 'Arme', fixture('tooltip-weapon.html'))).toEqual({
      slot: 'MAINHAND',
      slotLabel: 'Arme',
      name: 'Ceiba Staff',
      hq: true,
      icon: 'https://lds-img.finalfantasyxiv.com/itemicon/17/17eff5ea36e215b490af125356fa061b9b40ab3c.png?n7.57',
      itemLevel: 655,
      glamour: null,
      dye: null,
      materia: [],
      creator: null,
    });
  });

  it('lit une vraie fiche de cristal de l’âme (détail en 3e position)', () => {
    expect(parseGearTooltip('SOULCRYSTAL', "Cristal de l'âme", fixture('tooltip-soulcrystal.html'))).toMatchObject({
      name: 'Soul of the Black Mage',
    });
  });

  it('repère les pièces à charger dans la page et charge chacune', async () => {
    const page = buildHtml(
      leaves(characterSelectors as Group)
        .filter(({ path }) => path.join('.') === 'NAME')
        .map(({ leaf }) => ({ selector: leaf.selector, html: 'Alys Exemple' })),
    ).replace(
      '</body>',
      '<div class="icon-c--0 js__db_tooltip" data-lazy_load_url="/lodestone/character/1/equipment/tooltip/0"></div>' +
        '<div class="icon-c--13 js__db_tooltip" data-lazy_load_url="/lodestone/character/1/equipment/tooltip/13"></div></body>',
    );
    const profile = parseCharacterProfile(1, page);
    expect(profile.gear).toEqual([]);
    expect(profile.gearTooltips.sort((a, b) => a - b)).toEqual([0, 13]);

    const urls: string[] = [];
    globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return new Response(fixture(url.endsWith('/13') ? 'tooltip-soulcrystal.html' : 'tooltip-weapon.html'));
    }) as typeof fetch;
    const gear = await getGear('eu', profile);
    expect(urls.sort()).toEqual([
      'https://eu.finalfantasyxiv.com/lodestone/character/1/equipment/tooltip/0',
      'https://eu.finalfantasyxiv.com/lodestone/character/1/equipment/tooltip/13',
    ]);
    expect(gear.map((g) => [g.slot, g.name])).toEqual([
      ['MAINHAND', 'Ceiba Staff'],
      ['SOULCRYSTAL', 'Soul of the Black Mage'],
    ]);
  });

  it('ignore une présentation vide (« - »)', () => {
    const html = buildHtml(
      leaves(characterSelectors as Group)
        .filter(({ path }) => ['NAME', 'BIO'].includes(path.join('.')))
        .map(({ path, leaf }) => ({ selector: leaf.selector, html: path[0] === 'NAME' ? 'Alys' : '-' })),
    );
    expect(parseCharacterProfile(1, html).bio).toBeNull();
  });
});

describe('montures et mascottes', () => {
  // Même structure que la page servie à un navigateur de téléphone (octobre 2026).
  const item = (name: string, icon: string) =>
    `<li class="mount__list__item"data-tooltip_href="/x"><div class="mount__list__inner"><div class="mount__list__icon"><div class="mount__list__icon__inner "><img src="${icon}" width="32" height="32" alt="" class="mount__list__icon__image lazy_loading"></div></div><div class="mount__list__text"><span class="mount__name">${name}</span></div></div></li>`;
  const page = (items: string) =>
    `<html><body><div class="character__minions"><div class="select-pulldown__minion_mount"><p class="minion__sort__total com">Total: <span>2</span></p></div><ul class="mount__list">${items}</ul></div></body></html>`;

  it('lit les noms et les icônes', () => {
    const result = parseLodestoneCollection('mount', page(item('Company Chocobo', 'https://img/a.png') + item('Archon Throne &amp; Co', 'https://img/b.png')));
    expect(result.hidden).toBe(false);
    expect(result.total).toBe(2);
    expect(result.items).toEqual([
      { name: 'Company Chocobo', icon: 'https://img/a.png' },
      { name: 'Archon Throne & Co', icon: 'https://img/b.png' },
    ]);
  });

  it('reconnaît une page masquée par le joueur', () => {
    const result = parseLodestoneCollection('minion', '<html><body><p class="parts__zero">You do not have permission to view this page.</p></body></html>');
    expect(result).toEqual({ items: [], total: null, hidden: true });
  });
});
