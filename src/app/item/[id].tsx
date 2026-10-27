import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { getDataCenters, getHistory, getMarket, regionLabel, type Listing, type Sale } from '@/api/universalis';
import { recipesForItems } from '@/api/crafting';
import { getItem } from '@/api/xivapi';
import { MenuIcon } from '@/components/game-ui';
import { CraftSection } from '@/components/item/craft-section';
import { FishSection } from '@/components/item/fish-section';
import { GatheringSection } from '@/components/item/gathering-section';
import { PriceChart } from '@/components/price-chart';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Empty, ErrorBox, GameIcon, Loading, Screen, Segmented, StatTile } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatAgo, formatGil, formatNumber, toMillis } from '@/utils/format';
import { dailyPrices } from '@/utils/prices';

type Scope = 'home' | 'region';
type Range = '7' | '30';
type ListTab = 'listings' | 'sales';

export default function ItemScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const theme = useTheme();
  const homeScope = useAppStore((s) => s.marketScope);
  const watched = useAppStore((s) => s.watchlist.some((w) => w.id === id));
  const toggleWatch = useAppStore((s) => s.toggleWatch);
  const [scopeKind, setScopeKind] = useState<Scope>('home');
  const [range, setRange] = useState<Range>('7');
  const [listTab, setListTab] = useState<ListTab>('listings');

  const item = useQuery({ queryKey: ['xivapi', 'item', id], queryFn: () => getItem(id), enabled: Number.isFinite(id) });
  const recipes = useQuery({ queryKey: ['craft', 'for-item', id], queryFn: () => recipesForItems([id]), enabled: Number.isFinite(id), staleTime: 24 * 3600_000 });
  const dataCenters = useQuery({ queryKey: ['universalis', 'data-centers'], queryFn: getDataCenters, staleTime: Infinity });

  // La région du centre de données choisi (ex. "Europe"), pour comparer avec les autres serveurs.
  const region = dataCenters.data?.find((dc) => dc.name === homeScope)?.region ?? null;
  const scope = scopeKind === 'region' && region ? region : homeScope;
  const marketable = item.data?.marketable === true;

  const market = useQuery({
    queryKey: ['universalis', 'market', scope, id],
    queryFn: () => getMarket(scope, id, 30, 30),
    enabled: Number.isFinite(id) && marketable,
  });
  const days = Number(range);
  const history = useQuery({
    queryKey: ['universalis', 'history', scope, id, days],
    queryFn: () => getHistory(scope, id, days),
    enabled: Number.isFinite(id) && marketable,
  });

  const cheapest = market.data?.listings[0];
  const points = history.data ? dailyPrices(history.data, days) : [];
  const refreshing = market.isRefetching || history.isRefetching;

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            market.refetch();
            history.refetch();
          }}
        />
      }>
      <Stack.Screen
        options={{
          title: item.data?.name ?? '',
          headerRight: item.data
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={watched ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                  hitSlop={12}
                  onPress={() => toggleWatch({ id, name: item.data.name, icon: item.data.icon })}>
                  <ThemedText type="subtitle" style={{ color: theme.accent }}>
                    {watched ? '★' : '☆'}
                  </ThemedText>
                </Pressable>
              )
            : undefined,
        }}
      />
      {item.isPending ? <Loading /> : null}
      {item.error ? <ErrorBox error={item.error} onRetry={() => item.refetch()} /> : null}
      {item.data ? (
        <>
          <View style={styles.header}>
            <GameIcon uri={item.data.icon} size={64} />
            <View style={{ flex: 1, gap: Spacing.half }}>
              <ThemedText type="subtitle">{item.data.name}</ThemedText>
              <View style={styles.badges}>
                {item.data.category ? <Badge label={item.data.category} /> : null}
                {item.data.itemLevel && item.data.itemLevel > 1 ? <Badge label={`niv. obj. ${item.data.itemLevel}`} tone="accent" /> : null}
              </View>
            </View>
          </View>
          {item.data.description ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
              {item.data.description}
            </ThemedText>
          ) : null}

          {/* Comment l'obtenir : la même fiche, qu'on arrive du marché, de la pêche, de la récolte ou de l'artisanat. */}
          {recipes.data ? <CraftSection recipes={recipes.data} /> : null}
          <GatheringSection id={id} />
          <FishSection id={id} />

          {marketable ? (
            <View style={styles.marketTitle}>
              <MenuIcon id={GameIcons.marketBoard} size={28} />
              <ThemedText type="display" style={{ color: theme.ornament }}>
                Marché
              </ThemedText>
            </View>
          ) : null}
          {!marketable ? (
            <Empty>Cet objet ne se vend pas au marché.</Empty>
          ) : (
            <>
              <Button
                label="Créer une alerte de prix"
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: '/alert', params: { itemId: String(id), name: item.data.name, icon: item.data.icon ?? '' } })
                }
              />
              {region ? (
                <Segmented
                  options={[
                    { value: 'home', label: homeScope },
                    { value: 'region', label: regionLabel(region) },
                  ]}
                  value={scopeKind}
                  onChange={setScopeKind}
                />
              ) : null}

              {market.isPending ? <Loading label="Lecture d’Universalis…" /> : null}
              {market.error ? <ErrorBox error={market.error} onRetry={() => market.refetch()} /> : null}
              {market.data ? (
                <>
                  <View style={styles.tiles}>
                    <StatTile
                      label="Moins cher"
                      value={formatGil(cheapest?.pricePerUnit ?? null)}
                      detail={
                        cheapest?.worldName ? (
                          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                            {cheapest.worldName}
                          </ThemedText>
                        ) : null
                      }
                    />
                    <StatTile
                      label="Ventes / jour"
                      value={formatNumber(market.data.regularSaleVelocity)}
                      detail={
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {formatNumber(market.data.unitsForSale)} en vente
                        </ThemedText>
                      }
                    />
                  </View>

                  <Card>
                    <View style={styles.chartHeader}>
                      <ThemedText type="smallBold">Prix de vente médian</ThemedText>
                      <View style={{ width: 120 }}>
                        <Segmented
                          options={[
                            { value: '7', label: '7 j' },
                            { value: '30', label: '30 j' },
                          ]}
                          value={range}
                          onChange={setRange}
                        />
                      </View>
                    </View>
                    {history.isPending ? (
                      <Loading />
                    ) : history.error ? (
                      <ErrorBox error={history.error} onRetry={() => history.refetch()} />
                    ) : (
                      <PriceChart points={points} days={days} />
                    )}
                    <ThemedText type="small" themeColor="textSecondary">
                      Touche la courbe pour lire un jour. Mis à jour {formatAgo(market.data.lastUploadTime ? toMillis(market.data.lastUploadTime) : null)}.
                    </ThemedText>
                  </Card>

                  <Segmented
                    options={[
                      { value: 'listings', label: `Annonces (${market.data.listings.length})` },
                      { value: 'sales', label: 'Ventes récentes' },
                    ]}
                    value={listTab}
                    onChange={setListTab}
                  />
                  {listTab === 'listings' ? (
                    market.data.listings.length === 0 ? (
                      <Empty>Aucune annonce en ce moment.</Empty>
                    ) : (
                      <Card style={styles.list}>
                        {market.data.listings.map((l, i) => (
                          <ListingRow key={`${l.retainerName}-${i}`} listing={l} first={i === 0} showWorld={scopeKind === 'region' || !market.data.worldName} />
                        ))}
                      </Card>
                    )
                  ) : market.data.recentHistory.length === 0 ? (
                    <Empty>Aucune vente récente connue.</Empty>
                  ) : (
                    <Card style={styles.list}>
                      {market.data.recentHistory.map((s, i) => (
                        <SaleRow key={`${s.timestamp}-${i}`} sale={s} first={i === 0} />
                      ))}
                    </Card>
                  )}
                  <Empty>Prix envoyés par les joueurs à Universalis : ils peuvent dater un peu.</Empty>
                </>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </Screen>
  );
}

function ListingRow({ listing, first, showWorld }: { listing: Listing; first: boolean; showWorld: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.badges}>
          <ThemedText type="smallBold">{formatGil(listing.pricePerUnit)}</ThemedText>
          {listing.hq ? <Badge label="HQ" /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[showWorld ? listing.worldName : null, listing.retainerName].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <ThemedText type="small">× {listing.quantity}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatGil(listing.total)}
        </ThemedText>
      </View>
    </View>
  );
}

function SaleRow({ sale, first }: { sale: Sale; first: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.badges}>
          <ThemedText type="smallBold">{formatGil(sale.pricePerUnit)}</ThemedText>
          {sale.hq ? <Badge label="HQ" /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[sale.worldName, formatAgo(toMillis(sale.timestamp))].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <ThemedText type="small">× {sale.quantity}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  marketTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  list: { gap: 0, paddingVertical: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
});
