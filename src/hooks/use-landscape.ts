/**
 * Plein écran en paysage (éditeurs d'ATH et de barres d'actions). L'appli reste en portrait ailleurs : on relâche le
 * verrou du portrait le temps du plein écran, et l'écran demande lui-même le paysage (option native de la pile), ce
 * qui fait tourner l'iPhone sans attendre qu'on le tourne à la main.
 */
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useLandscape(active: boolean) {
  useEffect(() => {
    if (!active || Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, [active]);
}

/** Options de l'écran : sans barre de titre et en paysage pendant le plein écran. */
export function landscapeOptions(active: boolean) {
  return {
    headerShown: !active,
    gestureEnabled: !active,
    orientation: active ? ('landscape' as const) : ('portrait_up' as const),
  };
}
