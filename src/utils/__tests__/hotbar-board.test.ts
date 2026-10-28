import type { HudElement } from '@/api/hud';
import { barSize, listLayout, screenLayout, shapeGrid, slotAt, slotBox } from '@/utils/hotbar-board';

const bar = (hotbar: number, x: number, y: number, shape: number, width: number, height: number): HudElement => ({
  hash: hotbar,
  addon: `_ActionBar0${hotbar}`,
  name: `Barre ${hotbar + 1}`,
  group: 'hotbar',
  hotbar,
  x,
  y,
  scale: 1,
  width,
  height,
  anchor: 0,
  visible: true,
  opacity: 255,
  shape,
});

describe('barres reconstruites', () => {
  it('connaît les formes du jeu', () => {
    expect(shapeGrid(1)).toEqual([12, 1]);
    expect(shapeGrid(2)).toEqual([6, 2]);
    expect(shapeGrid(6)).toEqual([1, 12]);
    expect(shapeGrid(undefined)).toEqual([12, 1]);
  });

  it('empile les barres dans leur forme, à la largeur de l’écran', () => {
    const { placements, height } = listLayout(
      [
        { id: 0, shape: 1 },
        { id: 1, shape: 2 },
      ],
      360,
    );
    expect(placements[0].cols).toBe(12);
    expect(barSize(placements[0]).w).toBeLessThanOrEqual(360);
    expect(placements[1].rows).toBe(2);
    expect(placements[1].y).toBeGreaterThan(placements[0].y + barSize(placements[0]).h);
    expect(height).toBeGreaterThan(placements[1].y);
  });

  it('remplit les cases ligne par ligne et retrouve la case sous le doigt', () => {
    const { placements } = listLayout([{ id: 3, shape: 2 }], 360);
    const p = placements[0];
    const seventh = slotBox(p, 6);
    expect(seventh.x).toBe(p.x);
    expect(seventh.y).toBeGreaterThan(p.y);
    expect(slotAt(placements, seventh.x + 2, seventh.y + 2)).toEqual({ bar: 3, slot: 6 });
    expect(slotAt(placements, p.x + barSize(p).w + 40, p.y)).toBeNull();
  });

  it('place les barres comme dans l’ATH, cadrées sur leur zone', () => {
    const screen = { width: 1920, height: 1080, uiScale: 1 };
    const { placements, height, scale } = screenLayout(
      [
        { id: 0, element: bar(0, 30, 80, 1, 624, 72) },
        { id: 1, element: bar(1, 30, 87, 1, 624, 72) },
      ],
      screen,
      600,
      400,
    );
    expect(scale).toBeGreaterThan(0.5);
    expect(placements[1].y).toBeGreaterThan(placements[0].y);
    expect(Math.abs(placements[0].x - placements[1].x)).toBeLessThan(1);
    expect(height).toBeLessThanOrEqual(400);
    const first = slotBox(placements[0], 0);
    expect(slotAt(placements, first.x + 1, first.y + 1)).toEqual({ bar: 0, slot: 0 });
  });
});
