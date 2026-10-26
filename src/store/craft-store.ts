/** Liste d'artisanat gardée sur le téléphone : les recettes à fabriquer et leurs quantités. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface CraftListEntry {
  recipeId: number;
  itemId: number;
  name: string;
  icon: string | null;
  /** Nombre d'objets voulus. */
  quantity: number;
}

interface CraftState {
  list: CraftListEntry[];
  /** Ajoute la quantité (ou crée l'entrée). */
  addToList: (entry: CraftListEntry) => void;
  setQuantity: (recipeId: number, quantity: number) => void;
  removeFromList: (recipeId: number) => void;
  clearList: () => void;
}

export const useCraftStore = create<CraftState>()(
  persist(
    (set) => ({
      list: [],
      addToList: (entry) =>
        set((s) => {
          const existing = s.list.find((e) => e.recipeId === entry.recipeId);
          if (!existing) return { list: [...s.list, entry] };
          return { list: s.list.map((e) => (e.recipeId === entry.recipeId ? { ...e, quantity: e.quantity + entry.quantity } : e)) };
        }),
      setQuantity: (recipeId, quantity) =>
        set((s) => ({ list: s.list.map((e) => (e.recipeId === recipeId ? { ...e, quantity: Math.max(1, Math.min(9999, quantity)) } : e)) })),
      removeFromList: (recipeId) => set((s) => ({ list: s.list.filter((e) => e.recipeId !== recipeId) })),
      clearList: () => set({ list: [] }),
    }),
    { name: 'clavicule-artisanat', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
