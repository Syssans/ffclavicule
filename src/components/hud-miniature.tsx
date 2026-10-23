/**
 * Schéma non interactif de l'ATH : où se trouve chaque barre d'actions à l'écran (numérotées), les autres
 * éléments en gris pour se repérer. La barre mise en avant est remplie en doré.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import type { HudElement } from '@/api/hud';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { elementRect, type HudScreen } from '@/utils/hud';

export function HudMiniature({
  elements,
  screen,
  highlight,
  compact = false,
}: {
  elements: HudElement[];
  screen: HudScreen;
  highlight?: number | null;
  /** Vignette : sans numéros ni éléments gris, seulement les barres. */
  compact?: boolean;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const k = width > 0 ? width / screen.width : 0;

  const boxes = useMemo(
    () =>
      elements
        .filter((e) => e.visible && (e.group === 'hotbar' || (!compact && e.group === 'main')))
        .map((e) => ({ element: e, rect: elementRect(e, screen) }))
        // Les barres par-dessus le reste.
        .sort((a, b) => Number(a.element.hotbar !== undefined) - Number(b.element.hotbar !== undefined)),
    [elements, screen, compact],
  );
  const shownBars = boxes.filter((b) => b.element.hotbar !== undefined).map((b) => b.element.hotbar! + 1);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      pointerEvents="none"
      accessible
      accessibilityLabel={`Schéma de l’écran du jeu : barres ${shownBars.join(', ')} affichées`}
      style={[styles.screen, compact && styles.compact, { aspectRatio: screen.width / screen.height, borderColor: theme.frame }]}>
      {k > 0
        ? boxes.map(({ element, rect }) => {
            const bar = element.hotbar;
            const isBar = bar !== undefined;
            const lit = isBar && bar === highlight;
            return (
              <View
                key={element.hash}
                style={[
                  styles.box,
                  {
                    left: rect.x * k,
                    top: rect.y * k,
                    width: Math.max(3, rect.w * k),
                    height: Math.max(3, rect.h * k),
                    borderColor: isBar ? (compact && !lit ? 'rgba(217,179,108,0.45)' : theme.accent) : 'rgba(255,255,255,0.18)',
                    backgroundColor: lit ? theme.accent : isBar ? 'rgba(217,179,108,0.18)' : 'rgba(255,255,255,0.05)',
                  },
                ]}>
                {isBar && !compact ? (
                  <ThemedText type="smallBold" style={[styles.label, { color: lit ? theme.accentText : '#F2EFE8' }]}>
                    {bar + 1}
                  </ThemedText>
                ) : null}
              </View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { width: '100%', backgroundColor: '#10151F', borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  compact: { width: 72, borderRadius: 4 },
  box: { position: 'absolute', borderWidth: 1, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, lineHeight: 12 },
});
