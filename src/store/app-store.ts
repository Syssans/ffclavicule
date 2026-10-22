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

/** Service de synchro des modèles 3D (Cloudflare), partagé par le groupe d'amis. */
export interface SyncSettings {
  /** Adresse du service, ex. « https://clavicule-sync.exemple.workers.dev ». Vide = désactivé. */
  url: string;
  /** Clé de lecture du groupe. */
  readKey: string;
}

interface AppState {
  region: LodestoneRegion;
  /** Monde ou centre de données utilisé pour les prix (ex. "Chaos", "Omega"). */
  marketScope: string;
  characters: SavedCharacter[];
  mainCharacterId: number | null;
  watchlist: WatchedItem[];
  sync: SyncSettings;

  setRegion: (region: LodestoneRegion) => void;
  setMarketScope: (scope: string) => void;
  saveCharacter: (character: SavedCharacter) => void;
  removeCharacter: (id: number) => void;
  setMainCharacter: (id: number) => void;
  toggleWatch: (item: WatchedItem) => void;
  setSync: (sync: SyncSettings) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      region: 'eu',
      marketScope: 'Chaos',
      characters: [],
      mainCharacterId: null,
      watchlist: [],
      sync: { url: '', readKey: '' },

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
      setSync: (sync) => set({ sync }),
    }),
    { name: 'ffclavicule', storage: createJSONStorage(() => AsyncStorage), version: 1 },
  ),
);
