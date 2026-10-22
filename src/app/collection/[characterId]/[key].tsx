import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getOwned, isBrowsable } from '@/api/ffxivcollect';
import { ThemedText } from '@/components/themed-text';
import { Empty, ErrorBox, GameIcon, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Grille des éléments possédés d'une collection (montures, mascottes…). */
export default function CollectionScreen() {
  const { characterId, key, label } = useLocalSearchParams<{ characterId: string; key: string; label?: string }>();
  const theme = useTheme();
  const id = Number(characterId);
  const owned = useQuery({
    queryKey: ['ffxivcollect', 'owned', id, key],
    queryFn: () => getOwned(id, key as Parameters<typeof getOwned>[1]),
    enabled: Number.isFinite(id) && isBrowsable(key),
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: label ?? 'Collection' }} />
      {owned.isPending ? <Loading label="Lecture de FFXIV Collect…" /> : null}
      {owned.error ? <ErrorBox error={owned.error} onRetry={() => owned.refetch()} /> : null}
      {owned.data ? (
        owned.data.length === 0 ? (
          <Empty>Aucun élément possédé dans cette collection.</Empty>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              {owned.data.length} possédés
            </ThemedText>
            <View style={styles.grid}>
              {owned.data.map((c) => (
                <View
                  key={c.id}
                  style={[styles.tile, { backgroundColor: theme.backgroundElement }]}
                  accessible
                  accessibilityLabel={c.name}>
                  <GameIcon uri={c.icon ?? c.image} size={56} />
                  <ThemedText type="small" numberOfLines={2} style={styles.name}>
                    {c.name}
                  </ThemedText>
                  {c.patch ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.meta}>
                      Patch {c.patch}
                    </ThemedText>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexBasis: '31%', flexGrow: 1, maxWidth: '32.5%', borderRadius: 14, padding: Spacing.two, alignItems: 'center', gap: Spacing.one },
  name: { textAlign: 'center', fontSize: 13, lineHeight: 17 },
  meta: { fontSize: 11, lineHeight: 14 },
});
