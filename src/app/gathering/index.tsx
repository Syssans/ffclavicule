/** Module Récolte : points à horaires ouverts et bientôt, et les entrées du module. */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { NodeRow, nodeRank, useGatheredItems, useNodeStatuses } from '@/components/gathering';
import { GameWindow, MenuEntry, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Empty, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { gatherableItems, gatheringData, isTimed, nodeKey } from '@/utils/gathering';
import { formatEorzeaTime } from '@/utils/timers';

export default function GatheringScreen() {
  const theme = useTheme();
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const { gathered } = useGatheredItems();
  const data = gatheringData();
  const timed = data.nodes.filter(isTimed).sort((a, b) => nodeRank(statuses.get(nodeKey(a))) - nodeRank(statuses.get(nodeKey(b))));
  const open = timed.filter((n) => statuses.get(nodeKey(n))?.kind === 'open');
  const soon = timed.filter((n) => statuses.get(nodeKey(n))?.kind === 'soon').slice(0, 6);

  return (
    <Screen>
      <View style={[styles.clock, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
        <MenuIcon id={MenuIcons.calendrier} size={40} />
        <View style={styles.flex}>
          <ThemedText type="small" themeColor="textSecondary">
            Heure d’Éorzéa
          </ThemedText>
          <ThemedText type="display" style={[styles.time, { color: theme.ornament }]}>
            {formatEorzeaTime(now)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.side}>
          {open.length} point{open.length > 1 ? 's' : ''} rare{open.length > 1 ? 's' : ''} ouvert{open.length > 1 ? 's' : ''}
        </ThemedText>
      </View>

      <GameWindow icon={MenuIcons.recolte} title="Ouverts maintenant" subtitle="Points légendaires, immaculés et éphémères">
        {open.length === 0 ? <Empty>Aucun point rare ouvert pour l’instant.</Empty> : null}
        {open.map((n, i) => (
          <NodeRow key={nodeKey(n)} node={n} status={statuses.get(nodeKey(n))} now={now} first={i === 0} />
        ))}
      </GameWindow>
      {soon.length > 0 ? (
        <GameWindow icon={MenuIcons.calendrier} title="Bientôt">
          {soon.map((n, i) => (
            <NodeRow key={nodeKey(n)} node={n} status={statuses.get(nodeKey(n))} now={now} first={i === 0} />
          ))}
        </GameWindow>
      ) : null}

      <MenuEntry icon={MenuIcons.recolte} title="Points à horaires" subtitle={`${timed.length} points : filtrer par type et par métier`} onPress={() => router.push('/gathering/timed')} />
      <MenuEntry
        icon={MenuIcons.objets}
        title="Où récolter"
        subtitle={`${gatherableItems().size} objets récoltables : métier, niveau, zone, coordonnées`}
        onPress={() => router.push('/gathering/items')}
      />
      <MenuEntry
        icon={MenuIcons.recolte}
        title="Carnet de récolte"
        subtitle="Ce que tu as déjà récolté et ce qu’il te manque"
        status={gathered ? `${gathered.ids.size} / ${gathered.total}` : null}
        onPress={() => router.push('/gathering/log')}
      />
      <MenuEntry icon={62116} title="Guide du Mineur" subtitle="Ton niveau, tes mandats, quoi récolter" onPress={() => router.push({ pathname: '/gathering/job/[job]', params: { job: 'miner' } })} />
      <MenuEntry
        icon={62117}
        title="Guide du Botaniste"
        subtitle="Ton niveau, tes mandats, quoi récolter"
        onPress={() => router.push({ pathname: '/gathering/job/[job]', params: { job: 'botanist' } })}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Données du jeu. Mises à jour le {new Date(data.updatedAt).toLocaleDateString('fr-FR')}.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  clock: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three, borderRadius: 14, borderWidth: 1 },
  time: { fontSize: 28, lineHeight: 34 },
  side: { maxWidth: 120, textAlign: 'right' },
});
