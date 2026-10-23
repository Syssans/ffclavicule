/**
 * Éditeur d'ATH en plein écran : le téléphone passe en paysage pour que l'écran du jeu en miniature soit
 * le plus grand possible et les cadres plus faciles à attraper. Retour en portrait à la fermeture.
 */
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { HudElement } from '@/api/hud';
import { HudCanvas } from '@/components/hud-canvas';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { HudScreen } from '@/utils/hud';

const PANEL_WIDTH = 270;
/** Marge latérale en paysage : l'encoche de l'iPhone se retrouve sur un côté. */
const NOTCH_MARGIN = 44;

export function HudFullscreen({
  visible,
  onClose,
  title,
  elements,
  screen,
  selected,
  modified,
  onSelect,
  onMove,
  toolbar,
  panel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  elements: HudElement[];
  screen: HudScreen;
  selected: number | null;
  modified: Set<number>;
  onSelect: (hash: number) => void;
  onMove: (hash: number, position: { x: number; y: number }) => void;
  /** Boutons sous le titre (filtres…). */
  toolbar?: ReactNode;
  /** Réglages de l'élément sélectionné. */
  panel: ReactNode;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => undefined);
    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
    };
  }, [visible]);

  // L'écran du jeu prend toute la place que laisse le panneau, sans être déformé.
  const side = landscape ? NOTCH_MARGIN : Spacing.three;
  const availableWidth = landscape ? width - PANEL_WIDTH - side * 2 - Spacing.three : width - side * 2;
  const availableHeight = landscape ? height - Spacing.three * 2 : height * 0.45;
  const aspect = screen.width / screen.height;
  const canvasWidth = Math.max(120, Math.min(availableWidth, availableHeight * aspect));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
      statusBarTranslucent>
      <View
        style={[
          styles.root,
          { backgroundColor: theme.background, flexDirection: landscape ? 'row' : 'column', paddingHorizontal: side },
        ]}>
        <View style={styles.canvasArea}>
          <View style={{ width: canvasWidth }}>
            <HudCanvas elements={elements} screen={screen} selected={selected} modified={modified} onSelect={onSelect} onMove={onMove} />
          </View>
        </View>
        <View style={[styles.panel, landscape ? { width: PANEL_WIDTH } : styles.panelPortrait]}>
          <View style={styles.header}>
            <ThemedText type="display" numberOfLines={1} style={styles.flex}>
              {title}
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.done, { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 }]}>
              <ThemedText type="smallBold" style={{ color: theme.accentText }}>
                Terminé
              </ThemedText>
            </Pressable>
          </View>
          {toolbar}
          <ScrollView contentContainerStyle={styles.panelContent} keyboardShouldPersistTaps="handled">
            {panel}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingVertical: Spacing.three, gap: Spacing.three },
  canvasArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  panel: { gap: Spacing.two },
  panelPortrait: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  done: { minHeight: 36, paddingHorizontal: Spacing.three, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  panelContent: { gap: Spacing.two, paddingBottom: Spacing.three },
});
