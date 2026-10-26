/** Fiche d'un objet récoltable : où et quand le récolter, prix au marché, recettes qui l'utilisent. */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { getPriceSummaries } from '@/api/universalis';
import { gameIconUrl } from '@/api/xivapi';
import { NodeRow, useGatheredItems, useNodeStatuses } from '@/components/gathering';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Empty, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useAppStore } from '@/store/app-store';
import { gatherableItems, GATHERER_NAME, jobOf, nodeKey } from '@/utils/gathering';
import { formatGil } from '@/utils/format';

export default function GatherableItemScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const scope = useAppStore((s) => s.marketScope);
  const { gathered } = useGatheredItems();
  const item = gatherableItems().get(id);
  const price = useQuery({
    queryKey: ['universalis', 'summary', scope, id],
    queryFn: () => getPriceSummaries(scope, [id]),
    enabled: Boolean(item?.marketable),
  });

  if (!item) {
    return (
      <Screen>
        <Empty>Cet objet ne se récolte pas (ou pas dans les données de récolte).</Empty>
        <Button label="Voir la fiche de l’objet" onPress={() => router.replace({ pathname: '/item/[id]', params: { id: String(id) } })} />
      </Screen>
    );
  }
  const jobs = [...new Set(item.nodes.map(jobOf))];
  const summary = price.data?.[0];

  return (
    <Screen>
      <Stack.Screen options={{ title: item.name }} />
      <GameWindow
        image={gameIconUrl(item.icon)}
        title={item.name}
        subtitle={`${jobs.map((j) => GATHERER_NAME[j]).join(' ou ')} niv. ${item.level}${item.stars ? ` ${'★'.repeat(item.stars)}` : ''}`}>
        <View style={styles.badges}>
          {gathered ? <Badge label={gathered.ids.has(id) ? 'Déjà récolté' : 'Pas encore récolté'} tone={gathered.ids.has(id) ? 'up' : 'neutral'} /> : null}
          {item.hidden ? <Badge label="Caché (révélé par une compétence)" /> : null}
        </View>
      </GameWindow>

      <GameWindow icon={MenuIcons.recolte} title="Où le récolter" subtitle={`${item.nodes.length} point${item.nodes.length > 1 ? 's' : ''}`}>
        {item.nodes.map((n, i) => (
          <NodeRow key={nodeKey(n)} node={n} status={statuses.get(nodeKey(n))} now={now} first={i === 0} />
        ))}
      </GameWindow>

      {item.marketable ? (
        <GameWindow icon={GameIcons.marketBoard} title="Au marché" subtitle={scope}>
          {summary?.minPrice ? (
            <ThemedText type="small">
              Le moins cher : <ThemedText type="smallBold">{formatGil(summary.minPrice)}</ThemedText>
              {summary.cheapestWorld ? ` sur ${summary.cheapestWorld}` : ''} · {Math.round(summary.velocity * 10) / 10} ventes/jour
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              {price.isPending ? 'Lecture des prix…' : 'Aucune vente en cours.'}
            </ThemedText>
          )}
          <Button label="Voir au marché" variant="secondary" onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(id) } })} />
        </GameWindow>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
