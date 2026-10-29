/**
 * Comment obtenir un élément de collection (monture, mascotte, carte…) et sa rareté : part des joueurs qui le
 * possèdent, d'après l'instantané de FFXIV Collect intégré à l'appli.
 */
import { StyleSheet, View } from 'react-native';

import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, ProgressBar } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRarity, rarityTier, type ReferenceEntry } from '@/utils/collect-reference';
import { sourceLabel } from '@/utils/collections';

export function CollectInfo({ entry, title = 'Obtention' }: { entry: ReferenceEntry; title?: string }) {
  const theme = useTheme();
  const tier = entry.o !== undefined ? rarityTier(entry.o) : null;
  return (
    <GameWindow icon={GameIcons.challengeLog} title={title}>
      {entry.o !== undefined && tier ? (
        <View style={styles.rarity} accessible accessibilityLabel={`${tier.label} : ${formatRarity(entry.o)} des joueurs le possèdent`}>
          <View style={styles.rarityHead}>
            <Badge label={tier.label} tone={tier.tone} />
            <ThemedText type="small" style={styles.flex}>
              {formatRarity(entry.o)} des joueurs le possèdent
            </ThemedText>
          </View>
          <ProgressBar value={entry.o / 100} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
            D’après les joueurs suivis par FFXIV Collect
          </ThemedText>
        </View>
      ) : null}
      {entry.s?.length ? (
        entry.s.map(([type, text], i) => (
          <View key={i} style={[styles.source, (i > 0 || tier) && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
            <Badge label={sourceLabel(type)} tone="accent" />
            <ThemedText type="small" style={styles.flex}>
              {text}
            </ThemedText>
          </View>
        ))
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Provenance inconnue.
        </ThemedText>
      )}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  rarity: { gap: Spacing.one, paddingBottom: Spacing.two },
  rarityHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  note: { fontSize: 12, lineHeight: 16 },
  source: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, paddingVertical: Spacing.two },
});
