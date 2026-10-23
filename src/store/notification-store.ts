/** Réglages des notifications, gardés sur le téléphone : rappels du jeu et alertes de prix. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_SETTINGS, type ReminderKey, type ReminderSetting } from '@/notifications/reminders';

export interface PriceAlert {
  id: string;
  itemId: number;
  itemName: string;
  icon: string | null;
  /** Monde, centre de données ou région (comme Universalis : « Moogle », « Chaos », « Europe »). */
  scope: string;
  /** below : prévenir quand le prix descend sous le seuil ; above : quand il dépasse le seuil. */
  condition: 'below' | 'above';
  price: number;
  hq: boolean;
  enabled: boolean;
  createdAt: string;
}

interface NotificationState {
  reminders: Record<ReminderKey, ReminderSetting>;
  oceanHours: number[];
  alerts: PriceAlert[];
  /** Secret de ce téléphone auprès du service (alertes de prix), donné à la première inscription. */
  pushSecret: string | null;

  setReminder: (key: ReminderKey, patch: Partial<ReminderSetting>) => void;
  setOceanHours: (hours: number[]) => void;
  saveAlert: (alert: PriceAlert) => void;
  removeAlert: (id: string) => void;
  setPushSecret: (secret: string | null) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      reminders: DEFAULT_SETTINGS.reminders,
      oceanHours: DEFAULT_SETTINGS.oceanHours,
      alerts: [],
      pushSecret: null,

      setReminder: (key, patch) => set((s) => ({ reminders: { ...s.reminders, [key]: { ...s.reminders[key], ...patch } } })),
      setOceanHours: (oceanHours) => set({ oceanHours: [...oceanHours].sort((a, b) => a - b) }),
      saveAlert: (alert) => set((s) => ({ alerts: [...s.alerts.filter((a) => a.id !== alert.id), alert] })),
      removeAlert: (id) => set((s) => ({ alerts: s.alerts.filter((a) => a.id !== id) })),
      setPushSecret: (pushSecret) => set({ pushSecret }),
    }),
    {
      name: 'clavicule-notifications',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // Nouveaux rappels ajoutés plus tard : ils prennent leur réglage par défaut.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NotificationState>;
        return { ...current, ...saved, reminders: { ...DEFAULT_SETTINGS.reminders, ...saved.reminders } };
      },
    },
  ),
);

/** Identifiant court et unique pour une alerte. */
export function newAlertId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
