import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty, ErrorBox, InfoRow, Loading, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getDataCenters, getMarket, regionLabel, type Listing, type Sale } from '@/api/universalis';
import { getItem } from '@/api/xivapi';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatAgo, formatGil, formatNumber, toMillis } from '@/utils/format';

type Scope = 'home' | 'region';

export default function ItemScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const theme = useTheme();
  const homeScope = useAppStore((s) => s.marketScope);
  const watched = useAppStore((s) => s.watchlist.some((w) => w.id === id));
  const toggleWatch = useAppStore((s) => s.toggleWatch);
  const [scopeKind, setScopeKind] = useState<Scope>('home');

  const item = useQuery({ queryKey: ['xivapi', 'item', id], queryFn: () => getItem(id), enabled: Number.isFinite(id) });
  const dataCenters = useQuery({ queryKey: ['universalis', 'data-centers'], queryFn: getDataCenters, staleTime: Infinity });

  // La région du centre de données choisi (ex. "Europe"), pour comparer avec les autres serveurs.
  const region = dataCenters.data?.find((dc) => dc.name === homeScope)?.region ?? null;
  const scope = scopeKind === 'region' && region ? region : homeScope;

  const market = useQuery({
    queryKey: ['universalis', 'market', scope, id],
    queryFn: () => getMarket(scope, id),
    enabled: Number.isFinite(id) && item.data?.marketable === true,
  });

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={market.isRefetching} onRefresh={() => void market.refetch()} />
      }>
      <Stack.Screen options={{ title: item.data?.name ?? '' }} />
      {item.isPending ? <Loading /> : null}
      {item.error ? <ErrorBox error={item.error} onRetry={() => item.refetch()} /> : null}
      {item.data ? (
        <>
          <View style={styles.header}>
            <Image source={item.data.icon ?? undefined} style={[styles.icon, { backgroundColor: theme.backgroundElement }]} />
            <View style={{ flex: 1 }}>
              <ThemedText type="subtitle">{item.data.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {[item.data.category, item.data.itemLevel ? `niv. obj. ${item.data.itemLevel}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          </View>
          {item.data.description ? (
            <ThemedText type="small" themeColor="textSecondary">
              {item.data.description}
            </ThemedText>
          ) : null}
          <Button
            label={watched ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            variant={watched ? 'secondary' : 'primary'}
            onPress={() => toggleWatch({ id, name: item.data.name, icon: item.data.icon })}
          />

          {!item.data.marketable ? (
            <Empty>Cet objet ne se vend pas au marché.</Empty>
          ) : (
            <>
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
              {market.isPending ? <Loading label="Lecture d'Universalis…" /> : null}
              {market.error ? <ErrorBox error={market.error} onRetry={() => market.refetch()} /> : null}
              {market.data ? (
                <>
                  <Card>
                    <InfoRow label="Prix le plus bas" value={formatGil(market.data.minPrice || null)} />
                    <InfoRow label="Prix moyen vendu" value={formatGil(Math.round(market.data.averagePrice) || null)} />
                    <InfoRow label="Ventes par jour" value={formatNumber(market.data.regularSaleVelocity)} />
                    <InfoRow label="Unités en vente" value={formatNumber(market.data.unitsForSale)} />
                    <InfoRow label="Mis à jour" value={formatAgo(market.data.lastUploadTime ? toMillis(market.data.lastUploadTime) : null)} />
                  </Card>
                  <Section title="Annonces">
                    {market.data.listings.length === 0 ? (
                      <Empty>Aucune annonce en ce moment.</Empty>
                    ) : (
                      <Card>
                        {market.data.listings.map((l, i) => (
                          <ListingRow key={`${l.retainerName}-${i}`} listing={l} showWorld={scope !== market.data.worldName} />
                        ))}
                      </Card>
                    )}
                  </Section>
                  <Section title="Ventes récentes">
                    {market.data.recentHistory.length === 0 ? (
                      <Empty>Aucune vente récente connue.</Empty>
                    ) : (
                      <Card>
                        {market.data.recentHistory.map((s, i) => (
                          <SaleRow key={`${s.timestamp}-${i}`} sale={s} />
                        ))}
                      </Card>
                    )}
                  </Section>
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

function ListingRow({ listing, showWorld }: { listing: Listing; showWorld: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <ThemedText type="small">
          {formatGil(listing.pricePerUnit)} × {listing.quantity}
          {listing.hq ? ' · HQ' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[showWorld ? listing.worldName : null, listing.retainerName].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{formatGil(listing.total)}</ThemedText>
    </View>
  );
}

function SaleRow({ sale }: { sale: Sale }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <ThemedText type="small">
          {formatGil(sale.pricePerUnit)} × {sale.quantity}
          {sale.hq ? ' · HQ' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[sale.worldName, formatAgo(toMillis(sale.timestamp))].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 56, height: 56, borderRadius: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
