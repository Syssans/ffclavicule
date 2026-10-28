/**
 * Vignettes illustrées de la Légende, chacune à la façon de sa catégorie : carte de Triple Triade, tableau du
 * carnet d'exploration, bannière de chronique, monture ou mascotte sur fond de nuit.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { EXPANSIONS, isSpoiler, loreImage, type LoreEntry, type LoreType } from '@/utils/lore';

/** Largeur sur hauteur de l'image de chaque catégorie. */
export const LORE_ASPECT: Record<LoreType, number> = { perso: 208 / 256, lieu: 800 / 480, recit: 1128 / 360, monture: 1, mascotte: 1 };

export const NIGHT = ['#232B48', '#0B0F1C'] as const;

export function openLoreEntry(entry: LoreEntry) {
  router.push({ pathname: '/lore/entry/[key]', params: { key: entry.k } });
}

export function LoreCard({
  entry,
  width,
  progress,
  visited = false,
}: {
  entry: LoreEntry;
  width: number;
  /** Progression du joueur : au-delà, la vignette est voilée. */
  progress: number;
  visited?: boolean;
}) {
  const theme = useTheme();
  const hidden = isSpoiler(entry, progress);
  const height = width / LORE_ASPECT[entry.t];
  const image = loreImage(entry);
  const overlay = entry.t === 'lieu' || entry.t === 'recit';
  const name = hidden ? `Spoiler · ${EXPANSIONS[entry.v ?? 0]}` : entry.n;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => openLoreEntry(entry)}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>
      <View style={[styles.frame, { width, height, borderRadius: entry.t === 'perso' ? 8 : 12 }]}>
        {entry.t === 'monture' || entry.t === 'mascotte' ? <LinearGradient colors={NIGHT} style={StyleSheet.absoluteFill} /> : null}
        {image ? (
          <Image
            source={image}
            style={StyleSheet.absoluteFill}
            contentFit={entry.t === 'monture' || entry.t === 'mascotte' || entry.t === 'perso' ? 'contain' : 'cover'}
            blurRadius={hidden ? 24 : 0}
            transition={150}
            recyclingKey={entry.k}
          />
        ) : null}
        {overlay ? (
          <>
            <LinearGradient colors={['transparent', 'rgba(5,8,15,0.85)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
            <Text style={[styles.overlayName, entry.t === 'recit' && styles.overlayNameSmall]} numberOfLines={2}>
              {name}
            </Text>
          </>
        ) : null}
        {visited ? (
          <View style={[styles.seen, { backgroundColor: theme.ornament }]}>
            <Text style={styles.seenText}>✓</Text>
          </View>
        ) : null}
      </View>
      {!overlay ? (
        <ThemedText type="smallBold" numberOfLines={2} style={styles.name}>
          {name}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#11151F' },
  overlayName: {
    color: '#FFF8E6',
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    padding: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  overlayNameSmall: { fontSize: 13, lineHeight: 16, paddingVertical: 6 },
  name: { fontSize: 13, lineHeight: 17, textAlign: 'center', marginTop: 4 },
  seen: { position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  seenText: { color: '#151B2B', fontSize: 11, fontWeight: '900', lineHeight: 14 },
});
