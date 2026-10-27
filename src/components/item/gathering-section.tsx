/** Partie « Récolte » de la fiche d'un objet : métier, niveau, points de récolte avec leurs horaires et la carte. */
import { StyleSheet, View } from 'react-native';

import { NodeRow, useGatheredItems, useNodeStatuses } from '@/components/gathering';
import { GameWindow } from '@/components/game-ui';
import { Badge } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { gatherableItems, GATHERER_NAME, jobOf, nodeKey } from '@/utils/gathering';

export function isGatherable(id: number): boolean {
  return gatherableItems().has(id);
}

export function GatheringSection({ id }: { id: number }) {
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const { gathered } = useGatheredItems();
  const item = gatherableItems().get(id);
  if (!item) return null;
  const jobs = [...new Set(item.nodes.map(jobOf))];

  return (
    <GameWindow
      icon={MenuIcons.recolte}
      title="Récolte"
      subtitle={`${jobs.map((j) => GATHERER_NAME[j]).join(' ou ')} niv. ${item.level}${item.stars ? ` ${'★'.repeat(item.stars)}` : ''} · ${item.nodes.length} point${item.nodes.length > 1 ? 's' : ''}`}>
      {gathered || item.hidden ? (
        <View style={styles.badges}>
          {gathered ? <Badge label={gathered.ids.has(id) ? 'Déjà récolté' : 'Pas encore récolté'} tone={gathered.ids.has(id) ? 'up' : 'neutral'} /> : null}
          {item.hidden ? <Badge label="Caché (révélé par une compétence)" /> : null}
        </View>
      ) : null}
      {item.nodes.map((n, i) => (
        <NodeRow key={nodeKey(n)} node={n} status={statuses.get(nodeKey(n))} now={now} first={i === 0} />
      ))}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
