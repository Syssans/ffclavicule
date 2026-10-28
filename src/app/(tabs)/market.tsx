import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { getHistories, getPriceSummaries } from '@/api/universalis';
import { searchItems } from '@/api/xivapi';
import { GameWindow, MenuEntry } from '@/components/game-ui';
import { SettingsButton } from '@/components/home';
import { Sparkline } from '@/components/price-chart';
import { ThemedText } from '@/components/themed-text';
import { Badge, Chip, Empty, ErrorBox, GameIcon, Input, Loading, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore, type WatchedItem } from '@/store/app-store';
import { useNotificationStore } from '@/store/notification-store';
import { formatGil } from '@/utils/format';
import { dailyPrices, trendPercent, type PricePoint } from '@/utils/prices';

const TREND_DAYS = 7;

function openItem(id: number) {
  router.push({ pathname: '/item/[id]', params: { id: String(id), tab: 'market' } });
}

export default function MarketScreen() {
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 400);
  const searching = query.length >= 2;

  return (
    <Screen title="Marché" tab right={<SettingsButton />}>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Rechercher un objet vendable"
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Rechercher un objet"
      />
      {searching ? (
        <SearchResults query={query} />
      ) : (
        <>
          <AlertsLink />
          <Watchlist />
        </>
      )}
    </Screen>
  );
}

function AlertsLink() {
  const alerts = useNotificationStore((s) => s.alerts);
  const active = alerts.filter((a) => a.enabled).length;
  return (
    <MenuEntry
      icon={GameIcons.marketBoard}
      title="Alertes de prix"
      subtitle="Être prévenu quand un objet passe sous un prix"
      status={alerts.length ? `${active} active${active > 1 ? 's' : ''}` : null}
      onPress={() => router.push('/notifications/marche')}
    />
  );
}

function SearchResults({ query }: { query: string }) {
  const theme = useTheme();
  const results = useQuery({
    queryKey: ['xivapi', 'search', query],
    queryFn: () => searchItems(query, { marketableOnly: true }),
  });
  if (results.isPending) return <Loading />;
  if (results.error) return <ErrorBox error={results.error} onRetry={() => results.refetch()} />;
  if (results.data.length === 0) return <Empty>Aucun objet vendable ne correspond.</Empty>;
  const plural = results.data.length > 1 ? 's' : '';
  return (
    <GameWindow icon={MenuIcons.objets} title="Résultats" subtitle={`${results.data.length} objet${plural} vendable${plural}`}>
      {results.data.map((item, i) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          onPress={() => openItem(item.id)}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
          <GameIcon uri={item.icon} size={40} />
          <View style={styles.rowText}>
            <ThemedText numberOfLines={1}>{item.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.category ?? 'Objet'}
            </ThemedText>
          </View>
          {item.itemLevel && item.itemLevel > 1 ? <Badge label={`niv. ${item.itemLevel}`} /> : null}
        </Pressable>
      ))}
    </GameWindow>
  );
}

function Watchlist() {
  const theme = useTheme();
  const scope = useAppStore((s) => s.marketScope);
  const watchlist = useAppStore((s) => s.watchlist);
  const ids = watchlist.map((w) => w.id);

  const prices = useQuery({
    queryKey: ['universalis', 'summaries', scope, ids],
    queryFn: () => getPriceSummaries(scope, ids),
    enabled: ids.length > 0,
  });
  const histories = useQuery({
    queryKey: ['universalis', 'histories', scope, ids, TREND_DAYS],
    queryFn: () => getHistories(scope, ids, TREND_DAYS),
    enabled: ids.length > 0,
  });

  if (watchlist.length === 0) {
    return (
      <GameWindow icon={GameIcons.gil} title="Favoris" subtitle="Aucun favori pour l’instant">
        <ThemedText type="small" themeColor="textSecondary">
          Cherche un objet, ouvre sa fiche et touche l’étoile : son prix et sa tendance apparaîtront ici.
        </ThemedText>
      </GameWindow>
    );
  }

  const priceById = new Map(prices.data?.map((p) => [p.itemId, p]));
  const refreshing = prices.isRefetching || histories.isRefetching;
  return (
    <GameWindow
      icon={GameIcons.gil}
      title="Favoris"
      subtitle={`${scope} · prix le plus bas et tendance sur ${TREND_DAYS} jours`}
      right={
        <Chip
          label={refreshing ? '…' : 'Actualiser'}
          disabled={refreshing}
          onPress={() => {
            prices.refetch();
            histories.refetch();
          }}
        />
      }>
      {prices.error ? <ErrorBox error={prices.error} onRetry={() => prices.refetch()} /> : null}
      <View>
        {watchlist.map((item, i) => (
          <WatchRow
            key={item.id}
            item={item}
            first={i === 0}
            loading={prices.isPending}
            price={priceById.get(item.id)?.minPrice ?? null}
            world={priceById.get(item.id)?.cheapestWorld ?? null}
            points={histories.data ? dailyPrices(histories.data.get(item.id) ?? [], TREND_DAYS) : []}
            borderColor={theme.border}
          />
        ))}
      </View>
    </GameWindow>
  );
}

function WatchRow({
  item,
  first,
  loading,
  price,
  world,
  points,
  borderColor,
}: {
  item: WatchedItem;
  first: boolean;
  loading: boolean;
  price: number | null;
  world: string | null;
  points: PricePoint[];
  borderColor: string;
}) {
  const trend = trendPercent(points);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatGil(price)}${trend !== null ? `, ${trend > 0 ? '+' : ''}${trend} % sur 7 jours` : ''}`}
      onPress={() => openItem(item.id)}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: borderColor }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={item.icon} size={44} />
      <View style={styles.rowText}>
        <ThemedText numberOfLines={2}>{item.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {world ? `Moins cher sur ${world}` : ' '}
        </ThemedText>
      </View>
      <View style={styles.priceCol}>
        <ThemedText type="smallBold">{loading ? '…' : formatGil(price)}</ThemedText>
        <View style={styles.trend}>
          <Sparkline points={points} width={48} height={20} />
          {trend !== null ? <Badge label={`${trend > 0 ? '▲ +' : trend < 0 ? '▼ ' : ''}${trend} %`} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, minHeight: 56 },
  rowText: { flex: 1, minWidth: 0 },
  priceCol: { alignItems: 'flex-end', gap: 4 },
  trend: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
