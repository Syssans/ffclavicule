import { Cinzel_600SemiBold, Cinzel_700Bold, useFonts } from '@expo-google-fonts/cinzel';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, useColorScheme } from 'react-native';

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
  // Police des titres ; en cas d'échec de chargement, l'appli démarre avec la police du système.
  const [fontsLoaded, fontError] = useFonts({ Cinzel_600SemiBold, Cinzel_700Bold });
  const ready = hydrated && (fontsLoaded || fontError !== null);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
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
          <Stack.Screen name="notifications/marche" options={{ title: 'Alertes du marché' }} />
          <Stack.Screen name="notifications/jeu" options={{ title: 'Rappels du jeu' }} />
          <Stack.Screen name="alert" options={{ title: 'Alerte de prix', presentation: 'modal' }} />
          <Stack.Screen name="item/[id]" options={{ title: '' }} />
          <Stack.Screen name="connect" options={{ title: 'Connecter mon personnage', presentation: 'modal' }} />
          <Stack.Screen name="inventory/[id]" options={{ title: 'Inventaire' }} />
          <Stack.Screen name="retainers/[id]" options={{ title: 'Servants' }} />
          <Stack.Screen name="mail/[id]" options={{ title: 'Courrier' }} />
          <Stack.Screen name="hud/[id]" options={{ title: 'ATH du jeu' }} />
          <Stack.Screen name="hotbars/[id]" options={{ title: 'Barres d’actions' }} />
          <Stack.Screen name="model/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'fade' }} />
          <Stack.Screen name="collection/[characterId]/[key]" options={{ title: '' }} />
        </Stack>
      </ThemeProvider>
    </QueryClientProvider>
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
