import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Empty, ErrorBox, GameIcon, Input, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { formatAgo } from '@/utils/format';
import { fold } from '@/utils/inventory';

/** Grille des éléments possédés d'une collection (montures, mascottes…), relevés en jeu par le plugin. */
export default function CollectionScreen() {
  const { characterId, key, label } = useLocalSearchParams<{ characterId: string; key: string; label?: string }>();
  const theme = useTheme();
  const id = Number(characterId);
  const { link, query } = usePrivate(id);
  const [search, setSearch] = useState('');

  const collection = query.data?.collections?.find((c) => c.key === key);
  const owned = useMemo(() => {
    const needle = fold(search);
    return [...(collection?.owned ?? [])]
      .filter((c) => !needle || fold(c.name).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [collection, search]);

  return (
    <Screen>
      <Stack.Screen options={{ title: collection?.label ?? label ?? 'Collection' }} />
      {!link ? <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty> : null}
      {query.isPending && link ? <Loading label="Lecture de tes collections…" /> : null}
      {query.error ? <ErrorBox error={query.error} onRetry={() => query.refetch()} /> : null}
      {query.data && !collection ? <Empty>Cette collection n’a pas encore été relevée par le plugin.</Empty> : null}
      {collection ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {collection.owned.length} possédés sur {collection.total} · relevé {formatAgo(Date.parse(query.data!.updatedAt))}
          </ThemedText>
          {collection.owned.length > 12 ? (
            <Input value={search} onChangeText={setSearch} placeholder="Chercher" accessibilityLabel="Chercher dans la collection" />
          ) : null}
          {owned.length === 0 ? (
            <Empty>{search ? 'Aucun résultat.' : 'Aucun élément possédé dans cette collection.'}</Empty>
          ) : (
            <View style={styles.grid}>
              {owned.map((c) => (
                <View
                  key={c.id}
                  style={[styles.tile, { backgroundColor: theme.backgroundElement }]}
                  accessible
                  accessibilityLabel={c.name}>
                  <GameIcon uri={c.icon ? gameIconUrl(c.icon) : null} size={56} />
                  <ThemedText type="small" numberOfLines={2} style={styles.name}>
                    {c.name}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: { flexBasis: '31%', flexGrow: 1, maxWidth: '32.5%', borderRadius: 14, padding: Spacing.two, alignItems: 'center', gap: Spacing.one },
  name: { textAlign: 'center', fontSize: 13, lineHeight: 17 },
});
