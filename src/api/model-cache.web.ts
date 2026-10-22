/** Sur le web, le cache HTTP du navigateur suffit (le service renvoie un ETag). */
import { downloadModel } from '@/api/sync';
import type { SyncSettings } from '@/store/app-store';

export async function loadModel(settings: SyncSettings, characterId: number): Promise<ArrayBuffer | null> {
  const result = await downloadModel(settings, characterId);
  return result.status === 'ok' ? result.data : null;
}
