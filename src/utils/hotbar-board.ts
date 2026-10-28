/**
 * Géométrie des barres d'actions reconstruites comme en jeu : forme de chaque barre (12×1 … 1×12), place de chaque
 * case, et case sous le doigt (pour toucher et glisser-déposer).
 *
 * Deux dispositions :
 * - en liste : les barres l'une sous l'autre, chacune dans sa forme du jeu, à la largeur de l'écran ;
 * - à l'écran : les barres à leur place dans l'ATH, cadrées sur la zone qu'elles occupent.
 */
import type { HudElement } from '@/api/hud';
import { elementRect, SLOTS_PER_BAR, type HudScreen, type SlotRef } from '@/utils/hud';

/** Colonnes et lignes de chaque forme du jeu (1 = 12×1 … 6 = 1×12). */
const GRID: Record<number, [number, number]> = { 1: [12, 1], 2: [6, 2], 3: [4, 3], 4: [3, 4], 5: [2, 6], 6: [1, 12] };

export function shapeGrid(shape: number | undefined): [number, number] {
  return GRID[shape ?? 1] ?? GRID[1];
}

/** Une barre posée : coin haut gauche de sa grille, taille d'une case et écart entre deux cases. */
export interface BarPlacement {
  bar: number;
  x: number;
  y: number;
  cols: number;
  rows: number;
  size: number;
  gap: number;
}

export interface BoardLayout {
  placements: BarPlacement[];
  height: number;
}

/** Case `index` d'une barre posée (les cases se remplissent ligne par ligne, comme en jeu). */
export function slotBox(p: BarPlacement, index: number): { x: number; y: number; size: number } {
  const col = index % p.cols;
  const row = Math.floor(index / p.cols);
  return { x: p.x + col * (p.size + p.gap), y: p.y + row * (p.size + p.gap), size: p.size };
}

export function barSize(p: BarPlacement): { w: number; h: number } {
  return { w: p.cols * p.size + (p.cols - 1) * p.gap, h: p.rows * p.size + (p.rows - 1) * p.gap };
}

export const LIST = {
  /** Hauteur de la ligne de titre au-dessus de chaque barre. */
  title: 22,
  /** Espace entre deux barres. */
  spacing: 14,
  /** Taille maximale d'une case. */
  maxSize: 52,
  gapRatio: 0.12,
};

/** Barres l'une sous l'autre, dans leur forme du jeu, à la largeur donnée. */
export function listLayout(bars: { id: number; shape?: number }[], width: number): BoardLayout {
  const placements: BarPlacement[] = [];
  let y = 0;
  for (const bar of bars) {
    const [cols, rows] = shapeGrid(bar.shape);
    // cols cases et cols-1 écarts tiennent dans la largeur.
    const size = Math.min(LIST.maxSize, Math.floor(width / (cols + (cols - 1) * LIST.gapRatio)));
    const gap = Math.max(2, Math.round(size * LIST.gapRatio));
    placements.push({ bar: bar.id, x: 0, y: y + LIST.title, cols, rows, size, gap });
    y += LIST.title + rows * size + (rows - 1) * gap + LIST.spacing;
  }
  return { placements, height: Math.max(0, y - LIST.spacing) };
}

/**
 * Barres à leur place dans l'ATH, cadrées sur la zone qu'elles occupent (avec une petite marge) et mises à
 * l'échelle pour tenir dans `width` × `maxHeight`.
 */
export function screenLayout(
  bars: { id: number; element: HudElement }[],
  screen: HudScreen,
  width: number,
  maxHeight: number,
): BoardLayout & { scale: number } {
  if (!bars.length || width <= 0) return { placements: [], height: 0, scale: 0 };
  const rects = bars.map((b) => ({ id: b.id, shape: b.element.shape, rect: elementRect(b.element, screen) }));
  const margin = 12;
  const x0 = Math.min(...rects.map((r) => r.rect.x)) - margin;
  const y0 = Math.min(...rects.map((r) => r.rect.y)) - margin;
  const x1 = Math.max(...rects.map((r) => r.rect.x + r.rect.w)) + margin;
  const y1 = Math.max(...rects.map((r) => r.rect.y + r.rect.h)) + margin;
  const scale = Math.min(width / (x1 - x0), maxHeight / (y1 - y0));
  const placements = rects.map(({ id, shape, rect }) => {
    const [cols, rows] = shapeGrid(shape);
    // Pas d'une case dans le jeu : la barre divisée par son nombre de colonnes ; l'icône en occupe l'essentiel.
    const pitch = Math.min((rect.w * scale) / cols, (rect.h * scale) / rows);
    const gap = Math.max(1, pitch * LIST.gapRatio);
    const size = pitch - gap;
    const gridW = cols * size + (cols - 1) * gap;
    const gridH = rows * size + (rows - 1) * gap;
    return {
      bar: id,
      x: (rect.x - x0) * scale + (rect.w * scale - gridW) / 2,
      y: (rect.y - y0) * scale + (rect.h * scale - gridH) / 2,
      cols,
      rows,
      size,
      gap,
    };
  });
  return { placements, height: (y1 - y0) * scale, scale };
}

/** Case sous le point (x, y), en comptant la moitié de l'écart autour de chaque case. */
export function slotAt(placements: readonly BarPlacement[], x: number, y: number): SlotRef | null {
  for (const p of placements) {
    const { w, h } = barSize(p);
    const half = p.gap / 2;
    if (x < p.x - half || x > p.x + w + half || y < p.y - half || y > p.y + h + half) continue;
    const pitch = p.size + p.gap;
    const col = Math.min(p.cols - 1, Math.max(0, Math.floor((x - p.x + half) / pitch)));
    const row = Math.min(p.rows - 1, Math.max(0, Math.floor((y - p.y + half) / pitch)));
    const slot = row * p.cols + col;
    if (slot < SLOTS_PER_BAR) return { bar: p.bar, slot };
  }
  return null;
}
