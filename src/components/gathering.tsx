/** Éléments de la récolte : ligne de point, ligne d'objet, état (ouvert, bientôt), carnet lu par le plugin. */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { useMainCharacter } from '@/components/home';
import { MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, GameIcon } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePrivate } from '@/hooks/use-private';
import { useTheme } from '@/hooks/use-theme';
import {
  gatheringData,
  GATHERER_CLASS,
  isTimed,
  jobOf,
  KIND_LABEL,
  kindOf,
  nodeItems,
  nodeKey,
  nodeStatus,
  scheduleText,
  type GatherableItem,
  type GatheringNode,
  type NodeStatus,
} from '@/utils/gathering';
import { formatCountdown } from '@/utils/timers';

export function jobIcon(node: GatheringNode): number {
  return 62100 + GATHERER_CLASS[jobOf(node)];
}

export function zoneName(node: GatheringNode): string {
  return gatheringData().zones[String(node.z)]?.n ?? '—';
}

export function coords(node: GatheringNode): string {
  return node.c ? `X ${node.c[0]} · Y ${node.c[1]}` : '';
}

/** État des points à horaires, recalculé une fois par minute. */
export function useNodeStatuses(now: number): Map<string, NodeStatus> {
  const minute = Math.floor(now / 60_000) * 60_000;
  return useMemo(() => {
    const out = new Map<string, NodeStatus>();
    for (const n of gatheringData().nodes) if (isTimed(n)) out.set(nodeKey(n), nodeStatus(n, minute));
    return out;
  }, [minute]);
}

export function nodeStatusLabel(status: NodeStatus | undefined, now: number): { text: string; tone: 'up' | 'accent' | 'neutral' } {
  if (!status || status.kind === 'always') return { text: 'Toujours', tone: 'neutral' };
  if (status.kind === 'open') return { text: `Ouvert · ${formatCountdown(status.until - now)}`, tone: 'up' };
  return { text: `Dans ${formatCountdown(status.at - now)}`, tone: 'accent' };
}

export function nodeRank(status: NodeStatus | undefined): number {
  if (!status || status.kind === 'always') return 1e15;
  return status.kind === 'open' ? status.until - 1e15 : status.at;
}

/** Objets récoltés par le personnage principal (carnet lu par le plugin), ou null sans plugin. */
export function useGatheredItems() {
  const main = useMainCharacter();
  const { link, query } = usePrivate(main?.id ?? Number.NaN);
  const gathered = useMemo(() => {
    const col = query.data?.collections?.find((c) => c.key === 'gathering');
    return col ? { ids: new Set(col.owned.map((o) => o.id)), total: col.total } : null;
  }, [query.data]);
  return { gathered, linked: Boolean(link), loading: Boolean(link) && query.isPending, name: main?.name ?? null };
}

export function NodeRow({ node, status, now, first }: { node: GatheringNode; status?: NodeStatus; now: number; first?: boolean }) {
  const theme = useTheme();
  const kind = kindOf(node);
  const items = nodeItems(node);
  const label = nodeStatusLabel(status, now);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[kind]}, ${zoneName(node)}, ${items.map((i) => i.name).join(', ')}, ${label.text}`}
      onPress={() => router.push({ pathname: '/gathering/node/[key]', params: { key: nodeKey(node) } })}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <View>
        <GameIcon uri={items[0] ? gameIconUrl(items[0].icon) : null} size={40} />
        <View style={styles.jobBadge}>
          <MenuIcon id={jobIcon(node)} size={18} />
        </View>
      </View>
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1} style={kind === 'legendary' ? { color: theme.ornament, fontWeight: '700' } : undefined}>
          {items.map((i) => i.name).join(', ')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
          {KIND_LABEL[kind]} niv. {node.l} · {zoneName(node)}
          {node.c ? ` (${coords(node)})` : ''}
        </ThemedText>
        {scheduleText(node) ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
            {scheduleText(node)} (Éorzéa)
          </ThemedText>
        ) : null}
      </View>
      {isTimed(node) ? <Badge label={label.text} tone={label.tone} /> : null}
    </Pressable>
  );
}

export function ItemRow({ item, gathered, first }: { item: GatherableItem; gathered?: boolean | null; first?: boolean }) {
  const theme = useTheme();
  const jobs = [...new Set(item.nodes.map(jobOf))];
  const timed = item.nodes.some(isTimed);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/gathering/item/[id]', params: { id: String(item.itemId) } })}
      style={({ pressed }) => [styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={gameIconUrl(item.icon)} size={36} dimmed={gathered === true} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1}>
          {item.name}
          {gathered ? '  ✓' : ''}
        </ThemedText>
        <View style={styles.meta}>
          {jobs.map((j) => (
            <MenuIcon key={j} id={62100 + GATHERER_CLASS[j]} size={16} />
          ))}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
            Niv. {item.level}
            {item.stars ? ` ${'★'.repeat(item.stars)}` : ''} · {zoneName(item.nodes[0])}
            {item.nodes.length > 1 ? ` (+${item.nodes.length - 1})` : ''}
          </ThemedText>
        </View>
      </View>
      {timed ? <Badge label="À horaires" tone="accent" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  jobBadge: { position: 'absolute', right: -4, bottom: -4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
