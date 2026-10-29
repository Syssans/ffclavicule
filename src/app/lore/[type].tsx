/** Une catégorie de la Légende en galerie : personnages, lieux, notions, chroniques, montures ou mascottes. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { LoreCard } from '@/components/lore/lore-card';
import { Chip, Empty, Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useLoreStore } from '@/store/lore-store';
import { EXPANSIONS, LORE_TYPES, loreEntries, type LoreEntry, type LoreType } from '@/utils/lore';
import { parseQuery, rankMatches, searchKey } from '@/utils/search';

const COLUMNS: Record<LoreType, number> = { perso: 3, lieu: 2, notion: 2, recit: 1, monture: 3, mascotte: 3 };
/** Fiches rédigées (personnages majeurs), en tête des personnages. */
const MAJOR = 'Grandes figures';
const PAGE = 60;
const OTHERS = 'Autres';

export default function LoreGalleryScreen() {
  const { type: raw } = useLocalSearchParams<{ type: string }>();
  const type = (raw in LORE_TYPES ? raw : 'perso') as LoreType;
  const progress = useLoreStore((s) => s.progress);
  const visited = useLoreStore((s) => s.visited);
  const { width } = useWindowDimensions();
  const [text, setText] = useState('');
  const query = useDebounced(text, 150);
  const [filter, setFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);

  const all = loreEntries(type);
  // Filtres : type de carte pour les personnages, extension pour les lieux et les chroniques.
  const filters = useMemo(() => {
    if (type === 'perso') {
      // Types des cartes de Triple Triade ; les fiches rédigées du codex à part.
      const groups = [
        ...new Set(
          all
            .filter((e) => !e.b)
            .map((e) => e.s)
            .filter(Boolean),
        ),
      ] as string[];
      return [MAJOR, ...groups, OTHERS];
    }
    if (type === 'lieu' || type === 'recit' || type === 'notion') return EXPANSIONS;
    return [];
  }, [all, type]);
  const matches = (e: LoreEntry) => {
    if (!filter) return true;
    if (type === 'perso') return filter === MAJOR ? Boolean(e.b) : !e.b && (filter === OTHERS ? !e.s : e.s === filter);
    return EXPANSIONS[e.v ?? 0] === filter;
  };
  const list = useMemo(() => {
    const pool = all.filter(matches);
    return searchKey(query).length >= 2 ? rankMatches(pool, (e) => searchKey([e.n, ...(e.aka ?? [])].join(' ')), parseQuery(query)) : pool;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, filter, query]);

  const columns = COLUMNS[type];
  const cardWidth = Math.floor((Math.min(width, 700) - Spacing.three * 2 - Spacing.two * (columns - 1)) / columns);

  return (
    <Screen keyboardDismissMode="on-drag">
      <Stack.Screen options={{ title: LORE_TYPES[type].plural }} />
      <Input
        value={text}
        onChangeText={(t) => {
          setText(t);
          setShown(PAGE);
        }}
        placeholder={`Chercher parmi ${all.length} ${LORE_TYPES[type].plural.toLowerCase()}`}
        clearButtonMode="while-editing"
        autoCapitalize="none"
      />
      {filters.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          <Chip label="Tous" selected={!filter} onPress={() => setFilter(null)} />
          {filters.map((f) => (
            <Chip key={f} label={f} selected={filter === f} onPress={() => setFilter(f === filter ? null : f)} />
          ))}
        </ScrollView>
      ) : null}
      {list.length === 0 ? <Empty>Rien ne correspond.</Empty> : null}
      <View style={styles.grid}>
        {list.slice(0, shown).map((e) => (
          <LoreCard key={e.k} entry={e} width={cardWidth} progress={progress} visited={visited.includes(e.k)} />
        ))}
      </View>
      {list.length > shown ? <Chip label={`Afficher plus (${list.length - shown})`} onPress={() => setShown(shown + PAGE)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: Spacing.one, paddingVertical: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, rowGap: Spacing.three },
});
