/**
 * Barres d'actions en plein écran : le téléphone passe en paysage et les barres s'affichent à leur place dans
 * l'ATH, aussi grandes que possible, avec le glisser-déposer. Retour en portrait à la fermeture.
 */
import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { HotbarBoard, SLOT_COLORS, type BoardBar } from '@/components/hotbars/hotbar-board';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { HudScreen, SlotRef } from '@/utils/hud';

const PANEL_WIDTH = 230;
/** Marge latérale en paysage : l'encoche de l'iPhone se retrouve sur un côté. */
const NOTCH_MARGIN = 44;

export function HotbarFullscreen({
  visible,
  onClose,
  title,
  bars,
  screen,
  picked,
  isChanged,
  onTap,
  onDrop,
  panel,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  bars: BoardBar[];
  screen: HudScreen;
  picked: SlotRef | null;
  isChanged: (ref: SlotRef) => boolean;
  onTap: (ref: SlotRef | null) => void;
  onDrop: (from: SlotRef, to: SlotRef) => void;
  /** Modifications en cours, envoi, case choisie. */
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

  const side = landscape ? NOTCH_MARGIN : Spacing.three;
  const boardWidth = landscape ? width - PANEL_WIDTH - side * 2 - Spacing.three : width - side * 2;
  const boardHeight = landscape ? height - Spacing.three * 2 : height * 0.5;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose}
      statusBarTranslucent>
      {/* Les gestes d'une fenêtre modale ont besoin de leur propre racine. */}
      <GestureHandlerRootView style={[styles.root, { flexDirection: landscape ? 'row' : 'column', paddingHorizontal: side }]}>
        <View style={styles.boardArea}>
          <View style={[styles.screen, { width: boardWidth }]}>
            <HotbarBoard
              bars={bars}
              mode="screen"
              screen={screen}
              maxHeight={boardHeight - Spacing.three * 2}
              picked={picked}
              isChanged={isChanged}
              onTap={onTap}
              onDrop={onDrop}
            />
          </View>
        </View>
        <ScrollView
          style={[styles.panel, landscape ? { width: PANEL_WIDTH } : null, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.panelContent}>
          <View style={styles.panelHead}>
            <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
              {title}
            </ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={10} onPress={onClose}>
              <ThemedText type="subtitle" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          </View>
          {panel}
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070C', gap: Spacing.three, paddingVertical: Spacing.three },
  boardArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  screen: { backgroundColor: SLOT_COLORS.panel, borderRadius: 14, padding: Spacing.three },
  panel: { borderRadius: 14 },
  panelContent: { padding: Spacing.three, gap: Spacing.two },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
});
