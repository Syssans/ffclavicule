/**
 * Client du service Clavicule Sync (dossier server/) : modèles 3D des personnages,
 * envoyés automatiquement par le plugin Dalamud. Lecture publique, sans clé.
 */
import { request } from '@/api/http';
import { SYNC_URL } from '@/constants/service';

const SOURCE = 'Clavicule Sync';

export interface ModelInfo {
  characterId: number;
  name: string | null;
  world: string | null;
  appearanceHash: string | null;
  size: number;
  updatedAt: string;
}

export type ModelDownload =
  | { status: 'not-modified' }
  | { status: 'missing' }
  | { status: 'ok'; data: ArrayBuffer; etag: string | null };

/** Vrai si l'appli connaît l'adresse du service. */
export function isSyncAvailable(baseUrl: string = SYNC_URL): boolean {
  return baseUrl !== '';
}

/** Infos du modèle d'un personnage, ou null s'il n'en a pas (ou si le service n'est pas configuré). */
export async function getModelInfo(characterId: number, baseUrl: string = SYNC_URL): Promise<ModelInfo | null> {
  if (!isSyncAvailable(baseUrl)) return null;
  const response = await request(`${baseUrl}/v1/characters/${characterId}/model/info`, { source: SOURCE, allow: [404] });
  if (response.status === 404) return null;
  return (await response.json()) as ModelInfo;
}

/**
 * Télécharge le .glb. Avec `etag`, le service répond « pas modifié » si la copie locale est à jour.
 */
export async function downloadModel(characterId: number, etag?: string | null, baseUrl: string = SYNC_URL): Promise<ModelDownload> {
  if (!isSyncAvailable(baseUrl)) return { status: 'missing' };
  const response = await request(`${baseUrl}/v1/characters/${characterId}/model`, {
    source: SOURCE,
    headers: etag ? { 'If-None-Match': etag } : {},
    allow: [304, 404],
    timeoutMs: 60_000,
  });
  if (response.status === 304) return { status: 'not-modified' };
  if (response.status === 404) return { status: 'missing' };
  return { status: 'ok', data: await response.arrayBuffer(), etag: response.headers.get('ETag') };
}

/** Pour le diagnostic : le service répond-il ? */
export async function checkSync(baseUrl: string = SYNC_URL): Promise<boolean> {
  const response = await request(`${baseUrl}/health`, { source: SOURCE });
  return response.ok;
}
