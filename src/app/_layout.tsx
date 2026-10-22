import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { useAppStore } from '@/store/app-store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 5 * 60 * 1000, retry: 1 } },
      }),
  );
  const hydrated = useStoreHydrated();

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync();
  }, [hydrated]);

  if (!hydrated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="character/search" options={{ title: 'Ajouter un personnage', presentation: 'modal' }} />
          <Stack.Screen name="character/[id]" options={{ title: '' }} />
          <Stack.Screen name="item/[id]" options={{ title: '' }} />
          <Stack.Screen name="connect" options={{ title: 'Connecter mon personnage', presentation: 'modal' }} />
          <Stack.Screen name="private/[id]" options={{ title: '' }} />
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
