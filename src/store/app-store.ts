/** Etat de l'appli gardé sur le téléphone : réglages, personnages suivis, favoris du marché. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LodestoneRegion } from '@/lodestone/client';

export interface SavedCharacter {
  id: number;
  name: string;
  world: string | null;
  dataCenter: string | null;
  avatar: string | null;
}

export interface WatchedItem {
  id: number;
  name: string;
  icon: string | null;
}

interface AppState {
  region: LodestoneRegion;
  /** Monde ou centre de données utilisé pour les prix (ex. "Chaos", "Omega"). */
  marketScope: string;
  characters: SavedCharacter[];
  mainCharacterId: number | null;
  watchlist: WatchedItem[];
  /** Fond choisi dans la visionneuse 3D. */
  viewerBackground: string;

  setRegion: (region: LodestoneRegion) => void;
  setMarketScope: (scope: string) => void;
  saveCharacter: (character: SavedCharacter) => void;
  removeCharacter: (id: number) => void;
  setMainCharacter: (id: number) => void;
  toggleWatch: (item: WatchedItem) => void;
  setViewerBackground: (key: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      region: 'eu',
      marketScope: 'Chaos',
      characters: [],
      mainCharacterId: null,
      watchlist: [],
      viewerBackground: 'nuit',

      setRegion: (region) => set({ region }),
      setMarketScope: (marketScope) => set({ marketScope }),
      saveCharacter: (character) =>
        set((state) => {
          const others = state.characters.filter((c) => c.id !== character.id);
          return {
            characters: [...others, character],
            mainCharacterId: state.mainCharacterId ?? character.id,
          };
        }),
      removeCharacter: (id) =>
        set((state) => {
          const characters = state.characters.filter((c) => c.id !== id);
          const mainCharacterId = state.mainCharacterId === id ? (characters[0]?.id ?? null) : state.mainCharacterId;
          return { characters, mainCharacterId };
        }),
      setMainCharacter: (mainCharacterId) => set({ mainCharacterId }),
      toggleWatch: (item) =>
        set((state) =>
          state.watchlist.some((w) => w.id === item.id)
            ? { watchlist: state.watchlist.filter((w) => w.id !== item.id) }
            : { watchlist: [...state.watchlist, item] },
        ),
      setViewerBackground: (viewerBackground) => set({ viewerBackground }),
    }),
    {
      name: 'ffclavicule',
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      // v1 -> v2 : les réglages de synchro (adresse, clé) ont disparu, l'adresse est intégrée à l'appli.
      migrate: (persisted) => {
        const { sync: _removed, ...rest } = (persisted ?? {}) as Record<string, unknown>;
        return rest as unknown as AppState;
      },
    },
  ),
);
