/** Inventaire, servants et courrier d'un personnage connecté (données envoyées par le plugin). */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { disconnect, getPrivate, ventureStatus, type ItemStack, type Letter, type PrivateSnapshot, type RetainerInfo } from '@/api/private';
import { gameIconUrl, getItemSummaries, type ItemSummary } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Empty, ErrorBox, GameIcon, Input, Loading, Screen, Section, Segmented, StatTile } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { JOBS } from '@/data/jobs';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatAgo, formatGil, formatNumber } from '@/utils/format';
import { allItemIds, findItems } from '@/utils/inventory';

type Tab = 'inventory' | 'retainers' | 'mail';

const TABS: { value: Tab; label: string }[] = [
  { value: 'inventory', label: 'Inventaire' },
  { value: 'retainers', label: 'Servants' },
  { value: 'mail', label: 'Courrier' },
];

type Names = Map<number, ItemSummary>;

export default function PrivateScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const link = useAppStore((s) => s.privateLinks[id]);
  const setPrivateLink = useAppStore((s) => s.setPrivateLink);
  const [tab, setTab] = useState<Tab>('inventory');

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

  const leave = async () => {
    if (link) await disconnect(id, link.token);
    setPrivateLink(id, null);
    router.back();
  };

  if (!link) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Données privées' }} />
        <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty>
        <Button label="Connecter avec un code" onPress={() => router.replace({ pathname: '/connect', params: { id: String(id) } })} />
      </Screen>
    );
  }

  const snapshot = data.data;
  return (
    <Screen refreshControl={<RefreshControl refreshing={data.isRefetching} onRefresh={() => data.refetch()} />}>
      <Stack.Screen options={{ title: snapshot?.name ?? 'Données privées' }} />
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
            {snapshot.world} · mis à jour {formatAgo(Date.parse(snapshot.updatedAt))}
          </ThemedText>
          <View style={styles.hudLinks}>
            <View style={styles.grow}>
              <Button label="ATH du jeu" variant="secondary" onPress={() => router.push({ pathname: '/hud/[id]', params: { id: String(id) } })} />
            </View>
            <View style={styles.grow}>
              <Button
                label="Barres d’actions"
                variant="secondary"
                onPress={() => router.push({ pathname: '/hotbars/[id]', params: { id: String(id) } })}
              />
            </View>
          </View>
          <Segmented options={TABS} value={tab} onChange={setTab} />
          {tab === 'inventory' ? <InventoryTab snapshot={snapshot} names={names.data} /> : null}
          {tab === 'retainers' ? <RetainersTab retainers={snapshot.retainers} names={names.data} /> : null}
          {tab === 'mail' ? <MailTab mail={snapshot.mail} names={names.data} /> : null}
        </>
      ) : null}
      <Button label="Déconnecter ce téléphone" variant="danger" onPress={leave} />
    </Screen>
  );
}

function ItemRow({ stack, names, detail }: { stack: ItemStack; names?: Names; detail?: string | null }) {
  const theme = useTheme();
  const info = names?.get(stack.id);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(stack.id) } })}
      style={({ pressed }) => [styles.itemRow, { borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={info?.icon} size={36} />
      <View style={styles.grow}>
        <ThemedText numberOfLines={1}>{info?.name ?? `Objet n° ${stack.id}`}</ThemedText>
        {detail ?? info?.category ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {detail ?? info?.category}
          </ThemedText>
        ) : null}
      </View>
      {stack.hq ? <Badge label="HQ" tone="accent" /> : null}
      <ThemedText type="smallBold">×{formatNumber(stack.qty)}</ThemedText>
    </Pressable>
  );
}

/** Liste d'objets repliable : les longues listes n'affichent d'abord que les premiers. */
function ItemList({ items, names, initial = 8 }: { items: ItemStack[]; names?: Names; initial?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, initial);
  return (
    <Card style={styles.list}>
      {shown.map((s) => (
        <ItemRow key={`${s.id}-${s.hq}`} stack={s} names={names} />
      ))}
      {items.length > initial ? (
        <Pressable accessibilityRole="button" onPress={() => setAll(!all)} style={styles.more}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {all ? 'Réduire' : `Tout afficher (${items.length})`}
          </ThemedText>
        </Pressable>
      ) : null}
    </Card>
  );
}

const CURRENCIES: Record<string, string> = {
  mgp: 'PGS',
  companySeals: 'Sceaux de compagnie',
  wolfMarks: 'Marques de loup',
  alliedSeals: 'Sceaux alliés',
};

function InventoryTab({ snapshot, names }: { snapshot: PrivateSnapshot; names?: Names }) {
  const [query, setQuery] = useState('');
  const found = useMemo(() => (names && query.trim() ? findItems(snapshot, names, query) : null), [snapshot, names, query]);
  const currencies = Object.entries(snapshot.currencies).filter(([key, value]) => CURRENCIES[key] && value > 0);

  return (
    <>
      <View style={styles.tiles}>
        <StatTile label="Gil" value={formatGil(snapshot.gil)} />
        {currencies.slice(0, 1).map(([key, value]) => (
          <StatTile key={key} label={CURRENCIES[key]} value={formatNumber(value)} />
        ))}
      </View>
      {currencies.length > 1 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {currencies
            .slice(1)
            .map(([key, value]) => `${CURRENCIES[key]} : ${formatNumber(value)}`)
            .join(' · ')}
        </ThemedText>
      ) : null}
      <Input
        value={query}
        onChangeText={setQuery}
        placeholder="Chercher un objet (sacs, sacoches, servants…)"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher un objet"
      />
      {found ? (
        found.length === 0 ? (
          <Empty>Aucun objet ne correspond.</Empty>
        ) : (
          <Card style={styles.list}>
            {found.map((f, i) => (
              <ItemRow key={`${f.place}-${f.id}-${f.hq}-${i}`} stack={f} names={names} detail={f.place} />
            ))}
          </Card>
        )
      ) : (
        snapshot.inventories.map((group) => (
          <Section key={group.key} title={`${group.label} · ${group.items.length}`}>
            {group.items.length === 0 ? <Empty>Vide.</Empty> : <ItemList items={group.items} names={names} />}
          </Section>
        ))
      )}
      {!snapshot.inventories.some((g) => g.key.startsWith('sacoche')) ? (
        <ThemedText type="small" themeColor="textSecondary">
          Sacoches de chocobo : ouvre-les une fois en jeu pour qu’elles apparaissent ici.
        </ThemedText>
      ) : null}
    </>
  );
}

function RetainerCard({ retainer, names }: { retainer: RetainerInfo; names?: Names }) {
  const job = JOBS.find((j) => j.id === retainer.classJob);
  const venture = ventureStatus(retainer.ventureComplete);
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <View style={styles.retainerHead}>
        <GameIcon uri={retainer.classJob ? gameIconUrl(62100 + retainer.classJob) : null} size={40} />
        <View style={styles.grow}>
          <ThemedText type="smallBold">{retainer.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {job ? job.name : 'Sans classe'} · niveau {retainer.level}
          </ThemedText>
        </View>
        {venture ? <Badge label={venture.label} tone={venture.done ? 'up' : 'neutral'} /> : null}
      </View>
      <ThemedText type="small">
        {formatGil(retainer.gil)} · {retainer.itemCount}/175 objets · {retainer.marketItemCount}/20 en vente
      </ThemedText>
      {retainer.items ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={styles.more}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {open ? 'Masquer' : 'Voir'} l’inventaire et les ventes · vus {formatAgo(retainer.seenAt ? Date.parse(retainer.seenAt) : null)}
            </ThemedText>
          </Pressable>
          {open ? (
            <>
              {retainer.market && retainer.market.length > 0 ? (
                <Card style={styles.list}>
                  {retainer.market.map((m, i) => (
                    <ItemRow key={`m-${m.id}-${i}`} stack={m} names={names} detail={`En vente : ${formatGil(m.price)} l’unité`} />
                  ))}
                </Card>
              ) : null}
              {retainer.items.length > 0 ? <ItemList items={retainer.items} names={names} initial={12} /> : <Empty>Inventaire vide.</Empty>}
              {retainer.crystals && retainer.crystals.length > 0 ? <ItemList items={retainer.crystals} names={names} initial={0} /> : null}
            </>
          ) : null}
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Ouvre ce servant une fois à la sonnette pour voir son inventaire ici.
        </ThemedText>
      )}
    </Card>
  );
}

function RetainersTab({ retainers, names }: { retainers: RetainerInfo[]; names?: Names }) {
  if (retainers.length === 0) {
    return <Empty>Aucun servant connu. Passe près d’une sonnette d’invocation pour les relever.</Empty>;
  }
  const total = retainers.reduce((sum, r) => sum + r.gil, 0);
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {retainers.length} servant{retainers.length > 1 ? 's' : ''} · {formatGil(total)} au total
      </ThemedText>
      {retainers.map((r) => (
        <RetainerCard key={r.id} retainer={r} names={names} />
      ))}
    </>
  );
}

function LetterCard({ letter, names }: { letter: Letter; names?: Names }) {
  const date = new Date(letter.timestamp * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Card>
      <View style={styles.retainerHead}>
        <View style={styles.grow}>
          <ThemedText type="smallBold">
            {letter.read ? '' : '● '}
            {letter.sender || 'Expéditeur inconnu'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {date}
          </ThemedText>
        </View>
        {letter.gil > 0 ? <Badge label={formatGil(letter.gil)} tone="accent" /> : null}
      </View>
      {letter.preview ? <ThemedText type="small">{letter.preview}</ThemedText> : null}
      {letter.attachments.map((a) => (
        <ItemRow key={a.id} stack={a} names={names} detail="Pièce jointe" />
      ))}
    </Card>
  );
}

function MailTab({ mail, names }: { mail: PrivateSnapshot['mail']; names?: Names }) {
  if (!mail) return <Empty>Ouvre ta boîte aux lettres en jeu pour que ton courrier apparaisse ici.</Empty>;
  const unread = mail.letters.filter((l) => !l.read).length;
  return (
    <>
      <ThemedText type="small" themeColor="textSecondary">
        {mail.letters.length} lettre{mail.letters.length > 1 ? 's' : ''}
        {unread ? ` dont ${unread} non lue${unread > 1 ? 's' : ''}` : ''} · relevé {formatAgo(Date.parse(mail.updatedAt))}
      </ThemedText>
      {mail.letters.length === 0 ? <Empty>Boîte aux lettres vide.</Empty> : null}
      {mail.letters.map((l, i) => (
        <LetterCard key={`${l.timestamp}-${i}`} letter={l} names={names} />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  hudLinks: { flexDirection: 'row', gap: Spacing.two },
  grow: { flex: 1, minWidth: 0 },
  list: { gap: 0, paddingVertical: Spacing.one },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  more: { paddingVertical: Spacing.two, alignItems: 'center' },
  tiles: { flexDirection: 'row', gap: Spacing.two },
  retainerHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
