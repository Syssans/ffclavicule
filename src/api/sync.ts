/**
 * Client du service Clavicule Sync (dossier server/) : modèles 3D des personnages,
 * envoyés automatiquement par le plugin Dalamud de chaque membre du groupe.
 */
import { ApiError, getJson, request } from '@/api/http';
import type { SyncSettings } from '@/store/app-store';

const SOURCE = 'Clavicule Sync';

const MESSAGES = {
  401: 'Clé de lecture refusée par le service de synchro. Vérifie-la dans les réglages.',
};

export interface ModelInfo {
  characterId: number;
  name: string | null;
  world: string | null;
  appearanceHash: string | null;
  uploadedBy: string | null;
  size: number;
  updatedAt: string;
}

export type ModelDownload =
  | { status: 'not-modified' }
  | { status: 'missing' }
  | { status: 'ok'; data: ArrayBuffer; etag: string | null };

/** « clavicule-sync.toto.workers.dev/ » -> « https://clavicule-sync.toto.workers.dev ». */
export function normalizeSyncUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function isSyncConfigured(settings: SyncSettings): boolean {
  return normalizeSyncUrl(settings.url) !== '' && settings.readKey.trim() !== '';
}

function base(settings: SyncSettings): string {
  const url = normalizeSyncUrl(settings.url);
  if (!url || !settings.readKey.trim()) {
    throw new ApiError('Synchro 3D non configurée.', SOURCE, undefined, 'Renseigne l’adresse et la clé dans Réglages.');
  }
  return url;
}

function auth(settings: SyncSettings, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${settings.readKey.trim()}`, ...extra };
}

/** Tous les personnages du groupe qui ont un modèle 3D. */
export async function listModels(settings: SyncSettings): Promise<ModelInfo[]> {
  const data = await getJson<{ characters: ModelInfo[] }>(`${base(settings)}/v1/characters`, {
    source: SOURCE,
    headers: auth(settings),
    messages: MESSAGES,
  });
  return [...data.characters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Infos du modèle d'un personnage, ou null s'il n'en a pas. */
export async function getModelInfo(settings: SyncSettings, characterId: number): Promise<ModelInfo | null> {
  const response = await request(`${base(settings)}/v1/characters/${characterId}/model/info`, {
    source: SOURCE,
    headers: auth(settings),
    allow: [404],
    messages: MESSAGES,
  });
  if (response.status === 404) return null;
  return (await response.json()) as ModelInfo;
}

/**
 * Télécharge le .glb. Avec `etag`, le service répond « pas modifié » si la copie locale est à jour.
 */
export async function downloadModel(settings: SyncSettings, characterId: number, etag?: string | null): Promise<ModelDownload> {
  const response = await request(`${base(settings)}/v1/characters/${characterId}/model`, {
    source: SOURCE,
    headers: auth(settings, etag ? { 'If-None-Match': etag } : {}),
    allow: [304, 404],
    messages: MESSAGES,
    timeoutMs: 60_000,
  });
  if (response.status === 304) return { status: 'not-modified' };
  if (response.status === 404) return { status: 'missing' };
  return { status: 'ok', data: await response.arrayBuffer(), etag: response.headers.get('ETag') };
}

/** Vérifie l'adresse et la clé ; renvoie le nombre de modèles disponibles. */
export async function testSync(settings: SyncSettings): Promise<number> {
  return (await listModels(settings)).length;
}
