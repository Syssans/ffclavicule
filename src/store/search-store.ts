/** Recherche : les dernières recherches, gardées sur le téléphone. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { searchKey } from '@/utils/search';

const MAX_RECENT = 8;

interface SearchState {
  recent: string[];
  remember: (query: string) => void;
  forget: (query: string) => void;
  clear: () => void;
}

export const useSearchStore = create<SearchState>()(
  persist(
    (set) => ({
      recent: [],
      // La plus récente en tête ; « Épée » et « epee » ne comptent qu'une fois.
      remember: (query) =>
        set((s) => {
          const text = query.trim();
          if (searchKey(text).length < 2) return s;
          return { recent: [text, ...s.recent.filter((r) => searchKey(r) !== searchKey(text))].slice(0, MAX_RECENT) };
        }),
      forget: (query) => set((s) => ({ recent: s.recent.filter((r) => r !== query) })),
      clear: () => set({ recent: [] }),
    }),
    {
      name: 'clavicule-recherche',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
