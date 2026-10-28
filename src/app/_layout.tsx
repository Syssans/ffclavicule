import { Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Appearance, Platform, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { UpdateBanner } from '@/components/app-updates';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { NotificationsBridge } from '@/components/notifications-bridge';
import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();
// L'appli reste en portrait ; seul l'éditeur d'ATH plein écran passe en paysage.
if (Platform.OS !== 'web') ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
      }),
  );
  const hydrated = useStoreHydrated();
  // Thème choisi dans les réglages : il s'impose à toute l'appli (barres natives comprises), ou suit le téléphone.
  const themeChoice = useAppStore((s) => s.theme);
  useEffect(() => {
    // Sur le téléphone, les barres natives suivent aussi ; le web n'a pas cette fonction (le thème y passe par
    // useColorScheme de l'appli).
    if (Platform.OS !== 'web' && typeof Appearance.setColorScheme === 'function') {
      Appearance.setColorScheme(themeChoice === 'system' ? 'unspecified' : themeChoice);
    }
  }, [themeChoice]);
  // Police des titres ; en cas d'échec de chargement, l'appli démarre avec la police du système.
  const [fontsLoaded, fontError] = useFonts({ Cinzel_600SemiBold, Cinzel_700Bold });
  const ready = hydrated && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <NotificationsBridge />
          <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="character/search" options={{ title: 'Ajouter un personnage', presentation: 'modal' }} />
            <Stack.Screen name="character/[id]/index" options={{ title: '' }} />
            <Stack.Screen name="character/[id]/[section]" options={{ title: '' }} />
            <Stack.Screen name="settings" options={{ title: 'Réglages' }} />
            <Stack.Screen name="notifications/index" options={{ title: 'Notifications' }} />
            <Stack.Screen name="alert" options={{ title: 'Alerte de prix', presentation: 'modal' }} />
            <Stack.Screen name="item/[id]" options={{ title: '' }} />
            <Stack.Screen name="crafting/index" options={{ title: 'Artisanat' }} />
            <Stack.Screen name="fishing/index" options={{ title: 'Pêche' }} />
            <Stack.Screen name="gathering/index" options={{ title: 'Récolte' }} />
            <Stack.Screen name="map/index" options={{ title: 'Carte' }} />
            <Stack.Screen name="map/browse" options={{ title: 'Atlas' }} />
            <Stack.Screen name="lore/index" options={{ title: 'Légende' }} />
            <Stack.Screen name="lore/[type]" options={{ title: 'Légende' }} />
            <Stack.Screen name="lore/chronique" options={{ title: 'Chronologie' }} />
            <Stack.Screen name="lore/entry/[key]" options={{ title: '' }} />
            <Stack.Screen name="gathering/timed" options={{ title: 'Points à horaires' }} />
            <Stack.Screen name="gathering/items" options={{ title: 'Où récolter' }} />
            <Stack.Screen name="gathering/item/[id]" options={{ title: 'Objet' }} />
            <Stack.Screen name="gathering/node/[key]" options={{ title: 'Point de récolte' }} />
            <Stack.Screen name="gathering/log" options={{ title: 'Carnet de récolte' }} />
            <Stack.Screen name="gathering/job/[job]" options={{ title: 'Récolteur' }} />
            <Stack.Screen name="fishing/fish/[id]" options={{ title: 'Poisson' }} />
            <Stack.Screen name="fishing/weather" options={{ title: 'Météo d’Éorzéa' }} />
            <Stack.Screen name="fishing/ocean" options={{ title: 'Pêche en mer' }} />
            <Stack.Screen name="fishing/log" options={{ title: 'Carnet de pêche' }} />
            <Stack.Screen name="crafting/recipe/[id]" options={{ title: 'Recette' }} />
            <Stack.Screen name="crafting/list" options={{ title: 'Ma liste d’artisanat' }} />
            <Stack.Screen name="crafting/profit" options={{ title: 'Rentabilité' }} />
            <Stack.Screen name="crafting/job/[craftType]" options={{ title: 'Artisan' }} />
            <Stack.Screen name="connect" options={{ title: 'Connecter mon personnage', presentation: 'modal' }} />
            <Stack.Screen name="inventory/[id]" options={{ title: 'Inventaire' }} />
            <Stack.Screen name="retainers/[id]" options={{ title: 'Servants' }} />
            <Stack.Screen name="mail/[id]" options={{ title: 'Courrier' }} />
            <Stack.Screen name="hud/[id]" options={{ title: 'ATH du jeu' }} />
            <Stack.Screen name="hotbars/[id]" options={{ title: 'Barres d’actions' }} />
            <Stack.Screen name="model/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
            <Stack.Screen name="collection/[characterId]/[key]" options={{ title: '' }} />
          </Stack>
          <UpdateBanner />
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

/** Attend que les réglages enregistrés sur le téléphone soient relus. */
function useStoreHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useAppStore.persist.onFinishHydration(onChange),
    () => useAppStore.persist.hasHydrated(),
    () => false,
  );
}
