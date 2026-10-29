/** Renvoi vers une fiche de la Légende, depuis la fiche d'un objet ou une collection : image, nom, début du texte. */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';

import { NIGHT, openLoreEntry } from '@/components/lore/lore-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LORE_TYPES, loreImage, type LoreEntry } from '@/utils/lore';

export function LoreLink({ entry, onOpen }: { entry: LoreEntry; onOpen?: () => void }) {
  const theme = useTheme();
  const image = loreImage(entry);
  const teaser = (entry.t === 'perso' ? entry.e : entry.x) ?? '';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Dans la Légende : ${entry.n}`}
      onPress={() => {
        onOpen?.();
        openLoreEntry(entry);
      }}
      style={({ pressed }) => [styles.row, { borderColor: theme.ornament, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <LinearGradient colors={NIGHT} style={styles.thumb}>
        {image ? <Image source={image} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
      </LinearGradient>
      <View style={styles.flex}>
        <ThemedText type="small" style={[styles.eyebrow, { color: theme.ornament }]}>
          DANS LA LÉGENDE · {LORE_TYPES[entry.t].label.toUpperCase()}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {entry.n}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {teaser}
        </ThemedText>
      </View>
      <ThemedText style={{ color: theme.ornament }}>›</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: 14, padding: Spacing.two },
  thumb: { width: 56, height: 56, borderRadius: 10, overflow: 'hidden' },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontWeight: '700' },
});
