/**
 * Calculs de l'éditeur d'ATH, sans affichage : géométrie des éléments (comme le jeu les place) et réorganisation
 * des barres d'actions.
 */
import type { HotbarBar, HotbarJob, HotbarSlot, HotbarSlotChange, HudElement, HudElementChange, HudSnapshot } from '@/api/hud';

export type HudScreen = HudSnapshot['screen'];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tailles proposées par l'éditeur d'ATH du jeu. */
export const SCALES = [0.6, 0.8, 0.9, 1, 1.1, 1.2, 1.4, 1.6, 1.8, 2];

export const OPACITIES = [
  { value: 255, label: '100 %' },
  { value: 191, label: '75 %' },
  { value: 128, label: '50 %' },
  { value: 64, label: '25 %' },
];

export const SHAPES = [
  { value: 1, label: '12×1' },
  { value: 2, label: '6×2' },
  { value: 3, label: '4×3' },
  { value: 4, label: '3×4' },
  { value: 5, label: '2×6' },
  { value: 6, label: '1×12' },
];

const HOTBAR_SIZES: Record<number, [number, number]> = {
  1: [624, 72],
  2: [331, 121],
  3: [241, 170],
  4: [162, 260],
  5: [117, 358],
  6: [72, 618],
};

export const HOTBAR_COUNT = 10;
export const SLOTS_PER_BAR = 12;

/** Ce que l'appli peut régler sur un élément. */
export type ElementEdit = Partial<Pick<HudElement, 'x' | 'y' | 'scale' | 'visible' | 'opacity' | 'shape'>>;

/** Élément avec les réglages en cours (la forme d'une barre change aussi sa taille). */
export function withEdit(element: HudElement, edit: ElementEdit | undefined): HudElement {
  if (!edit) return element;
  const next = { ...element, ...edit };
  if (edit.shape && HOTBAR_SIZES[edit.shape]) [next.width, next.height] = HOTBAR_SIZES[edit.shape];
  return next;
}

/** Décalage du point d'ancrage depuis le coin haut gauche. */
function anchorOffset(anchor: number, w: number, h: number): { dx: number; dy: number } {
  const a = Math.min(8, Math.max(0, Math.round(anchor)));
  return { dx: ((a % 3) / 2) * w, dy: (Math.floor(a / 3) / 2) * h };
}

/** Rectangle de l'élément à l'écran du jeu, en pixels. */
export function elementRect(element: HudElement, screen: HudScreen): Rect {
  const k = element.scale * (screen.uiScale || 1);
  const w = Math.max(1, element.width * k);
  const h = Math.max(1, element.height * k);
  const { dx, dy } = anchorOffset(element.anchor, w, h);
  return { x: (element.x / 100) * screen.width - dx, y: (element.y / 100) * screen.height - dy, w, h };
}

/** Position (en % de l'écran, point d'ancrage) qui place le coin haut gauche de l'élément en (x, y) pixels. */
export function positionFor(element: HudElement, screen: HudScreen, x: number, y: number): { x: number; y: number } {
  const { w, h } = elementRect(element, screen);
  const { dx, dy } = anchorOffset(element.anchor, w, h);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return {
    x: round(Math.min(100, Math.max(0, ((x + dx) / screen.width) * 100))),
    y: round(Math.min(100, Math.max(0, ((y + dy) / screen.height) * 100))),
  };
}

/**
 * Aimante un rectangle aux bords et au centre de l'écran quand il en est à moins de `tolerance` pixels.
 * Rend aussi les repères à dessiner (x d'une ligne verticale, y d'une ligne horizontale).
 */
export function snap(rect: Rect, screen: HudScreen, tolerance: number): Rect & { guideX?: number; guideY?: number } {
  const pick = (start: number, size: number, total: number): { value: number; guide?: number } => {
    const targets = [
      { edge: start, to: 0, guide: 0 },
      { edge: start + size / 2, to: total / 2 - size / 2, guide: total / 2 },
      { edge: start + size, to: total - size, guide: total },
    ];
    const best = targets
      .map((t) => ({ ...t, distance: Math.abs(t.edge - t.guide) }))
      .filter((t) => t.distance <= tolerance)
      .sort((a, b) => a.distance - b.distance)[0];
    return best ? { value: best.to, guide: best.guide } : { value: start };
  };
  const x = pick(rect.x, rect.w, screen.width);
  const y = pick(rect.y, rect.h, screen.height);
  return { ...rect, x: x.value, y: y.value, guideX: x.guide, guideY: y.guide };
}

/** Garde au moins un morceau de l'élément à l'écran. */
export function clampRect(rect: Rect, screen: HudScreen): Rect {
  const margin = 8;
  return {
    ...rect,
    x: Math.min(screen.width - margin, Math.max(margin - rect.w, rect.x)),
    y: Math.min(screen.height - margin, Math.max(margin - rect.h, rect.y)),
  };
}

/** Élément sous le doigt : le plus petit qui contient le point (un élément posé sur un plus grand). */
export function hitTest(rects: { hash: number; rect: Rect }[], x: number, y: number, slop = 0): number | null {
  let found: number | null = null;
  let area = Infinity;
  for (const { hash, rect } of rects) {
    const inside = x >= rect.x - slop && x <= rect.x + rect.w + slop && y >= rect.y - slop && y <= rect.y + rect.h + slop;
    if (inside && rect.w * rect.h < area) {
      found = hash;
      area = rect.w * rect.h;
    }
  }
  return found;
}

/** Ce qui diffère vraiment de la disposition relevée, élément par élément. */
export function elementChanges(elements: HudElement[], edits: Record<number, ElementEdit>): HudElementChange[] {
  const changes: HudElementChange[] = [];
  for (const element of elements) {
    const edit = edits[element.hash];
    if (!edit) continue;
    const change: HudElementChange = { hash: element.hash };
    if (edit.x !== undefined && Math.abs(edit.x - element.x) > 0.001) change.x = edit.x;
    if (edit.y !== undefined && Math.abs(edit.y - element.y) > 0.001) change.y = edit.y;
    if (edit.scale !== undefined && Math.abs(edit.scale - element.scale) > 0.001) change.scale = edit.scale;
    if (edit.visible !== undefined && edit.visible !== element.visible) change.visible = edit.visible;
    if (edit.opacity !== undefined && edit.opacity !== element.opacity) change.opacity = edit.opacity;
    if (edit.shape !== undefined && edit.shape !== element.shape) change.shape = edit.shape;
    if (Object.keys(change).length > 1) changes.push(change);
  }
  return changes;
}

/** Réglages déjà envoyés (dans l'ordre), pour les montrer en attendant que le jeu les applique. */
export function mergeElementChanges(changes: HudElementChange[][]): Record<number, ElementEdit> {
  const merged: Record<number, ElementEdit> = {};
  for (const list of changes) {
    for (const { hash, ...edit } of list) merged[hash] = { ...merged[hash], ...edit };
  }
  return merged;
}

export function shapeLabel(shape: number | undefined): string | undefined {
  return SHAPES.find((s) => s.value === shape)?.label;
}

// ---- Barres d'actions ----

export type Slots = (HotbarSlot | null)[];

/** Barre modifiée : `owner` est le job sous lequel elle a été modifiée (celui qui l'enverra au jeu). */
export interface BarEdit {
  owner: number;
  slots: Slots;
}

export type HotbarEdits = Record<string, BarEdit>;

export interface SlotRef {
  bar: number;
  slot: number;
}

/** Une barre commune est la même pour tous les jobs : une seule clé. */
export function barKey(job: number, bar: Pick<HotbarBar, 'id' | 'shared'>): string {
  return bar.shared ? `commune:${bar.id}` : `${job}:${bar.id}`;
}

export function slotsOf(bar: HotbarBar | undefined): Slots {
  const slots: Slots = Array.from({ length: SLOTS_PER_BAR }, () => null);
  for (const s of bar?.slots ?? []) if (s.slot >= 0 && s.slot < SLOTS_PER_BAR) slots[s.slot] = s;
  return slots;
}

/** Les 10 barres d'un job, avec les modifications en cours. */
export function effectiveBars(job: HotbarJob, edits: HotbarEdits): { id: number; shared: boolean; key: string; slots: Slots }[] {
  return Array.from({ length: HOTBAR_COUNT }, (_, id) => {
    const bar = job.bars.find((b) => b.id === id) ?? { id, shared: false, slots: [] };
    const key = barKey(job.job, bar);
    return { id, shared: bar.shared, key, slots: edits[key]?.slots ?? slotsOf(bar) };
  });
}

/** Échange deux cases (ou déplace, si l'une est vide). */
export function swapSlots(job: HotbarJob, edits: HotbarEdits, a: SlotRef, b: SlotRef): HotbarEdits {
  if (a.bar === b.bar && a.slot === b.slot) return edits;
  const bars = effectiveBars(job, edits);
  const barA = bars[a.bar];
  const barB = bars[b.bar];
  const next = { ...edits };
  const slotsA = [...barA.slots];
  const slotsB = barA.key === barB.key ? slotsA : [...barB.slots];
  const moving = slotsA[a.slot];
  slotsA[a.slot] = slotsB[b.slot];
  slotsB[b.slot] = moving;
  next[barA.key] = { owner: job.job, slots: slotsA };
  next[barB.key] = { owner: job.job, slots: slotsB };
  return next;
}

export function clearSlot(job: HotbarJob, edits: HotbarEdits, at: SlotRef): HotbarEdits {
  const bar = effectiveBars(job, edits)[at.bar];
  const slots = [...bar.slots];
  slots[at.slot] = null;
  return { ...edits, [bar.key]: { owner: job.job, slots } };
}

/**
 * Changements à envoyer, regroupés par job, par rapport à `base` (le relevé, plus ce qui a déjà été envoyé).
 * Les barres revenues à cet état ne comptent pas.
 */
export function hotbarChanges(jobs: HotbarJob[], edits: HotbarEdits, base: HotbarEdits = {}): { job: number; slots: HotbarSlotChange[] }[] {
  const byJob = new Map<number, HotbarSlotChange[]>();
  for (const [key, edit] of Object.entries(edits)) {
    const barId = Number(key.split(':')[1]);
    const job = jobs.find((j) => j.job === edit.owner);
    const original = base[key]?.slots ?? slotsOf(job?.bars.find((b) => b.id === barId));
    edit.slots.forEach((slot, index) => {
      const before = original[index];
      if ((before?.type ?? 0) === (slot?.type ?? 0) && (before?.id ?? 0) === (slot?.id ?? 0)) return;
      const list = byJob.get(edit.owner) ?? [];
      list.push({ bar: barId, slot: index, type: slot?.type ?? 0, id: slot?.id ?? 0 });
      byJob.set(edit.owner, list);
    });
  }
  return [...byJob.entries()].map(([job, slots]) => ({ job, slots }));
}

export function countHotbarChanges(jobs: HotbarJob[], edits: HotbarEdits, base: HotbarEdits = {}): number {
  return hotbarChanges(jobs, edits, base).reduce((n, c) => n + c.slots.length, 0);
}

/** Barres telles qu'elles seront une fois appliqués les changements déjà envoyés (dans l'ordre). */
export function mergeHotbarChanges(jobs: HotbarJob[], changes: { job: number; slots: HotbarSlotChange[] }[]): HotbarEdits {
  let edits: HotbarEdits = {};
  for (const change of changes) {
    const job = jobs.find((j) => j.job === change.job);
    if (!job) continue;
    const known = new Map(job.bars.flatMap((b) => b.slots).map((s) => [`${s.type}:${s.id}`, s]));
    for (const c of change.slots) {
      const bar = effectiveBars(job, edits)[c.bar];
      if (!bar || c.slot < 0 || c.slot >= SLOTS_PER_BAR) continue;
      const slots = [...bar.slots];
      const found = known.get(`${c.type}:${c.id}`);
      slots[c.slot] = c.type === 0 || !found ? null : { ...found, slot: c.slot };
      edits = { ...edits, [bar.key]: { owner: job.job, slots } };
    }
  }
  return edits;
}
