/** Montures et mascottes lues sur le Lodestone : ce qu'on peut montrer sans le plugin. */
import { useQuery } from '@tanstack/react-query';

import { getLodestoneCollection, type LodestoneCollectionKind } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { matchLodestone, referenceTotal, type LodestoneEntry } from '@/utils/collect-reference';

export const LODESTONE_COLLECTIONS: { kind: LodestoneCollectionKind; key: 'mounts' | 'minions'; label: string }[] = [
  { kind: 'mount', key: 'mounts', label: 'Montures' },
  { kind: 'minion', key: 'minions', label: 'Mascottes' },
];

export interface LodestoneCollectionView {
  entries: LodestoneEntry[];
  /** Nombre possédé : la liste, ou à défaut le total affiché par le Lodestone. */
  owned: number;
  /** Nombre d'éléments de la collection dans le jeu. */
  total: number;
  hidden: boolean;
}

export function useLodestoneCollection(id: number, kind: LodestoneCollectionKind, enabled = true) {
  const region = useAppStore((s) => s.region);
  const key = kind === 'mount' ? 'mounts' : 'minions';
  return useQuery({
    queryKey: ['lodestone', kind, region, id],
    queryFn: async (): Promise<LodestoneCollectionView> => {
      const page = await getLodestoneCollection(region, id, kind);
      return {
        entries: matchLodestone(key, page.items),
        owned: page.items.length || (page.total ?? 0),
        total: referenceTotal(key),
        hidden: page.hidden,
      };
    },
    enabled: Number.isFinite(id) && enabled,
    staleTime: 30 * 60_000,
  });
}
