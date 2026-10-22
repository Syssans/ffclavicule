/** Teste l'accès à chaque source de données et décrit le résultat en clair. */
import { Platform } from 'react-native';

import { probeLodestone, type LodestoneRegion } from '@/lodestone/client';

import { ApiError, getJson } from './http';
import { getDataCenters } from './universalis';
import { searchItems } from './xivapi';

export interface ProbeResult {
  source: string;
  ok: boolean;
  summary: string;
  detail: string | null;
  ms: number;
}

async function probe(source: string, run: () => Promise<{ ok: boolean; summary: string; detail?: string }>): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const { ok, summary, detail } = await run();
    return { source, ok, summary, detail: detail ?? null, ms: Date.now() - start };
  } catch (error) {
    return {
      source,
      ok: false,
      summary: error instanceof Error ? error.message : String(error),
      detail: error instanceof ApiError ? (error.detail ?? null) : error instanceof Error ? error.name : null,
      ms: Date.now() - start,
    };
  }
}

export function runDiagnostics(region: LodestoneRegion): Promise<ProbeResult[]> {
  return Promise.all([
    probe('Lodestone', async () => {
      const p = await probeLodestone(region);
      if (!p.recognized) {
        return {
          ok: false,
          summary: 'Page reçue mais pas reconnue : ce n’est pas la version du Lodestone que l’appli sait lire.',
          detail: `${p.bytes} caractères, titre : ${p.title ?? 'aucun'}`,
        };
      }
      return { ok: true, summary: `Page lue, ${p.results} personnages trouvés pour « Warrior ».` };
    }),
    probe('XIVAPI', async () => {
      const items = await searchItems('fer', { limit: 5 });
      return { ok: items.length > 0, summary: `${items.length} objets trouvés pour « fer ».` };
    }),
    probe('Universalis', async () => {
      const dcs = await getDataCenters();
      return { ok: dcs.length > 0, summary: `${dcs.length} centres de données.` };
    }),
    probe('FFXIV Collect', async () => {
      const mount = await getJson<{ name?: string }>('https://ffxivcollect.com/api/mounts/1', { source: 'FFXIV Collect' });
      return { ok: Boolean(mount.name), summary: `Monture n° 1 : ${mount.name ?? 'illisible'}.` };
    }),
  ]);
}

/** Dans un navigateur, le Lodestone refuse les requêtes venant d'un autre site. */
export const RUNNING_IN_BROWSER = Platform.OS === 'web';
