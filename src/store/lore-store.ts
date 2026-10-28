/** Légende : où en est le joueur dans l'histoire (pour cacher les spoilers) et les fiches déjà découvertes. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { LAST_EXPANSION } from '@/utils/lore';

interface LoreState {
  /** Dernière extension vécue (0 A Realm Reborn … 5 Dawntrail) : ce qui vient après est voilé. */
  progress: number;
  /** Fiches ouvertes au moins une fois. */
  visited: string[];
  setProgress: (progress: number) => void;
  visit: (key: string) => void;
}

export const useLoreStore = create<LoreState>()(
  persist(
    (set) => ({
      progress: LAST_EXPANSION,
      visited: [],
      setProgress: (progress) => set({ progress }),
      visit: (key) => set((s) => (s.visited.includes(key) ? s : { visited: [...s.visited, key] })),
    }),
    {
      name: 'clavicule-legende',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
