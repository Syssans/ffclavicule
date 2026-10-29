/**
 * Ce qui est commun aux écrans Inventaire, Servants et Courrier : lecture des données du plugin, noms des objets,
 * cadre de l'écran (non connecté, chargement, erreur) et lignes d'objets.
 */
import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { getPrivate, type ItemStack, type PrivateSnapshot } from '@/api/private';
import { getItemSummaries, type ItemSummary } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Empty, ErrorBox, GameIcon, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatAgo, formatNumber } from '@/utils/format';
import { allItemIds } from '@/utils/inventory';

export type Names = Map<number, ItemSummary>;

/** Icônes du jeu de ces écrans. */
export const PrivateIcons = {
  inventory: 2,
  retainers: 61818,
  mailbox: 52118,
  letter: 53395,
  parcel: 26109,
  gil: 65002,
  venture: 65049,
} as const;

/** Données du plugin pour un personnage, et noms des objets qu'elles contiennent. */
export function usePrivateData(id: number) {
  const link = useAppStore((s) => s.privateLinks[id]);
  const data = useQuery({
    queryKey: ['private', id, link?.token],
    queryFn: () => getPrivate(id, link!.token),
    enabled: Boolean(link),
    refetchInterval: 60_000,
  });
  const ids = useMemo(() => (data.data ? allItemIds(data.data) : []), [data.data]);
  const names = useQuery({
    queryKey: ['xivapi', 'items', ids.join(',')],
    queryFn: () => getItemSummaries(ids),
    enabled: ids.length > 0,
    staleTime: Infinity,
  });
  return { link, data, names: names.data };
}

/** Cadre commun : titre, tirer pour actualiser, et les cas où il n'y a rien à montrer. */
export function PrivateScreen({
  id,
  title,
  children,
}: {
  id: number;
  title: string;
  children: (snapshot: PrivateSnapshot, names: Names | undefined) => ReactNode;
}) {
  const { link, data, names } = usePrivateData(id);
  if (!link) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty>
        <Button label="Connecter avec un code" onPress={() => router.replace({ pathname: '/connect', params: { id: String(id) } })} />
      </Screen>
    );
  }
  const snapshot = data.data;
  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => void data.refetch()} />}>
      <Stack.Screen options={{ title }} />
      {data.isPending ? <Loading label="Lecture de tes données…" /> : null}
      {data.error ? <ErrorBox error={data.error} onRetry={() => data.refetch()} /> : null}
      {snapshot === null ? (
        <Card>
          <ThemedText>Le plugin n’a pas encore envoyé tes données.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Vérifie dans /clavicule que « Envoyer inventaire, servants et courrier » est coché ; l’envoi se fait dans la minute.
          </ThemedText>
        </Card>
      ) : null}
      {snapshot ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {snapshot.name} · {snapshot.world} · relevé {formatAgo(Date.parse(snapshot.updatedAt))}
          </ThemedText>
          {children(snapshot, names)}
        </>
      ) : null}
    </Screen>
  );
}

export function ItemRow({
  stack,
  names,
  detail,
  note,
  first = false,
}: {
  stack: ItemStack;
  names?: Names;
  detail?: string | null;
  /** Ligne de plus sous le détail (prix du marché d'une annonce…). */
  note?: ReactNode;
  first?: boolean;
}) {
  const theme = useTheme();
  const info = names?.get(stack.id);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(stack.id) } })}
      style={({ pressed }) => [styles.itemRow, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={info?.icon} size={36} />
      <View style={styles.grow}>
        <ThemedText numberOfLines={1}>{info?.name ?? `Objet n° ${stack.id}`}</ThemedText>
        {detail ?? info?.category ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {detail ?? info?.category}
          </ThemedText>
        ) : null}
        {note}
      </View>
      {stack.hq ? <Badge label="HQ" tone="accent" /> : null}
      <ThemedText type="smallBold">×{formatNumber(stack.qty)}</ThemedText>
    </Pressable>
  );
}

/** Liste d'objets repliable : les longues listes n'affichent d'abord que les premiers. */
export function ItemList({ items, names, initial = 8 }: { items: ItemStack[]; names?: Names; initial?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <View>
      {shown.map((s, i) => (
        <ItemRow key={`${s.id}-${s.hq}-${i}`} stack={s} names={names} first={i === 0} />
      ))}
      {items.length > initial ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={styles.more}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {all ? 'Réduire' : `Tout afficher (${items.length})`}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  more: { paddingVertical: Spacing.two, alignItems: 'center' },
});
