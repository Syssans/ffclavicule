/**
 * Copie locale des modèles 3D (iOS, Android) : le .glb n'est retéléchargé
 * que lorsque le plugin en a envoyé une nouvelle version (ETag).
 */
import { Directory, File, Paths } from 'expo-file-system';

import { downloadModel } from '@/api/sync';

function folder(): Directory {
  const dir = new Directory(Paths.cache, 'models');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Le .glb du personnage (depuis le cache s'il est à jour), ou null s'il n'a pas de modèle. */
export async function loadModel(characterId: number): Promise<ArrayBuffer | null> {
  const dir = folder();
  const glb = new File(dir, `${characterId}.glb`);
  const tag = new File(dir, `${characterId}.etag`);
  const cachedTag = glb.exists && tag.exists ? tag.textSync() : null;

  let result;
  try {
    result = await downloadModel(characterId, cachedTag);
  } catch (error) {
    // Hors ligne : on montre la dernière version connue.
    if (glb.exists) return toArrayBuffer(await glb.bytes());
    throw error;
  }

  if (result.status === 'not-modified') return toArrayBuffer(await glb.bytes());
  if (result.status === 'missing') {
    if (glb.exists) glb.delete();
    if (tag.exists) tag.delete();
    return null;
  }
  glb.write(new Uint8Array(result.data));
  if (result.etag) tag.write(result.etag);
  else if (tag.exists) tag.delete();
  return result.data;
}
