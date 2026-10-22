/** Sur le web, le cache HTTP du navigateur suffit (le service renvoie un ETag). */
import { downloadModel } from '@/api/sync';

export async function loadModel(characterId: number): Promise<ArrayBuffer | null> {
  const result = await downloadModel(characterId);
  return result.status === 'ok' ? result.data : null;
}
