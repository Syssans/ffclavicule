/** Fiche d'un point de récolte : métier, niveau, zone et coordonnées, horaires et prochaines fenêtres, objets. */
import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { localTime } from '@/components/fishing';
import { coords, ItemRow, jobIcon, nodeStatusLabel, useGatheredItems, zoneName } from '@/components/gathering';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { gatheringData, GATHERER_NAME, isTimed, jobOf, KIND_LABEL, kindOf, nodeItems, nodeKey, nodeStatus, nodeWindows, scheduleText } from '@/utils/gathering';
import { formatCountdown } from '@/utils/timers';

export default function NodeScreen() {
  const theme = useTheme();
  const key = useLocalSearchParams<{ key: string }>().key;
  const now = useNow(1000);
  const { gathered } = useGatheredItems();
  const node = gatheringData().nodes.find((n) => nodeKey(n) === key);
  if (!node) {
    return (
      <Screen>
        <Empty>Point introuvable.</Empty>
      </Screen>
    );
  }
  const kind = kindOf(node);
  const items = nodeItems(node);
  const label = nodeStatusLabel(nodeStatus(node, now), now);
  const windows = isTimed(node) ? nodeWindows(node, now, 5) : [];
  const zone = gatheringData().zones[String(node.z)];

  return (
    <Screen>
      <Stack.Screen options={{ title: `${KIND_LABEL[kind]} · ${zoneName(node)}` }} />
      <GameWindow icon={jobIcon(node)} title={zoneName(node)} subtitle={[node.p, coords(node), zone?.r].filter(Boolean).join(' · ')}>
        <View style={styles.badges}>
          <Badge label={`${GATHERER_NAME[jobOf(node)]} niv. ${node.l}`} />
          <Badge label={KIND_LABEL[kind]} tone={kind === 'legendary' ? 'accent' : 'neutral'} />
          {isTimed(node) ? <Badge label={label.text} tone={label.tone} /> : null}
        </View>
        {node.fl ? (
          <ThemedText type="small" themeColor="textSecondary">
            Livre de légendes requis : {node.fl}
          </ThemedText>
        ) : null}
      </GameWindow>

      {isTimed(node) ? (
        <GameWindow icon={MenuIcons.calendrier} title="Horaires" subtitle={`${scheduleText(node)} (heure d’Éorzéa)`}>
          {windows.map((w, i) => (
            <View key={w.start} style={[styles.window, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <ThemedText type="smallBold" style={styles.flex}>
                {w.start <= now ? 'Maintenant' : localTime(w.start, now)}
              </ThemedText>
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

      <GameWindow icon={MenuIcons.objets} title="Objets" subtitle={`${items.length} objet${items.length > 1 ? 's' : ''}`}>
        {items.map((it, i) => (
          <ItemRow key={it.itemId} item={it} gathered={gathered ? gathered.ids.has(it.itemId) : null} first={i === 0} />
        ))}
      </GameWindow>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  window: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  count: { minWidth: 80, textAlign: 'right' },
});
