/** Une zone de chasse : ses marques, comment faire apparaître le rang S, délais de retour et points sur la carte. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GameWindow, MenuIcon } from '@/components/game-ui';
import { MarkRow, RankBadge } from '@/components/hunt';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Empty, ListRow, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useHunt } from '@/hooks/use-hunt';
import { useNow } from '@/hooks/use-now';
import { killKey } from '@/store/hunt-store';
import {
  EXPANSION_NAMES,
  hoursText,
  huntZone,
  mainMarks,
  respawnWindow,
  spawnPoints,
  sRankNote,
  ssRankNote,
  zoneName,
  type HuntMark,
} from '@/utils/hunt';
import { itemById } from '@/utils/items-index';
import { mapForTerritory } from '@/utils/map';

export default function HuntZoneScreen() {
  const { territory: raw } = useLocalSearchParams<{ territory: string }>();
  const territory = Number(raw);
  const zone = huntZone(territory);
  const now = useNow(30_000);
  const { kills, world } = useHunt(now);
  if (!zone) {
    return (
      <Screen>
        <Empty>Zone inconnue.</Empty>
      </Screen>
    );
  }
  const byKey = new Map(kills.map((k) => [killKey(k), k]));
  const marks = mainMarks(zone);
  const of = (rank: HuntMark['r']) => marks.filter((m) => m.r === rank);
  const row = (m: HuntMark) => (
    <MarkRow
      key={`${m.r}-${m.n}`}
      mark={m}
      territory={territory}
      kill={byKey.get(killKey({ world, territory, mark: m.n }))}
      world={world}
      now={now}
      hint={false}
    />
  );
  const note = sRankNote(territory);
  const sWindow = respawnWindow('S', territory);
  const aWindow = respawnWindow('A', territory);
  const points = spawnPoints(territory);
  const mapId = mapForTerritory(territory);
  const ss = zone.x >= 3 ? ssRankNote(zone.x) : undefined;

  return (
    <Screen>
      <Stack.Screen options={{ title: zoneName(territory) }} />
      <ThemedText type="small" themeColor="textSecondary">
        {EXPANSION_NAMES[zone.x]}
        {world ? ` · morts notées pour ${world}` : ''}
      </ThemedText>

      <GameWindow title="Rang S" glyph={<RankBadge rank="S" size={36} />}>
        {of('S').map(row)}
        {note ? (
          <View style={styles.note}>
            <View style={styles.noteHead}>
              <ThemedText type="smallBold">Comment le faire apparaître</ThemedText>
              {note.theory ? <Badge label="Non confirmé" tone="down" /> : null}
            </View>
            <ThemedText>{note.how}</ThemedText>
            {note.items?.map((id) => {
              const item = itemById(id);
              return item ? (
                <ListRow
                  key={id}
                  image={item.icon}
                  title={item.name}
                  subtitle={item.category}
                  onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(id) } })}
                />
              ) : null;
            })}
          </View>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {sWindow
            ? `Revient ${hoursText(sWindow.window)} après sa mort${sWindow.afterMaintenance ? `, ${hoursText(sWindow.afterMaintenance)} après une maintenance` : ''}. Même fenêtre ouverte, il n’apparaît qu’une fois sa condition remplie.`
            : 'Délai de retour propre à cette marque, mal connu. Il n’apparaît qu’une fois sa condition remplie.'}
        </ThemedText>
      </GameWindow>

      <GameWindow title="Rang A" glyph={<RankBadge rank="A" size={36} />}>
        {of('A').map(row)}
        {aWindow ? (
          <ThemedText type="small" themeColor="textSecondary">
            Revient {hoursText(aWindow.window)} après sa mort
            {aWindow.afterMaintenance ? `, ${hoursText(aWindow.afterMaintenance)} après une maintenance` : ''}, sans condition.
          </ThemedText>
        ) : null}
      </GameWindow>

      <GameWindow title="Rang B" glyph={<RankBadge rank="B" size={36} />}>
        {of('B').map(row)}
        <ThemedText type="small" themeColor="textSecondary">
          Revient peu après sa mort, sur un autre point. Cible des contrats d’élite.
        </ThemedText>
      </GameWindow>

      {ss ? (
        <GameWindow title="Rang SS" glyph={<RankBadge rank="SS" size={36} />}>
          {of('SS').map(row)}
          <ThemedText type="small">{ss}</ThemedText>
        </GameWindow>
      ) : null}

      {mapId !== undefined && points.length > 0 ? (
        <View style={styles.mapRow}>
          <MenuIcon id={MenuIcons.carte} size={40} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{points.length} points d’apparition</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Où peuvent paraître les rangs B, A et S de la zone.
            </ThemedText>
          </View>
          <Button label="Carte" onPress={() => router.push({ pathname: '/map', params: { map: String(mapId), layer: 'hunts' } })} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  note: { gap: Spacing.one },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
