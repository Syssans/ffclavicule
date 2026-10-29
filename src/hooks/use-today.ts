/** « Aujourd'hui » pour le personnage principal : état de chaque tâche suivie, d'après le plugin et les cases cochées. */
import { useMemo } from 'react';

import { useMainCharacter } from '@/components/home';
import { usePrivate } from '@/hooks/use-private';
import { nextReset, SECTION_RESET, trackedStates, type TaskState, type TodaySection } from '@/shared/today';
import { useAppStore } from '@/store/app-store';
import { useTodayStore } from '@/store/today-store';

export interface TodaySummary {
  section: TodaySection;
  states: TaskState[];
  done: number;
  total: number;
  resetAt: number;
}

export function useToday(now: number) {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  const tracked = useTodayStore((s) => s.tracked);
  const checked = useTodayStore((s) => s.checked);
  const region = useAppStore((s) => s.region);
  const progress = query.data?.duties ?? null;
  // Recalculé chaque minute : assez pour les comptes à rebours, sans tout refaire à chaque seconde.
  const minute = Math.floor(now / 60_000);
  const sections = useMemo(() => {
    const at = minute * 60_000;
    const states = trackedStates(tracked, progress, checked, at, region);
    return (['daily', 'weekly'] as const).map((section): TodaySummary => {
      const list = states.filter((s) => s.task.section === section);
      return { section, states: list, done: list.filter((s) => s.done).length, total: list.length, resetAt: nextReset(SECTION_RESET[section], at) };
    });
  }, [tracked, progress, checked, region, minute]);
  return {
    main,
    linked: Boolean(link),
    link,
    progress,
    /** Le plugin est connecté mais n'envoie pas encore les tâches (version plus ancienne). */
    pluginOutdated: Boolean(link) && Boolean(query.data) && !progress,
    daily: sections[0],
    weekly: sections[1],
  };
}
