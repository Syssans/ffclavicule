/**
 * ATH du jeu (dispositions et barres d'actions), relevé par le plugin Dalamud et modifiable depuis l'appli.
 * Les modifications passent par une file sur le service : le plugin les applique quand le jeu tourne, sinon à la
 * connexion suivante. Accès réservé aux téléphones associés (même jeton que les données privées).
 */
import { ApiError, request } from '@/api/http';
import { SYNC_URL } from '@/constants/service';

const SOURCE = 'Clavicule Sync';
const NOT_PAIRED = 'Ce téléphone n’est plus connecté à ce personnage. Reconnecte-le avec un nouveau code.';

export type HudGroup = 'main' | 'hotbar' | 'gauge' | 'content' | 'pvp';

/** Rectangle affiché par le jeu à l'instant du relevé, en pixels (disposition active seulement). */
export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
  shown: boolean;
}

/**
 * Élément d'une disposition. x et y : point d'ancrage en pourcentage de l'écran. anchor : 0 (haut gauche) à 8
 * (bas droit), ligne par ligne. width et height : taille à l'échelle 1, avant `scale` et l'échelle de l'interface.
 */
export interface HudElement {
  hash: number;
  addon: string;
  name: string;
  group: HudGroup;
  job?: string;
  hotbar?: number;
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
  anchor: number;
  visible: boolean;
  /** 1 à 255. */
  opacity: number;
  /** Forme d'une barre d'actions : 1 = 12×1 … 6 = 1×12. */
  shape?: number;
  live?: HudRect;
}

export interface HudLayout {
  index: number;
  name: string;
  elements: HudElement[];
}

export interface HotbarSlot {
  slot: number;
  type: number;
  id: number;
  name: string;
  icon: number;
}

export interface HotbarBar {
  id: number;
  shared: boolean;
  slots: HotbarSlot[];
}

export interface HotbarJob {
  job: number;
  abbr: string;
  name: string;
  bars: HotbarBar[];
}

export interface HudSnapshot {
  schema: number;
  updatedAt: string;
  screen: { width: number; height: number; uiScale: number };
  currentLayout: number;
  layouts: HudLayout[];
  hotbars?: { currentJob: number; jobs: HotbarJob[] };
}

export interface HudElementChange {
  hash: number;
  x?: number;
  y?: number;
  scale?: number;
  visible?: boolean;
  opacity?: number;
  shape?: number;
}

export interface HotbarSlotChange {
  bar: number;
  slot: number;
  /** 0 : case vidée. */
  type: number;
  id: number;
}

export type HudChangeBody =
  | { kind: 'layout'; layout: number; elements: HudElementChange[] }
  | { kind: 'activate'; layout: number }
  | { kind: 'hotbars'; job: number; slots: HotbarSlotChange[] };

export type HudChangeStatus = 'pending' | 'applied' | 'partial' | 'failed' | 'cancelled';

export interface QueuedChange {
  id: string;
  kind: HudChangeBody['kind'];
  createdAt: string;
  device: string;
  status: HudChangeStatus;
  message?: string;
  doneAt?: string;
  change: HudChangeBody;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Relevé de l'ATH ; null si le plugin ne l'a pas encore envoyé. */
export async function getHud(characterId: number, token: string, baseUrl: string = SYNC_URL): Promise<HudSnapshot | null> {
  const response = await request(`${baseUrl}/v1/characters/${characterId}/hud`, {
    source: SOURCE,
    headers: auth(token),
    allow: [404],
    messages: { 401: NOT_PAIRED },
  });
  if (response.status === 404) return null;
  return (await response.json()) as HudSnapshot;
}

export async function listChanges(characterId: number, token: string, baseUrl: string = SYNC_URL): Promise<QueuedChange[]> {
  const response = await request(`${baseUrl}/v1/characters/${characterId}/hud/changes`, {
    source: SOURCE,
    headers: auth(token),
    messages: { 401: NOT_PAIRED },
  });
  return ((await response.json()) as { changes: QueuedChange[] }).changes;
}

/** Dépose une modification ; le plugin l'appliquera dès que possible. */
export async function sendChange(characterId: number, token: string, change: HudChangeBody, baseUrl: string = SYNC_URL): Promise<QueuedChange> {
  const response = await request(`${baseUrl}/v1/characters/${characterId}/hud/changes`, {
    source: SOURCE,
    method: 'POST',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
    allow: [429],
    messages: { 401: NOT_PAIRED },
  });
  const body = (await response.json()) as QueuedChange & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? 'Modification refusée.', SOURCE, response.status);
  return body;
}

export async function cancelChange(characterId: number, token: string, changeId: string, baseUrl: string = SYNC_URL): Promise<void> {
  await request(`${baseUrl}/v1/characters/${characterId}/hud/changes/${encodeURIComponent(changeId)}`, {
    source: SOURCE,
    method: 'DELETE',
    headers: auth(token),
    messages: { 401: NOT_PAIRED, 409: 'Trop tard : le jeu a déjà appliqué cette modification.' },
  });
}

export const STATUS_LABELS: Record<HudChangeStatus, string> = {
  pending: 'En attente du jeu',
  applied: 'Appliquée',
  partial: 'Appliquée en partie',
  failed: 'Refusée',
  cancelled: 'Annulée',
};
