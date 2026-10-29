/** Chasse du personnage principal : contrats en main (plugin) et morts des marques A/S (notées ou vues par le plugin). */
import { useMemo } from 'react';

import { useMainCharacter } from '@/components/home';
import { usePrivate } from '@/hooks/use-private';
import { mergeKills, useHuntStore, type HuntKill } from '@/store/hunt-store';

export function useHunt(now: number) {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  const manual = useHuntStore((s) => s.kills);
  const chosenWorld = useHuntStore((s) => s.world);
  const hunt = query.data?.duties?.hunt ?? null;
  const minute = Math.floor(now / 60_000);
  const kills = useMemo<HuntKill[]>(() => {
    const seen: HuntKill[] = (hunt?.kills ?? []).map((k) => ({ ...k, at: k.at * 1000, source: 'plugin' }));
    return mergeKills(manual, seen, minute * 60_000).sort((a, b) => b.at - a.at);
  }, [manual, hunt, minute]);
  return {
    main,
    linked: Boolean(link),
    /** Le plugin est connecté mais n'envoie pas encore la chasse (version plus ancienne). */
    pluginOutdated: Boolean(link) && Boolean(query.data?.duties) && !hunt,
    bills: hunt?.bills ?? [],
    kills,
    /** Monde où noter une mort. */
    world: chosenWorld ?? query.data?.world ?? main?.world ?? '',
  };
}
