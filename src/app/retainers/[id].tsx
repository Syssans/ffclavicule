/** Servants d'un personnage connecté : missions, gil, ventes au marché et inventaire de chacun. */
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ventureStatus, type RetainerInfo } from '@/api/private';
import { gameIconUrl } from '@/api/xivapi';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ItemList, ItemRow, PrivateIcons, PrivateScreen, type Names } from '@/components/private/shared';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, GameIcon, ProgressBar } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { JOBS } from '@/data/jobs';
import { useNow } from '@/hooks/use-now';
import { formatAgo, formatGil, formatNumber } from '@/utils/format';

export default function RetainersScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  return (
    <PrivateScreen id={id} title="Servants">
      {(snapshot, names) =>
        snapshot.retainers.length === 0 ? (
          <Empty>Aucun servant connu. Passe près d’une sonnette d’invocation pour les relever.</Empty>
        ) : (
          <Retainers retainers={snapshot.retainers} names={names} />
        )
      }
    </PrivateScreen>
  );
}

function Retainers({ retainers, names }: { retainers: RetainerInfo[]; names?: Names }) {
  const now = useNow(30_000);
  const total = retainers.reduce((sum, r) => sum + r.gil, 0);
  const selling = retainers.reduce((sum, r) => sum + r.marketItemCount, 0);
  const back = retainers.filter((r) => ventureStatus(r.ventureComplete, now)?.done).length;
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
      </GameWindow>
      {retainers.map((r) => (
        <RetainerWindow key={r.id} retainer={r} names={names} now={now} />
      ))}
    </>
  );
}

function RetainerWindow({ retainer, names, now }: { retainer: RetainerInfo; names?: Names; now: number }) {
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
                    <ItemRow key={`m-${m.id}-${i}`} stack={m} names={names} detail={`${formatGil(m.price)} l’unité`} first={i === 0} />
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
});
