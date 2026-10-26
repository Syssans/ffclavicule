/** Où récolter : recherche parmi tous les objets récoltables (Mineur, Botaniste), triés par niveau. */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ItemRow, useGatheredItems } from '@/components/gathering';
import { GameWindow } from '@/components/game-ui';
import { Chip, Empty, Input, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { gatherableItems, gatheringData, isTimed, jobOf, type GathererJob } from '@/utils/gathering';
import { fold } from '@/utils/inventory';

const PAGE = 60;

export default function GatherableItemsScreen() {
  const [text, setText] = useState('');
  const query = fold(useDebounced(text.trim(), 250));
  const [job, setJob] = useState<GathererJob | 'all'>('all');
  const [timedOnly, setTimedOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const { gathered } = useGatheredItems();

  const list = useMemo(() => {
    const words = query.split(/\s+/).filter(Boolean);
    const zones = gatheringData().zones;
    return [...gatherableItems().values()]
      .filter((it) => job === 'all' || it.nodes.some((n) => jobOf(n) === job))
      .filter((it) => !timedOnly || it.nodes.some(isTimed))
      .filter((it) => {
        if (!words.length) return true;
        const hay = fold(`${it.name} ${it.nodes.map((n) => zones[String(n.z)]?.n ?? '').join(' ')}`);
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr'));
  }, [query, job, timedOnly]);

  return (
    <Screen>
      <Input
        value={text}
        onChangeText={(t) => {
          setText(t);
          setShown(PAGE);
        }}
        placeholder="Objet ou zone (ex. minerai de mithril)"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher un objet récoltable"
      />
      <View style={styles.chips}>
        <Chip label="Les deux métiers" selected={job === 'all'} onPress={() => setJob('all')} />
        <Chip label="Mineur" selected={job === 'miner'} onPress={() => setJob('miner')} />
        <Chip label="Botaniste" selected={job === 'botanist'} onPress={() => setJob('botanist')} />
        <Chip label="À horaires" selected={timedOnly} onPress={() => setTimedOnly(!timedOnly)} />
      </View>
      {list.length === 0 ? (
        <Empty>Aucun objet récoltable ne correspond.</Empty>
      ) : (
        <GameWindow icon={MenuIcons.objets} title="Objets" subtitle={`${list.length}`}>
          {list.slice(0, shown).map((it, i) => (
            <ItemRow key={it.itemId} item={it} gathered={gathered ? gathered.ids.has(it.itemId) : null} first={i === 0} />
          ))}
          {list.length > shown ? <Chip label={`Afficher plus (${list.length - shown})`} onPress={() => setShown(shown + PAGE)} /> : null}
        </GameWindow>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
