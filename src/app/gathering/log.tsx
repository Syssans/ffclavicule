/** Carnet de récolte (plugin) : objets récoltés et manquants, par métier, avec ceux récoltables maintenant. */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ItemRow, useGatheredItems, useNodeStatuses } from '@/components/gathering';
import { GameWindow, MenuIcon, ProgressRing } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Empty, Loading, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { gatherableItems, GATHERER_CLASS, GATHERER_NAME, inGatheringLog, isTimed, jobOf, nodeKey, type GathererJob } from '@/utils/gathering';
import { formatNumber } from '@/utils/format';

type Filter = 'now' | 'missing' | 'gathered';

export default function GatheringLogScreen() {
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const { gathered, linked, loading, name } = useGatheredItems();
  const [filter, setFilter] = useState<Filter>('now');
  const [job, setJob] = useState<GathererJob | 'all'>('all');
  const [shown, setShown] = useState(60);

  const perJob = useMemo(() => {
    const out: Record<GathererJob, { have: number; total: number }> = { miner: { have: 0, total: 0 }, botanist: { have: 0, total: 0 } };
    if (!gathered) return out;
    for (const it of gatherableItems().values()) {
      if (!inGatheringLog(it)) continue;
      const j = jobOf(it.nodes[0]);
      out[j].total++;
      if (gathered.ids.has(it.itemId)) out[j].have++;
    }
    return out;
  }, [gathered]);

  const list = useMemo(() => {
    if (!gathered) return [];
    return [...gatherableItems().values()]
      .filter(inGatheringLog)
      .filter((it) => job === 'all' || it.nodes.some((n) => jobOf(n) === job))
      .filter((it) => {
        const has = gathered.ids.has(it.itemId);
        if (filter === 'gathered') return has;
        if (has) return false;
        if (filter === 'now') return it.nodes.some((n) => !isTimed(n) || statuses.get(nodeKey(n))?.kind === 'open');
        return true;
      })
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'fr'));
  }, [gathered, filter, job, statuses]);

  if (!linked) {
    return (
      <Screen>
        <GameWindow icon={MenuIcons.recolte} title="Carnet de récolte">
          <ThemedText type="small">
            Le plugin lit ton carnet de récolte dans le jeu : l’appli te montre ce qu’il te manque, et ce que tu peux récolter tout de suite.
          </ThemedText>
          <Button label="Connecter mon personnage" variant="secondary" onPress={() => router.push('/connect')} />
        </GameWindow>
      </Screen>
    );
  }
  if (loading) return <Loading label="Lecture de ton carnet…" />;
  if (!gathered) {
    return (
      <Screen>
        <Empty>Le plugin n’a pas encore envoyé ton carnet de récolte : mets-le à jour et connecte-toi en jeu, l’envoi se fait dans la minute.</Empty>
      </Screen>
    );
  }

  return (
    <Screen>
      <GameWindow icon={MenuIcons.recolte} title="Carnet de récolte" subtitle={name}>
        <View style={styles.jobs}>
          {(['miner', 'botanist'] as GathererJob[]).map((j) => (
            <View key={j} style={styles.job}>
              <ProgressRing value={perJob[j].total ? perJob[j].have / perJob[j].total : 0} size={64} stroke={4}>
                <MenuIcon id={62100 + GATHERER_CLASS[j]} size={34} />
              </ProgressRing>
              <ThemedText type="smallBold">{GATHERER_NAME[j]}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatNumber(perJob[j].have)} / {formatNumber(perJob[j].total)}
              </ThemedText>
            </View>
          ))}
        </View>
      </GameWindow>
      <View style={styles.chips}>
        <Chip label="Manquants récoltables maintenant" selected={filter === 'now'} onPress={() => setFilter('now')} />
        <Chip label="Tous les manquants" selected={filter === 'missing'} onPress={() => setFilter('missing')} />
        <Chip label="Récoltés" selected={filter === 'gathered'} onPress={() => setFilter('gathered')} />
      </View>
      <View style={styles.chips}>
        <Chip label="Les deux métiers" selected={job === 'all'} onPress={() => setJob('all')} />
        <Chip label="Mineur" selected={job === 'miner'} onPress={() => setJob('miner')} />
        <Chip label="Botaniste" selected={job === 'botanist'} onPress={() => setJob('botanist')} />
      </View>
      {list.length === 0 ? (
        <Empty>Aucun objet.</Empty>
      ) : (
        <GameWindow icon={MenuIcons.objets} title="Objets">
          {list.slice(0, shown).map((it, i) => (
            <ItemRow key={it.itemId} item={it} gathered={gathered.ids.has(it.itemId)} first={i === 0} />
          ))}
          {list.length > shown ? <Chip label={`Afficher plus (${list.length - shown})`} onPress={() => setShown(shown + 60)} /> : null}
        </GameWindow>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  jobs: { flexDirection: 'row', justifyContent: 'space-around' },
  job: { alignItems: 'center', gap: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
});
