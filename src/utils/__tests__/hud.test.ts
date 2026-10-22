import type { HotbarJob, HudElement } from '@/api/hud';
import {
  clampRect,
  clearSlot,
  countHotbarChanges,
  effectiveBars,
  elementChanges,
  elementRect,
  hitTest,
  hotbarChanges,
  mergeElementChanges,
  mergeHotbarChanges,
  positionFor,
  snap,
  swapSlots,
  withEdit,
} from '@/utils/hud';

const screen = { width: 2000, height: 1000, uiScale: 1 };

const element = (over: Partial<HudElement> = {}): HudElement => ({
  hash: 1,
  addon: '_PartyList',
  name: 'Liste de l’équipe',
  group: 'main',
  x: 50,
  y: 50,
  scale: 1,
  width: 200,
  height: 100,
  anchor: 0,
  visible: true,
  opacity: 255,
  ...over,
});

describe('géométrie de l’ATH', () => {
  it('place l’élément selon son point d’ancrage', () => {
    expect(elementRect(element(), screen)).toEqual({ x: 1000, y: 500, w: 200, h: 100 });
    // Ancré au centre : le point (50 %, 50 %) est le milieu de l'élément.
    expect(elementRect(element({ anchor: 4 }), screen)).toEqual({ x: 900, y: 450, w: 200, h: 100 });
    // Ancré en bas à droite, taille 2 et interface à 1,5.
    expect(elementRect(element({ anchor: 8, scale: 2 }), { ...screen, uiScale: 1.5 })).toEqual({ x: 400, y: 200, w: 600, h: 300 });
  });

  it('retrouve la position du jeu depuis le coin déplacé', () => {
    const e = element({ anchor: 7, scale: 1.2 });
    const rect = elementRect(e, screen);
    expect(positionFor(e, screen, rect.x, rect.y)).toEqual({ x: 50, y: 50 });
    expect(positionFor(e, screen, rect.x + 20, rect.y - 10)).toEqual({ x: 51, y: 49 });
    expect(positionFor(e, screen, -5000, 0).x).toBe(0);
  });

  it('aimante au centre et aux bords, et garde l’élément à l’écran', () => {
    const centered = snap({ x: 893, y: 300, w: 200, h: 100 }, screen, 10);
    expect(centered).toMatchObject({ x: 900, y: 300, guideX: 1000 });
    expect(centered.guideY).toBeUndefined();
    expect(snap({ x: 4, y: 897, w: 200, h: 100 }, screen, 10)).toMatchObject({ x: 0, y: 900, guideX: 0, guideY: 1000 });
    expect(clampRect({ x: -500, y: 2000, w: 200, h: 100 }, screen)).toEqual({ x: -192, y: 992, w: 200, h: 100 });
  });

  it('choisit le plus petit élément sous le doigt', () => {
    const rects = [
      { hash: 1, rect: { x: 0, y: 0, w: 500, h: 500 } },
      { hash: 2, rect: { x: 100, y: 100, w: 50, h: 50 } },
    ];
    expect(hitTest(rects, 120, 120)).toBe(2);
    expect(hitTest(rects, 300, 300)).toBe(1);
    expect(hitTest(rects, 900, 900)).toBeNull();
    expect(hitTest(rects, 505, 10, 10)).toBe(1);
  });

  it('cumule les réglages envoyés', () => {
    expect(mergeElementChanges([[{ hash: 1, x: 10 }], [{ hash: 1, y: 20 }, { hash: 2, visible: false }]])).toEqual({
      1: { x: 10, y: 20 },
      2: { visible: false },
    });
  });

  it('la forme d’une barre change sa taille', () => {
    const bar = element({ hotbar: 0, shape: 1, width: 624, height: 72 });
    expect(withEdit(bar, { shape: 3 })).toMatchObject({ shape: 3, width: 241, height: 170 });
  });

  it('n’envoie que ce qui a vraiment changé', () => {
    const elements = [element(), element({ hash: 2 }), element({ hash: 3 })];
    const changes = elementChanges(elements, {
      1: { x: 60, y: 50, visible: true },
      2: { x: 50, y: 50 },
      3: { visible: false, scale: 1.4 },
    });
    expect(changes).toEqual([
      { hash: 1, x: 60 },
      { hash: 3, visible: false, scale: 1.4 },
    ]);
  });
});

describe('réorganisation des barres', () => {
  const warrior: HotbarJob = {
    job: 21,
    abbr: 'WAR',
    name: 'guerrier',
    bars: [
      { id: 0, shared: false, slots: [{ slot: 0, type: 1, id: 31, name: 'Fendoir lourd', icon: 260 }] },
      { id: 1, shared: true, slots: [{ slot: 5, type: 5, id: 9, name: 'Sprint', icon: 104 }] },
    ],
  };
  const paladin: HotbarJob = { ...warrior, job: 19, abbr: 'PLD', bars: [{ id: 0, shared: false, slots: [] }, warrior.bars[1]] };

  it('échange et déplace des cases, y compris vers une barre commune', () => {
    let edits = swapSlots(warrior, {}, { bar: 0, slot: 0 }, { bar: 0, slot: 3 });
    expect(effectiveBars(warrior, edits)[0].slots[3]?.name).toBe('Fendoir lourd');
    expect(effectiveBars(warrior, edits)[0].slots[0]).toBeNull();

    edits = swapSlots(warrior, edits, { bar: 1, slot: 5 }, { bar: 0, slot: 0 });
    expect(hotbarChanges([warrior, paladin], edits)).toEqual([
      {
        job: 21,
        slots: [
          { bar: 0, slot: 0, type: 5, id: 9 },
          { bar: 0, slot: 3, type: 1, id: 31 },
          { bar: 1, slot: 5, type: 0, id: 0 },
        ],
      },
    ]);
    // La barre commune est la même pour le paladin.
    expect(effectiveBars(paladin, edits)[1].slots[5]).toBeNull();
  });

  it('montre ce qui attend le jeu et n’envoie que la suite', () => {
    const base = mergeHotbarChanges([warrior], [{ job: 21, slots: [{ bar: 0, slot: 0, type: 0, id: 0 }, { bar: 0, slot: 4, type: 1, id: 31 }] }]);
    expect(effectiveBars(warrior, base)[0].slots[4]?.name).toBe('Fendoir lourd');
    expect(effectiveBars(warrior, base)[0].slots[0]).toBeNull();
    const edits = swapSlots(warrior, base, { bar: 0, slot: 4 }, { bar: 0, slot: 5 });
    expect(hotbarChanges([warrior], edits, base)).toEqual([
      { job: 21, slots: [{ bar: 0, slot: 4, type: 0, id: 0 }, { bar: 0, slot: 5, type: 1, id: 31 }] },
    ]);
  });

  it('un retour à l’état d’origine ne compte pas', () => {
    let edits = swapSlots(warrior, {}, { bar: 0, slot: 0 }, { bar: 0, slot: 1 });
    edits = swapSlots(warrior, edits, { bar: 0, slot: 1 }, { bar: 0, slot: 0 });
    expect(countHotbarChanges([warrior], edits)).toBe(0);
    expect(countHotbarChanges([warrior], clearSlot(warrior, {}, { bar: 0, slot: 0 }))).toBe(1);
  });
});
