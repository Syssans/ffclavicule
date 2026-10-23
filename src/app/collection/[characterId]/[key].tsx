import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getPriceSummaries } from '@/api/universalis';
import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Badge, Card, Chip, Empty, ErrorBox, GameIcon, Input, Loading, Screen, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useCatalog, usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import {
  filterEntries,
  itemPlaces,
  missingEntries,
  ownedIds,
  sourceCounts,
  sourceLabel,
  type MissingFilter,
} from '@/utils/collections';
import { enrich, findReference, formatRarity, indexReference, loadReference, type Enriched } from '@/utils/collect-reference';
import { formatAgo, formatGil } from '@/utils/format';
import { fold } from '@/utils/inventory';

type Tab = 'owned' | 'missing';
type Sort = 'name' | 'rare' | 'common';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'name', label: 'A → Z' },
  { value: 'common', label: 'Plus courants' },
  { value: 'rare', label: 'Plus rares' },
];

interface Tile {
  id: number;
  name: string;
  icon: number;
  rarity?: number;
}

/** Tri par nom, ou par part des joueurs qui possèdent l'élément (les inconnus à la fin). */
function sortTiles<T extends Tile>(tiles: T[], sort: Sort): T[] {
  if (sort === 'name') return [...tiles].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const sign = sort === 'rare' ? 1 : -1;
  return [...tiles].sort((a, b) => {
    if (a.rarity === undefined || b.rarity === undefined) return (a.rarity === undefined ? 1 : 0) - (b.rarity === undefined ? 1 : 0);
    return sign * (a.rarity - b.rarity) || a.name.localeCompare(b.name, 'fr');
  });
}

/** Une collection relevée en jeu : éléments possédés, et ceux qui manquent avec la façon de les obtenir. */
export default function CollectionScreen() {
  const params = useLocalSearchParams<{ characterId: string; key: string; label?: string; filter?: string }>();
  const { key, label } = params;
  const theme = useTheme();
  const id = Number(params.characterId);
  const { link, query } = usePrivate(id);
  const catalog = useCatalog(id);
  const [tab, setTab] = useState<Tab>(params.filter ? 'missing' : 'owned');
  const [filter, setFilter] = useState<MissingFilter>((params.filter as MissingFilter | undefined) ?? 'all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>('name');

  const snapshot = query.data;
  const collection = snapshot?.collections?.find((c) => c.key === key);
  const reference = useMemo(() => indexReference(key, loadReference().collections[key]), [key]);
  // Catalogue du plugin complété par FFXIV Collect : provenances des butins, boutique en ligne… et rareté.
  const catalogCollection = useMemo(() => {
    const raw = catalog.data?.collections.find((c) => c.key === key);
    return raw ? { ...raw, items: raw.items.map((e) => enrich(reference, e)) } : undefined;
  }, [catalog.data, key, reference]);
  const places = useMemo(() => itemPlaces(snapshot), [snapshot]);
  const missing = useMemo(
    () => missingEntries(catalogCollection, ownedIds(snapshot, key)) as Enriched[],
    [catalogCollection, snapshot, key],
  );
  const counts = useMemo(() => sourceCounts(missing), [missing]);

  const owned = useMemo(() => {
    const needle = fold(search.trim());
    const tiles = (collection?.owned ?? [])
      .filter((c) => !needle || fold(c.name).includes(needle))
      .map((c) => {
        const entry = catalogCollection?.items.find((e) => e.id === c.id);
        return { ...c, rarity: entry?.rarity ?? findReference(reference, c)?.o };
      });
    return sortTiles(tiles, sort);
  }, [collection, search, catalogCollection, reference, sort]);
  const shownMissing = useMemo(
    () => sortTiles(filterEntries(missing, filter, search, places) as Enriched[], sort),
    [missing, filter, search, places, sort],
  );
  const inPocket = missing.filter((e) => e.item !== undefined && places.has(e.item)).length;
  const onMarket = missing.filter((e) => e.tradeable).length;

  const entryOf = (tileId: number) => catalogCollection?.items.find((e) => e.id === tileId);
  const detail = selected !== null ? entryOf(selected) : undefined;
  const referenceDate = new Date(loadReference().updatedAt).toLocaleDateString('fr-FR');

  return (
    <Screen>
      <Stack.Screen options={{ title: collection?.label ?? label ?? 'Collection' }} />
      {!link ? <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty> : null}
      {query.isPending && link ? <Loading label="Lecture de tes collections…" /> : null}
      {query.error ? <ErrorBox error={query.error} onRetry={() => query.refetch()} /> : null}
      {snapshot && !collection ? <Empty>Cette collection n’a pas encore été relevée par le plugin.</Empty> : null}
      {collection ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {collection.owned.length} possédés sur {collection.total} · relevé {formatAgo(Date.parse(snapshot!.updatedAt))}
          </ThemedText>
          <Segmented
            options={[
              { value: 'owned', label: `Possédés (${collection.owned.length})` },
              { value: 'missing', label: `Manquants (${catalogCollection ? missing.length : collection.total - collection.owned.length})` },
            ]}
            value={tab}
            onChange={(t) => {
              setTab(t);
              setSelected(null);
            }}
          />
          <Input value={search} onChangeText={setSearch} placeholder="Chercher" accessibilityLabel="Chercher dans la collection" />
          <View style={styles.sorts}>
            {SORTS.map((o) => (
              <Chip key={o.value} label={o.label} selected={sort === o.value} onPress={() => setSort(o.value)} />
            ))}
          </View>

          {tab === 'missing' && !catalogCollection ? (
            catalog.isPending ? (
              <Loading label="Lecture du catalogue…" />
            ) : (
              <Empty>Mets à jour le plugin : il enverra la liste de ce qui te manque et comment l’obtenir.</Empty>
            )
          ) : null}

          {tab === 'missing' && catalogCollection ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Tous" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {inPocket > 0 ? <Chip label={`Dans ton inventaire (${inPocket})`} selected={filter === 'inventory'} onPress={() => setFilter('inventory')} /> : null}
              {onMarket > 0 ? <Chip label={`Au marché (${onMarket})`} selected={filter === 'market'} onPress={() => setFilter('market')} /> : null}
              {counts.map((c) => (
                <Chip
                  key={c.type}
                  label={`${sourceLabel(c.type)} (${c.count})`}
                  selected={filter === `source:${c.type}`}
                  onPress={() => setFilter(`source:${c.type}`)}
                />
              ))}
            </ScrollView>
          ) : null}

          {detail ? <EntryDetail entry={detail} places={detail.item !== undefined ? places.get(detail.item) : undefined} owned={tab === 'owned'} onClose={() => setSelected(null)} /> : null}

          {tab === 'owned' ? (
            owned.length === 0 ? (
              <Empty>{search ? 'Aucun résultat.' : 'Aucun élément possédé dans cette collection.'}</Empty>
            ) : (
              <Grid
                tiles={owned}
                selected={selected}
                onPress={(t) => setSelected(catalogCollection ? t.id : null)}
                caption={(t) => (t.rarity !== undefined ? { text: `${formatRarity(t.rarity)} des joueurs` } : undefined)}
              />
            )
          ) : null}
          {tab === 'missing' && catalogCollection ? (
            shownMissing.length === 0 ? (
              <Empty>{missing.length === 0 ? 'Collection complète, bravo !' : 'Aucun résultat.'}</Empty>
            ) : (
              <Grid
                tiles={shownMissing}
                selected={selected}
                onPress={(t) => setSelected(t.id === selected ? null : t.id)}
                caption={(t) => {
                  const entry = entryOf(t.id);
                  if (entry?.item !== undefined && places.has(entry.item)) return { text: 'Dans ton inventaire', accent: true };
                  const parts = [entry?.sources[0] ? sourceLabel(entry.sources[0].type) : undefined, formatRarity(entry?.rarity)].filter(Boolean);
                  return parts.length ? { text: parts.join(' · ') } : undefined;
                }}
              />
            )
          ) : null}
          {tab === 'missing' && catalog.data ? (
            <ThemedText type="small" themeColor="textSecondary" style={{ color: theme.textSecondary }}>
              Provenances et part des joueurs : FFXIV Collect (instantané du {referenceDate}), complété par les données du jeu lues par le
              plugin pour ce qui vient de sortir.
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Grid({
  tiles,
  selected,
  onPress,
  caption,
}: {
  tiles: Tile[];
  selected: number | null;
  onPress: (tile: Tile) => void;
  caption?: (tile: Tile) => { text: string; accent?: boolean } | undefined;
}) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {tiles.map((c) => {
        const info = caption?.(c);
        return (
          <Pressable
            key={c.id}
            onPress={() => onPress(c)}
            accessibilityRole="button"
            accessibilityLabel={c.name}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: theme.backgroundElement, borderColor: c.id === selected ? theme.accent : 'transparent' },
              pressed && { opacity: 0.75 },
            ]}>
            {c.icon ? <GameIcon uri={gameIconUrl(c.icon)} size={56} /> : null}
            <ThemedText type="small" numberOfLines={c.icon ? 2 : 4} style={styles.name}>
              {c.name}
            </ThemedText>
            {info ? (
              <ThemedText type="small" numberOfLines={1} style={[styles.meta, { color: info.accent ? theme.accent : theme.textSecondary }]}>
                {info.text}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Détail d'un élément : comment l'obtenir, s'il est déjà dans l'inventaire, et son prix au marché. */
function EntryDetail({ entry, places, owned, onClose }: { entry: Enriched; places?: string[]; owned: boolean; onClose: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const scope = useAppStore((s) => s.marketScope);
  const price = useQuery({
    queryKey: ['universalis', 'summary', scope, entry.item],
    queryFn: () => getPriceSummaries(scope, [entry.item!]),
    enabled: entry.tradeable && entry.item !== undefined && !owned,
    staleTime: 5 * 60 * 1000,
  });
  const summary = price.data?.[0];
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { backgroundColor: theme.background, paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        <Card>
          <View style={styles.detailHead}>
            <GameIcon uri={entry.icon ? gameIconUrl(entry.icon) : null} size={48} />
            <View style={styles.flex}>
              <ThemedText type="smallBold">{entry.name}</ThemedText>
              {entry.rarity !== undefined ? (
                <ThemedText type="small" themeColor="textSecondary">
                  Possédé par {formatRarity(entry.rarity)} des joueurs suivis par FFXIV Collect
                </ThemedText>
              ) : null}
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" hitSlop={10}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                ✕
              </ThemedText>
            </Pressable>
          </View>
          {places ? (
            <ThemedText type="small" style={{ color: theme.accent }}>
              Tu as déjà l’objet ({places.join(', ')}) : utilise-le en jeu pour l’ajouter à ta collection.
            </ThemedText>
          ) : null}
          {entry.sources.length > 0 ? (
            entry.sources.map((s, i) => (
              <View key={i} style={styles.sourceRow}>
                <Badge label={sourceLabel(s.type)} tone={s.limited ? 'down' : 'accent'} />
                <ThemedText type="small" style={styles.flex}>
                  {s.text}
                  {s.limited ? ' (plus disponible)' : ''}
                </ThemedText>
              </View>
            ))
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              Provenance inconnue des données du jeu (butin de donjon, événement, boutique en ligne…).
            </ThemedText>
          )}
          {!owned && entry.tradeable ? (
            <ThemedText type="small" themeColor="textSecondary">
              {price.isPending
                ? 'Prix au marché…'
                : summary?.minPrice
                  ? `Au marché : à partir de ${formatGil(summary.minPrice)}${summary.cheapestWorld ? ` (${summary.cheapestWorld})` : ''}`
                  : 'Aucune vente en cours au marché.'}
            </ThemedText>
          ) : null}
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.one, paddingVertical: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '32.5%',
    borderRadius: 14,
    borderWidth: 2,
    padding: Spacing.two,
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: { textAlign: 'center', fontSize: 13, lineHeight: 17 },
  meta: { fontSize: 11, lineHeight: 14 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sorts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  sourceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { padding: Spacing.three, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
});
