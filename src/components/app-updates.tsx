/**
 * Mises à jour automatiques de l'appli installée (EAS Update) : l'appli cherche une nouvelle version au lancement et
 * à chaque retour au premier plan, la télécharge, puis propose de redémarrer pour l'appliquer. Sans effet dans
 * Expo Go et sur le web (Updates.isEnabled est faux).
 */
import * as Updates from 'expo-updates';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Délai minimal entre deux recherches automatiques. */
const CHECK_INTERVAL = 5 * 60_000;

async function checkAndFetch(): Promise<boolean> {
  const check = await Updates.checkForUpdateAsync();
  if (!check.isAvailable) return false;
  const fetched = await Updates.fetchUpdateAsync();
  return fetched.isNew;
}

/** Bandeau « nouvelle version prête », posé sur toute l'appli. */
export function UpdateBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return;
    // Au retour au premier plan : nouvelle recherche (le lancement en fait déjà une).
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || Date.now() - lastCheck.current < CHECK_INTERVAL) return;
      lastCheck.current = Date.now();
      checkAndFetch().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  if (!Updates.isEnabled || !isUpdatePending || dismissed) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + BottomTabInset + Spacing.two }]}>
      <View style={[styles.banner, { backgroundColor: theme.backgroundElement, borderColor: theme.frame }]}>
        <ThemedText type="smallBold" style={styles.flex}>
          Nouvelle version de Clavicule prête
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={() => Updates.reloadAsync()} style={[styles.action, { backgroundColor: theme.accent }]}>
          <ThemedText type="smallBold" style={{ color: theme.accentText }}>
            Redémarrer
          </ThemedText>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Plus tard" onPress={() => setDismissed(true)} hitSlop={10}>
          <ThemedText themeColor="textSecondary">✕</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

/** Réglages : version en cours et recherche manuelle. */
export function UpdatesSection() {
  const { currentlyRunning, isChecking, isDownloading, isUpdatePending } = Updates.useUpdates();
  const [message, setMessage] = useState<string | null>(null);

  if (!Updates.isEnabled) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Les mises à jour automatiques fonctionnent dans l’appli installée (pas dans Expo Go ni sur le web).
      </ThemedText>
    );
  }

  const date = currentlyRunning.createdAt ?? Updates.createdAt;
  const version = currentlyRunning.isEmbeddedLaunch
    ? 'Version d’origine de l’appli installée'
    : `Mise à jour du ${date ? date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}`;

  const search = async () => {
    setMessage(null);
    try {
      const isNew = await checkAndFetch();
      setMessage(isNew ? 'Nouvelle version téléchargée : redémarre pour l’appliquer.' : 'Tu as déjà la dernière version.');
    } catch (error) {
      setMessage(`Recherche impossible : ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <>
      <ThemedText type="small">{version}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Canal {currentlyRunning.channel ?? Updates.channel ?? '—'} · version native {currentlyRunning.runtimeVersion ?? Updates.runtimeVersion ?? '—'}
      </ThemedText>
      {isUpdatePending ? (
        <Button label="Redémarrer sur la nouvelle version" onPress={() => Updates.reloadAsync()} />
      ) : (
        <Button
          label={isChecking || isDownloading ? 'Recherche…' : 'Chercher une mise à jour'}
          variant="secondary"
          disabled={isChecking || isDownloading}
          onPress={search}
        />
      )}
      {message ? (
        <ThemedText type="small" themeColor="textSecondary">
          {message}
        </ThemedText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { position: 'absolute', left: Spacing.three, right: Spacing.three },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
    borderWidth: 1,
  },
  action: { paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: 10 },
});
