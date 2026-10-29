/** Un type de contrat de chasse : celui qu'on a en main (plugin) et toutes les cibles possibles, avec leur position. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { GameWindow } from '@/components/game-ui';
import { TargetRow } from '@/components/hunt';
import { ThemedText } from '@/components/themed-text';
import { Empty, Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useHunt } from '@/hooks/use-hunt';
import { useNow } from '@/hooks/use-now';
import { billByIndex, billTargets, EXPANSION_NAMES, huntTarget, markName, placeName, targetMapName } from '@/utils/hunt';

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function HuntBillScreen() {
  const { index } = useLocalSearchParams<{ index: string }>();
  const bill = billByIndex(Number(index));
  const now = useNow(60_000);
  const { bills } = useHunt(now);
  const [query, setQuery] = useState('');
  if (!bill) {
    return (
      <Screen>
        <Empty>Contrat inconnu.</Empty>
      </Screen>
    );
  }
  const held = bills.find((b) => b.k === bill.k);
  const order = held ? (bill.orders[String(held.row)] ?? []) : [];
  const q = fold(query.trim());
  const targets = billTargets(bill)
    .filter(({ target }) => !q || fold(`${markName(target.n)} ${targetMapName(target)} ${placeName(target.p)}`).includes(q))
    .sort(
      (a, b) =>
        targetMapName(a.target).localeCompare(targetMapName(b.target), 'fr') || markName(a.target.n).localeCompare(markName(b.target.n), 'fr'),
    );
  // Regroupées par carte, comme on les chasse.
  const groups = new Map<string, typeof targets>();
  for (const t of targets) {
    const key = targetMapName(t.target) || 'Ailleurs';
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: bill.type === 'elite' ? 'Contrat d’élite' : 'Contrats quotidiens' }} />
      <GameWindow
        image={gameIconUrl(bill.i)}
        title={bill.n}
        subtitle={[EXPANSION_NAMES[bill.x], bill.qn ? `débloqué par « ${bill.qn} »` : null].filter(Boolean).join(' · ')}>
        <ThemedText type="small" themeColor="textSecondary">
          {bill.type === 'elite'
            ? 'Chaque semaine, un contrat tiré parmi ces rangs B. Touche une cible pour la voir sur la carte.'
            : 'Chaque jour, un contrat tiré parmi ces cibles. Touche une cible pour la voir sur la carte.'}
        </ThemedText>
      </GameWindow>

      {held ? (
        <GameWindow title="En main" subtitle="Relevé par le plugin">
          {order.map(([id, needed], i) => {
            const target = huntTarget(id);
            return target ? <TargetRow key={id} target={target} kills={held.needed[i] ?? needed} progress={held.kills[i] ?? 0} /> : null;
          })}
        </GameWindow>
      ) : null}

      <Input placeholder="Chercher une cible ou une zone" value={query} onChangeText={setQuery} />
      {targets.length === 0 ? <Empty>Aucune cible ne correspond.</Empty> : null}
      {[...groups].map(([map, list]) => (
        <View key={map} style={styles.group}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {map}
          </ThemedText>
          {list.map(({ id, target, kills }) => (
            <TargetRow key={id} target={target} kills={kills} showMap={false} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.half },
});
