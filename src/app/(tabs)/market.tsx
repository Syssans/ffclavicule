import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Empty, ErrorBox, Input, ListRow, Loading, Screen, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { getPriceSummaries } from '@/api/universalis';
import { searchItems } from '@/api/xivapi';
import { useDebounced } from '@/hooks/use-debounced';
import { useAppStore } from '@/store/app-store';
import { formatGil } from '@/utils/format';

function openItem(id: number) {
  router.push({ pathname: '/item/[id]', params: { id: String(id) } });
}

export default function MarketScreen() {
  const scope = useAppStore((s) => s.marketScope);
  const watchlist = useAppStore((s) => s.watchlist);
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 400);

  const results = useQuery({
    queryKey: ['xivapi', 'search', query],
    queryFn: () => searchItems(query, { marketableOnly: true }),
    enabled: query.length >= 2,
  });

  const prices = useQuery({
    queryKey: ['universalis', 'summaries', scope, watchlist.map((w) => w.id)],
    queryFn: () => getPriceSummaries(scope, watchlist.map((w) => w.id)),
    enabled: watchlist.length > 0,
  });
  const priceById = new Map(prices.data?.map((p) => [p.itemId, p]));

  return (
    <Screen
      title="Marché"
      tab
      refreshControl={<RefreshControl refreshing={prices.isRefetching} onRefresh={() => void prices.refetch()} />}>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Rechercher un objet vendable"
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Rechercher un objet"
      />

      {query.length >= 2 ? (
        <Section title="Résultats">
          {results.isFetching ? <Loading /> : null}
          {results.error ? <ErrorBox error={results.error} onRetry={() => results.refetch()} /> : null}
          {results.data && !results.isFetching ? (
            results.data.length === 0 ? (
              <Empty>Aucun objet vendable ne correspond.</Empty>
            ) : (
              <View style={{ gap: Spacing.two }}>
                {results.data.map((item) => (
                  <ListRow
                    key={item.id}
                    image={item.icon}
                    title={item.name}
                    subtitle={[item.category, item.itemLevel ? `niv. obj. ${item.itemLevel}` : null].filter(Boolean).join(' · ')}
                    onPress={() => openItem(item.id)}
                  />
                ))}
              </View>
            )
          ) : null}
        </Section>
      ) : null}

      <Section title={`Favoris · ${scope}`}>
        {watchlist.length === 0 ? (
          <Empty>Ajoute des objets en favori depuis leur fiche pour suivre leur prix ici.</Empty>
        ) : (
          <View style={{ gap: Spacing.two }}>
            {prices.error ? <ErrorBox error={prices.error} onRetry={() => prices.refetch()} /> : null}
            {watchlist.map((item) => {
              const price = priceById.get(item.id);
              return (
                <ListRow
                  key={item.id}
                  image={item.icon}
                  title={item.name}
                  subtitle={price?.cheapestWorld ? `Moins cher sur ${price.cheapestWorld}` : null}
                  right={
                    <ThemedText type="smallBold">
                      {prices.isPending ? '…' : formatGil(price?.minPrice ?? null)}
                    </ThemedText>
                  }
                  onPress={() => openItem(item.id)}
                />
              );
            })}
          </View>
        )}
      </Section>
    </Screen>
  );
}
