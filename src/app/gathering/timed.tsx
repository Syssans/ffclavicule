/** Points à horaires : légendaires, immaculés et éphémères, filtrés par type et par métier, les ouverts d'abord. */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NodeRow, nodeRank, useNodeStatuses } from '@/components/gathering';
import { GameWindow } from '@/components/game-ui';
import { Chip, Empty, Input, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { gatheringData, isTimed, jobOf, kindOf, nodeItems, nodeKey, type GathererJob, type NodeKind } from '@/utils/gathering';
import { fold } from '@/utils/inventory';

export default function TimedNodesScreen() {
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const [kind, setKind] = useState<NodeKind | 'all'>('all');
  const [job, setJob] = useState<GathererJob | 'all'>('all');
  const [text, setText] = useState('');
  const words = fold(text.trim()).split(/\s+/).filter(Boolean);
  const d = gatheringData();

  const nodes = d.nodes
    .filter(isTimed)
    .filter((n) => (kind === 'all' || kindOf(n) === kind) && (job === 'all' || jobOf(n) === job))
    .filter((n) => {
      if (!words.length) return true;
      const hay = fold(`${nodeItems(n).map((i) => i.name).join(' ')} ${d.zones[String(n.z)]?.n ?? ''} ${n.p}`);
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => nodeRank(statuses.get(nodeKey(a))) - nodeRank(statuses.get(nodeKey(b))));

  return (
    <Screen>
      <Input value={text} onChangeText={setText} placeholder="Objet ou zone" clearButtonMode="while-editing" accessibilityLabel="Chercher un point" />
      <View style={styles.chips}>
        <Chip label="Tous" selected={kind === 'all'} onPress={() => setKind('all')} />
        <Chip label="Légendaires" selected={kind === 'legendary'} onPress={() => setKind('legendary')} />
        <Chip label="Immaculés" selected={kind === 'unspoiled'} onPress={() => setKind('unspoiled')} />
        <Chip label="Éphémères" selected={kind === 'ephemeral'} onPress={() => setKind('ephemeral')} />
      </View>
      <View style={styles.chips}>
        <Chip label="Les deux métiers" selected={job === 'all'} onPress={() => setJob('all')} />
        <Chip label="Mineur" selected={job === 'miner'} onPress={() => setJob('miner')} />
        <Chip label="Botaniste" selected={job === 'botanist'} onPress={() => setJob('botanist')} />
      </View>
      {nodes.length === 0 ? (
        <Empty>Aucun point ne correspond.</Empty>
      ) : (
        <GameWindow icon={MenuIcons.recolte} title="Points" subtitle={`${nodes.length} · les ouverts d’abord, puis les plus proches`}>
          {nodes.map((n, i) => (
            <NodeRow key={nodeKey(n)} node={n} status={statuses.get(nodeKey(n))} now={now} first={i === 0} />
          ))}
        </GameWindow>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
