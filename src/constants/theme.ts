/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#1B1A17',
    background: '#F6F3EC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECE6D8',
    textSecondary: '#6B665C',
    accent: '#8A6A1F',
    accentText: '#FFFFFF',
    danger: '#C62828',
    success: '#2E7D32',
    border: '#E4DDCC',
    /** Tracé des graphiques (validé : contraste, saturation, luminosité). */
    chart: '#B07A00',
    /** Grille et axes : un cran au-dessus de la surface. */
    grid: '#ECE6D8',
    /** Liseré doré des cadres, comme les fenêtres du jeu. */
    frame: '#DCCB9F',
    /** Ornements (titres de section, séparateurs). */
    ornament: '#A8853A',
  },
  dark: {
    text: '#F2EFE8',
    background: '#0B0F1A',
    backgroundElement: '#151B2B',
    backgroundSelected: '#222A40',
    textSecondary: '#A3A9BA',
    accent: '#D9B36C',
    accentText: '#1A1405',
    danger: '#EF9A9A',
    success: '#A5D6A7',
    border: '#263049',
    chart: '#C98500',
    grid: '#222A40',
    frame: 'rgba(217,179,108,0.28)',
    ornament: '#B8955A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/** Police des titres, proche de celle du logo du jeu (Cinzel, licence OFL), chargée au démarrage. */
export const DisplayFont = {
  regular: 'Cinzel_600SemiBold',
  bold: 'Cinzel_700Bold',
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
