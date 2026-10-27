/** Carte : calques affichés et dernière carte ouverte, gardés sur le téléphone. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_LAYERS, WORLD_MAP, type LayerKey } from '@/utils/map';

interface MapState {
  layers: LayerKey[];
  lastMap: number;
  toggleLayer: (layer: LayerKey) => void;
  setLastMap: (id: number) => void;
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      layers: DEFAULT_LAYERS,
      lastMap: WORLD_MAP,
      toggleLayer: (layer) =>
        set((s) => ({
          layers: s.layers.includes(layer) ? s.layers.filter((l) => l !== layer) : [...s.layers, layer],
        })),
      setLastMap: (id) => set({ lastMap: id }),
    }),
    {
      name: 'clavicule-carte',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
