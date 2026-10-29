/** « Aujourd'hui » : tâches suivies, cases cochées à la main et rappel avant les réinitialisations. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_TRACKED, TASK_BY_KEY } from '@/shared/today';

export interface TodayReminder {
  daily: boolean;
  weekly: boolean;
  /** Minutes d'avance sur la réinitialisation. */
  lead: number;
}

interface TodayState {
  tracked: string[];
  /** Tâche -> date où elle a été cochée (ms). */
  checked: Record<string, number>;
  reminder: TodayReminder;

  toggleTracked: (key: string) => void;
  /** Coche (maintenant) ou décoche une tâche. */
  setChecked: (key: string, done: boolean) => void;
  setReminder: (patch: Partial<TodayReminder>) => void;
}

export const useTodayStore = create<TodayState>()(
  persist(
    (set) => ({
      tracked: DEFAULT_TRACKED,
      checked: {},
      reminder: { daily: false, weekly: false, lead: 60 },

      toggleTracked: (key) =>
        set((s) => ({
          tracked: s.tracked.includes(key) ? s.tracked.filter((k) => k !== key) : [...s.tracked, key].filter((k) => TASK_BY_KEY.has(k)),
        })),
      setChecked: (key, done) =>
        set((s) => {
          // Au-delà d'une semaine, une case cochée ne compte plus pour aucune tâche : on l'oublie.
          const old = Date.now() - 8 * 86_400_000;
          const checked = Object.fromEntries(Object.entries(s.checked).filter(([, at]) => at > old));
          if (done) checked[key] = Date.now();
          else delete checked[key];
          return { checked };
        }),
      setReminder: (patch) => set((s) => ({ reminder: { ...s.reminder, ...patch } })),
    }),
    { name: 'clavicule-today', version: 1, storage: createJSONStorage(() => AsyncStorage) },
  ),
);
