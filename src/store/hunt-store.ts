/** Chasse : marques A et S tuées (notées à la main ou vues par le plugin) et rappel à l'ouverture de leur fenêtre. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FORGET_KILLS_AFTER, killKey, type HuntKill } from '@/utils/hunt';

export { killKey, mergeKills, type HuntKill } from '@/utils/hunt';

interface HuntState {
  kills: Record<string, HuntKill>;
  /** Prévenir quand une fenêtre s'ouvre. */
  notify: boolean;
  /** Monde choisi pour noter une mort (sinon celui du personnage principal). */
  world: string | null;

  recordKill: (kill: HuntKill) => void;
  removeKill: (key: string) => void;
  setNotify: (on: boolean) => void;
  setWorld: (world: string | null) => void;
}

export const useHuntStore = create<HuntState>()(
  persist(
    (set) => ({
      kills: {},
      notify: true,
      world: null,

      recordKill: (kill) =>
        set((s) => {
          const old = Date.now() - FORGET_KILLS_AFTER;
          const kills = Object.fromEntries(Object.entries(s.kills).filter(([, k]) => k.at > old));
          const key = killKey(kill);
          if (!kills[key] || kills[key].at < kill.at) kills[key] = kill;
          return { kills };
        }),
      removeKill: (key) =>
        set((s) => {
          const kills = { ...s.kills };
          delete kills[key];
          return { kills };
        }),
      setNotify: (notify) => set({ notify }),
      setWorld: (world) => set({ world }),
    }),
    { name: 'clavicule-hunt', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
