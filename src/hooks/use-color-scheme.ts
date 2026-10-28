/** Thème affiché : celui choisi dans les réglages, ou celui du téléphone (ou du navigateur). */
import { useColorScheme as useSystemScheme } from 'react-native';

import { useAppStore } from '@/store/app-store';

export function useColorScheme(): 'light' | 'dark' {
  const system = useSystemScheme();
  const choice = useAppStore((s) => s.theme);
  if (choice !== 'system') return choice;
  return system === 'dark' ? 'dark' : 'light';
}
