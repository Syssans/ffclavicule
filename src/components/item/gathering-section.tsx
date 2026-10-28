/** Partie « Récolte » de la fiche d'un objet : où le récolter, quand, et ce qu'on trouve au même endroit. */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { localTime } from '@/components/fishing';
import { coords, jobIcon, nodeStatusLabel, useGatheredItems, useNodeStatuses, zoneName } from '@/components/gathering';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, GameIcon } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import {
  gatherableItems,
  GATHERER_NAME,
  isTimed,
  jobOf,
  KIND_LABEL,
  kindOf,
  nodeItems,
  nodeKey,
  nodeWindows,
  scheduleText,
  type GatheringNode,
} from '@/utils/gathering';
import { findGatheringNode } from '@/utils/map';
import { formatCountdown } from '@/utils/timers';

export function isGatherable(id: number): boolean {
  return gatherableItems().has(id);
}

export function GatheringSection({ id }: { id: number }) {
  const theme = useTheme();
  const now = useNow(1000);
  const statuses = useNodeStatuses(now);
  const { gathered } = useGatheredItems();
  const item = gatherableItems().get(id);
  if (!item) return null;

  const timed = item.nodes.filter(isTimed);
  // Prochaines fenêtres de tous les points à horaires de l'objet, dans l'ordre.
  const windows = timed
    .flatMap((node) => nodeWindows(node, now, 4).map((w) => ({ ...w, node })))
    .sort((a, b) => a.start - b.start)
    .slice(0, 5);
  const schedules = [...new Set(timed.map(scheduleText).filter(Boolean))];
  // Les autres objets des mêmes points.
  const neighbours = [
    ...new Map(
      item.nodes
        .flatMap(nodeItems)
        .filter((it) => it.itemId !== id)
        .map((it) => [it.itemId, it]),
    ).values(),
  ];

  return (
    <>
      <GameWindow icon={MenuIcons.recolte} title={item.nodes.length > 1 ? 'Lieux' : 'Lieu'}>
        {gathered || item.hidden ? (
          <View style={styles.badges}>
            {gathered ? (
              <Badge label={gathered.ids.has(id) ? 'Déjà récolté' : 'Pas encore récolté'} tone={gathered.ids.has(id) ? 'up' : 'neutral'} />
            ) : null}
            {item.hidden ? <Badge label="Caché" /> : null}
          </View>
        ) : null}
        {item.nodes.map((node, i) => (
          <NodePlace
            key={nodeKey(node)}
            node={node}
            first={i === 0}
            label={isTimed(node) ? nodeStatusLabel(statuses.get(nodeKey(node)), now) : null}
            stars={item.stars}
          />
        ))}
      </GameWindow>

      {timed.length ? (
        <GameWindow icon={MenuIcons.calendrier} title="Quand">
          {schedules.map((s) => (
            <View key={s} style={styles.line}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                Heures d’Éorzéa
              </ThemedText>
              <ThemedText type="smallBold">{s}</ThemedText>
            </View>
          ))}
          <ThemedText type="smallBold" style={{ color: theme.ornament, marginTop: Spacing.one }}>
            Prochaines fenêtres
          </ThemedText>
          {windows.map((w, i) => (
            <View
              key={`${nodeKey(w.node)}-${w.start}`}
              style={[styles.window, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <View style={styles.flex}>
                <ThemedText type="smallBold">{w.start <= now ? 'Maintenant' : localTime(w.start, now)}</ThemedText>
                {timed.length > 1 ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {zoneName(w.node)}
                  </ThemedText>
                ) : null}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {Math.round((w.end - w.start) / 60_000)} min
              </ThemedText>
              <ThemedText type="smallBold" style={[styles.count, { color: w.start <= now ? theme.success : theme.ornament }]}>
                {w.start <= now ? `encore ${formatCountdown(w.end - now)}` : formatCountdown(w.start - now)}
              </ThemedText>
            </View>
          ))}
        </GameWindow>
      ) : null}

      {neighbours.length ? (
        <GameWindow icon={MenuIcons.objets} title="Au même endroit">
          <View style={styles.neighbours}>
            {neighbours.map((it) => (
              <Pressable
                key={it.itemId}
                accessibilityRole="button"
                accessibilityLabel={it.name}
                onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(it.itemId) } })}
                style={({ pressed }) => [styles.neighbour, pressed && { opacity: 0.6 }]}>
                <GameIcon uri={gameIconUrl(it.icon)} size={36} />
                <ThemedText type="small" numberOfLines={2} style={styles.neighbourName}>
                  {it.name}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </GameWindow>
      ) : null}
    </>
  );
}

/** Un point de récolte : zone, lieu-dit et coordonnées, métier et niveau, état, bouton vers la carte. */
function NodePlace({
  node,
  first,
  label,
  stars,
}: {
  node: GatheringNode;
  first: boolean;
  label: { text: string; tone: 'up' | 'accent' | 'neutral' } | null;
  stars: number;
}) {
  const theme = useTheme();
  const kind = kindOf(node);
  const onMap = findGatheringNode(node);
  return (
    <View style={[styles.place, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border, paddingTop: Spacing.two }]}>
      <View style={styles.placeHead}>
        <MenuIcon id={jobIcon(node)} size={32} />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {zoneName(node)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {[node.p, coords(node)].filter(Boolean).join(' · ')}
          </ThemedText>
        </View>
      </View>
      <View style={styles.badges}>
        <Badge label={`${GATHERER_NAME[jobOf(node)]} niv. ${node.l}${stars ? ` ${'★'.repeat(stars)}` : ''}`} />
        {kind !== 'regular' ? <Badge label={KIND_LABEL[kind]} tone={kind === 'legendary' ? 'accent' : 'neutral'} /> : null}
        {label ? <Badge label={label.text} tone={label.tone} /> : null}
      </View>
      {node.fl ? (
        <ThemedText type="small" themeColor="textSecondary">
          Livre de légendes : {node.fl}
        </ThemedText>
      ) : null}
      {onMap ? (
        <Button
          label="Voir sur la carte"
          variant="secondary"
          onPress={() =>
            router.push({ pathname: '/map', params: { map: String(onMap.mapId), x: String(Math.round(onMap.x)), y: String(Math.round(onMap.y)) } })
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  place: { gap: Spacing.two },
  placeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  window: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  count: { minWidth: 80, textAlign: 'right' },
  neighbours: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  neighbour: { width: '25%', alignItems: 'center', gap: 2 },
  neighbourName: { fontSize: 11, lineHeight: 14, textAlign: 'center' },
});
