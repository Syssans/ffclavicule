/** Données privées d'un personnage (plugin), partagées entre les écrans : un seul cache par personnage. */
import { useQuery } from '@tanstack/react-query';

import { getCatalog, getPrivate } from '@/api/private';
import { useAppStore } from '@/store/app-store';

export function usePrivate(id: number, enabled = true) {
  const link = useAppStore((s) => s.privateLinks[id]);
  const query = useQuery({
    queryKey: ['private', id, link?.token],
    queryFn: () => getPrivate(id, link!.token),
    enabled: Boolean(link) && Number.isFinite(id) && enabled,
    refetchInterval: 60_000,
  });
  return { link, query };
}

/** Catalogue des collections : ne change qu'avec le jeu, gardé une heure. */
export function useCatalog(id: number, enabled = true) {
  const link = useAppStore((s) => s.privateLinks[id]);
  return useQuery({
    queryKey: ['catalog', id, link?.token],
    queryFn: () => getCatalog(id, link!.token),
    enabled: Boolean(link) && Number.isFinite(id) && enabled,
    staleTime: 60 * 60 * 1000,
  });
}
