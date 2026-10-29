/**
 * Servants d'un personnage connecté : missions, gil, ventes au marché (comparées aux autres vendeurs du monde)
 * et inventaire de chacun, et les alertes de vente envoyées par le service.
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { registerDevice } from '@/api/notify';
import { ventureStatus, type MarketListing, type RetainerInfo, type RetainerSale } from '@/api/private';
import { getBoards, type MarketData } from '@/api/universalis';
import { gameIconUrl } from '@/api/xivapi';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ItemList, ItemRow, PrivateIcons, PrivateScreen, type Names } from '@/components/private/shared';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, ErrorBox, GameIcon, ProgressBar, Segmented } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { JOBS } from '@/data/jobs';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { getPushToken, notificationsSupported } from '@/notifications/device';
import { cheapestOther, undercutPercent } from '@/shared/retainer-market';
import { useNotificationStore, type RetainerAlerts } from '@/store/notification-store';
import { formatAgo, formatGil, formatNumber } from '@/utils/format';

export default function RetainersScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return (
    <PrivateScreen id={id} title="Servants">
      {(snapshot, names) =>
        snapshot.retainers.length === 0 ? (
          <Empty>Aucun servant connu. Passe près d’une sonnette d’invocation pour les relever.</Empty>
        ) : (
          <Retainers characterId={id} world={snapshot.world} retainers={snapshot.retainers} sales={snapshot.sales ?? []} names={names} />
        )
      }
    </PrivateScreen>
  );
}

/** Position d'une annonce face aux autres vendeurs du monde. */
interface Standing {
  cheapest: number | null;
  percent: number;
}

/** Marché du monde pour tous les objets en vente, et la position de chaque annonce. */
function useStandings(world: string, retainers: RetainerInfo[]) {
  const ids = useMemo(() => [...new Set(retainers.flatMap((r) => (r.market ?? []).map((m) => m.id)))].sort((a, b) => a - b), [retainers]);
  const boards = useQuery({
    queryKey: ['universalis', 'boards', world, ids.join(',')],
    queryFn: () => getBoards(world, ids),
    enabled: ids.length > 0 && Boolean(world),
    staleTime: 5 * 60_000,
  });
  return useMemo(() => {
    const mine = new Set(retainers.map((r) => r.name));
    return (m: MarketListing): Standing | null => {
      const board: MarketData | undefined = boards.data?.get(m.id);
      if (!board) return null;
      const cheapest = cheapestOther({ lastUploadTime: board.lastUploadTime, listings: board.listings ?? [], recentHistory: [] }, m, mine);
      return { cheapest, percent: undercutPercent(m.price, cheapest) };
    };
  }, [boards.data, retainers]);
}

function Retainers({
  characterId,
  world,
  retainers,
  sales,
  names,
}: {
  characterId: number;
  world: string;
  retainers: RetainerInfo[];
  sales: RetainerSale[];
  names?: Names;
}) {
  const now = useNow(30_000);
  const theme = useTheme();
  const standing = useStandings(world, retainers);
  const total = retainers.reduce((sum, r) => sum + r.gil, 0);
  const selling = retainers.reduce((sum, r) => sum + r.marketItemCount, 0);
  const back = retainers.filter((r) => ventureStatus(r.ventureComplete, now)?.done).length;
  const beaten = retainers.flatMap((r) => r.market ?? []).filter((m) => (standing(m)?.percent ?? 0) > 0).length;
  return (
    <>
      <GameWindow
        icon={PrivateIcons.retainers}
        title="Sonnette d’invocation"
        subtitle={`${retainers.length} servant${retainers.length > 1 ? 's' : ''} · ${formatGil(total)} · ${selling} objet${selling > 1 ? 's' : ''} en vente`}>
        <View style={styles.summary}>
          <MenuIcon id={PrivateIcons.venture} size={28} />
          <ThemedText type="small" style={styles.grow}>
            {back > 0 ? `${back} mission${back > 1 ? 's' : ''} terminée${back > 1 ? 's' : ''} : passe à la sonnette.` : 'Aucune mission terminée pour l’instant.'}
          </ThemedText>
        </View>
        {beaten > 0 ? (
          <View style={styles.summary}>
            <MenuIcon id={GameIcons.marketBoard} size={28} />
            <ThemedText type="small" style={[styles.grow, { color: theme.danger }]}>
              {beaten > 1 ? `${beaten} annonces ne sont plus les moins chères` : '1 annonce n’est plus la moins chère'} sur {world}.
            </ThemedText>
          </View>
        ) : null}
      </GameWindow>
      <RecentSales sales={sales} names={names} now={now} />
      <SaleAlerts characterId={characterId} />
      {retainers.map((r) => (
        <RetainerWindow key={r.id} retainer={r} names={names} now={now} standing={standing} />
      ))}
    </>
  );
}

/** Ventes vues en direct par le plugin pendant qu'on joue (sept derniers jours). */
function RecentSales({ sales, names, now }: { sales: RetainerSale[]; names?: Names; now: number }) {
  const recent = sales
    .filter((s) => s.at * 1000 > now - 7 * 86_400_000)
    .slice(-10)
    .reverse();
  if (!recent.length) return null;
  return (
    <GameWindow icon={PrivateIcons.gil} title="Ventes récentes">
      {recent.map((s, i) => (
        <ItemRow
          key={`${s.at}-${s.id}-${i}`}
          stack={{ id: s.id, qty: s.qty || 1, hq: s.hq }}
          names={names}
          detail={[s.gil ? formatGil(s.gil) : s.qty ? formatGil(s.price * s.qty) : null, s.retainer || null, formatAgo(s.at * 1000, now)].filter(Boolean).join(' · ')}
          first={i === 0}
        />
      ))}
    </GameWindow>
  );
}

function StandingNote({ standing }: { standing: Standing | null }) {
  const theme = useTheme();
  if (!standing) return null;
  if (standing.percent > 0) {
    return (
      <ThemedText type="small" numberOfLines={1} style={[styles.note, { color: theme.danger }]}>
        Moins cher : {formatGil(standing.cheapest!)} (−{standing.percent} %)
      </ThemedText>
    );
  }
  return (
    <ThemedText type="small" numberOfLines={1} style={[styles.note, { color: theme.success }]}>
      {standing.cheapest === null ? 'Seul en vente' : 'Le moins cher'}
    </ThemedText>
  );
}

const UNDERCUTS = [
  { value: '0', label: 'Dès 1 gil' },
  { value: '5', label: '5 %' },
  { value: '10', label: '10 %' },
  { value: '30', label: '30 %' },
];
const STALE_DAYS = [
  { value: '3', label: '3 j' },
  { value: '5', label: '5 j' },
  { value: '7', label: '7 j' },
  { value: '14', label: '14 j' },
];

type Choices = { list: { value: string; label: string }[]; value: string; onChange: (value: string) => void };

/** Alertes de vente : le service prévient même appli et jeu fermés. */
function SaleAlerts({ characterId }: { characterId: number }) {
  const theme = useTheme();
  const saved = useNotificationStore((s) => s.retainerAlerts);
  const setAlerts = useNotificationStore((s) => s.setRetainerAlerts);
  const secret = useNotificationStore((s) => s.pushSecret);
  const setPushSecret = useNotificationStore((s) => s.setPushSecret);
  // Les alertes suivent un seul personnage : celui dont on règle les servants ici.
  const alerts: RetainerAlerts = saved.characterId === characterId && secret ? saved : { characterId, sold: false, undercut: null, stale: null };
  const enable = useMutation({
    mutationFn: async (patch: Partial<RetainerAlerts>) => {
      if (!useNotificationStore.getState().pushSecret) setPushSecret(await registerDevice(await getPushToken()));
      setAlerts({ ...alerts, ...patch, characterId });
    },
  });
  if (!notificationsSupported) return null;
  const change = (patch: Partial<RetainerAlerts>, on: boolean) => (on ? enable.mutate(patch) : setAlerts({ ...alerts, ...patch, characterId }));
  const rows: { key: string; label: string; on: boolean; toggle: (on: boolean) => void; options?: Choices }[] = [
    { key: 'sold', label: 'Objet vendu', on: alerts.sold, toggle: (on) => change({ sold: on }, on) },
    {
      key: 'undercut',
      label: 'Prix cassé',
      on: alerts.undercut !== null,
      toggle: (on) => change({ undercut: on ? 0 : null }, on),
      options: { list: UNDERCUTS, value: String(alerts.undercut ?? 0), onChange: (v) => setAlerts({ undercut: Number(v) }) },
    },
    {
      key: 'stale',
      label: 'Invendu depuis',
      on: alerts.stale !== null,
      toggle: (on) => change({ stale: on ? 5 : null }, on),
      options: { list: STALE_DAYS, value: String(alerts.stale ?? 5), onChange: (v) => setAlerts({ stale: Number(v) }) },
    },
  ];
  return (
    <GameWindow icon={GameIcons.marketBoard} title="Alertes de vente">
      {rows.map((r, i) => (
        <View key={r.key} style={[styles.alertRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
          <View style={styles.alertHead}>
            <ThemedText type="smallBold" style={styles.grow}>
              {r.label}
            </ThemedText>
            <Switch accessibilityLabel={r.label} value={r.on} disabled={enable.isPending} onValueChange={r.toggle} trackColor={{ true: theme.accent }} />
          </View>
          {r.on && r.options ? <Segmented options={r.options.list} value={r.options.value} onChange={r.options.onChange} /> : null}
        </View>
      ))}
      {enable.error ? <ErrorBox error={enable.error} /> : null}
    </GameWindow>
  );
}

function RetainerWindow({
  retainer,
  names,
  now,
  standing,
}: {
  retainer: RetainerInfo;
  names?: Names;
  now: number;
  standing: (m: MarketListing) => Standing | null;
}) {
  const job = JOBS.find((j) => j.id === retainer.classJob);
  const venture = ventureStatus(retainer.ventureComplete, now);
  const [open, setOpen] = useState(false);
  return (
    <GameWindow
      icon={retainer.classJob ? 62100 + retainer.classJob : PrivateIcons.retainers}
      title={retainer.name}
      subtitle={`${job ? job.name : 'Sans classe'} · niveau ${retainer.level}`}
      right={venture ? <Badge label={venture.done ? 'De retour' : venture.label.replace('Retour dans ', '')} tone={venture.done ? 'up' : 'neutral'} /> : null}>
      <View style={styles.stats}>
        <Stat icon={PrivateIcons.gil} label="Gil" value={formatNumber(retainer.gil)} />
        <Stat icon={PrivateIcons.inventory} label="Objets" value={`${retainer.itemCount}/175`} progress={retainer.itemCount / 175} />
        <Stat icon={60570} label="En vente" value={`${retainer.marketItemCount}/20`} progress={retainer.marketItemCount / 20} />
      </View>
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
                <View>
                  <ThemedText type="smallBold" themeColor="ornament">
                    En vente au marché
                  </ThemedText>
                  {retainer.market.map((m, i) => (
                    <ItemRow
                      key={`m-${m.id}-${i}`}
                      stack={m}
                      names={names}
                      detail={`${formatGil(m.price)} l’unité`}
                      note={<StandingNote standing={standing(m)} />}
                      first={i === 0}
                    />
                  ))}
                </View>
              ) : null}
              {retainer.items.length > 0 ? (
                <View>
                  <ThemedText type="smallBold" themeColor="ornament">
                    Inventaire
                  </ThemedText>
                  <ItemList items={retainer.items} names={names} initial={12} />
                </View>
              ) : (
                <Empty>Inventaire vide.</Empty>
              )}
              {retainer.crystals && retainer.crystals.length > 0 ? <ItemList items={retainer.crystals} names={names} initial={0} /> : null}
            </>
          ) : null}
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Ouvre ce servant une fois à la sonnette pour voir son inventaire ici.
        </ThemedText>
      )}
    </GameWindow>
  );
}

function Stat({ icon, label, value, progress }: { icon: number; label: string; value: string; progress?: number }) {
  return (
    <View style={styles.stat}>
      <GameIcon uri={gameIconUrl(icon)} size={24} />
      <View style={styles.grow}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {label}
        </ThemedText>
        <ThemedText type="smallBold" numberOfLines={1}>
          {value}
        </ThemedText>
        {progress !== undefined ? <ProgressBar value={progress} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.one },
  more: { paddingVertical: Spacing.one, alignItems: 'center' },
  note: { fontSize: 13, lineHeight: 17 },
  alertRow: { gap: Spacing.two, paddingVertical: Spacing.two },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
