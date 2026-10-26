/** Tous les poissons : recherche, filtres (gros poissons, harpon, ouverts maintenant, manquants), triés par fenêtre. */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FishingIcons, FishRow, itemName, statusRank, useCaughtFish, useFishStatuses, zoneOf } from '@/components/fishing';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Chip, Empty, Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useNow } from '@/hooks/use-now';
import { fishingData } from '@/utils/fishing';
import { fold } from '@/utils/inventory';

type Filter = 'all' | 'big' | 'open' | 'spear' | 'missing';

const PAGE = 60;

export default function FishListScreen() {
  const now = useNow(1000);
  const statuses = useFishStatuses(now);
  const { caught } = useCaughtFish();
  const [text, setText] = useState('');
  const query = fold(useDebounced(text.trim(), 250));
  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE);

  const list = useMemo(() => {
    const words = query.split(/\s+/).filter(Boolean);
    return fishingData()
      .fish.filter((f) => {
        if (filter === 'big' && !f.big) return false;
        if (filter === 'spear' && !f.g) return false;
        if (filter === 'open' && statuses.get(f.id)?.kind !== 'open') return false;
        if (filter === 'missing' && (!caught || caught.ids.has(f.id))) return false;
        if (words.length === 0) return true;
        const { spot, zone } = zoneOf(f);
        const hay = fold(`${itemName(f.id)} ${zone?.n ?? ''} ${spot?.n ?? ''} ${zone?.r ?? ''}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => statusRank(statuses.get(a.id)) - statusRank(statuses.get(b.id)));
  }, [query, filter, statuses, caught]);

  return (
    <Screen>
      <Input
        value={text}
        onChangeText={(t) => {
          setText(t);
          setShown(PAGE);
        }}
        placeholder="Poisson, zone ou coin de pêche"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher un poisson"
      />
      <View style={styles.chips}>
        <Chip label="Tous" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <Chip label="Gros poissons" selected={filter === 'big'} onPress={() => setFilter('big')} />
        <Chip label="Ouverts" selected={filter === 'open'} onPress={() => setFilter('open')} />
        <Chip label="Harpon" selected={filter === 'spear'} onPress={() => setFilter('spear')} />
        {caught ? <Chip label="Manquants" selected={filter === 'missing'} onPress={() => setFilter('missing')} /> : null}
      </View>
      {list.length === 0 ? (
        <Empty>Aucun poisson ne correspond.</Empty>
      ) : (
        <GameWindow icon={FishingIcons.fisher} title="Poissons" subtitle={`${list.length} · les ouverts d’abord, puis les plus proches`}>
          {list.slice(0, shown).map((f, i) => (
            <FishRow key={f.id} fish={f} status={statuses.get(f.id)} now={now} caught={caught ? caught.ids.has(f.id) : null} first={i === 0} />
          ))}
          {list.length > shown ? (
            <Chip label={`Afficher plus (${list.length - shown})`} onPress={() => setShown(shown + PAGE)} />
          ) : null}
        </GameWindow>
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Heures en heure d’Éorzéa ; les comptes à rebours sont en temps réel.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
