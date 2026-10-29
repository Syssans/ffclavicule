/** Module Chasse : marques A/S suivies (fenêtres de réapparition), contrats en main, et les entrées du module. */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { GameWindow, MenuEntry } from '@/components/game-ui';
import { RankBadge, TargetRow, windowText } from '@/components/hunt';
import { ThemedText } from '@/components/themed-text';
import { Chip, Empty, Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useHunt } from '@/hooks/use-hunt';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { billDone } from '@/shared/today';
import { useHuntStore, type HuntKill } from '@/store/hunt-store';
import { billByIndex, huntData, huntTarget, markName, respawnWindow, windowState, zoneName } from '@/utils/hunt';
import { notificationsSupported } from '@/notifications/device';

/** Ordre d'affichage : fenêtres ouvertes, puis bientôt ouvertes, puis passées, puis délai inconnu. */
function killRank(kill: HuntKill, now: number): number {
  const window = respawnWindow(kill.rank, kill.territory);
  if (!window) return 4e15;
  const state = windowState(kill.at, window.window, now);
  if (state.kind === 'open') return state.closesAt - 2e15;
  if (state.kind === 'closed') return state.opensAt;
  return 3e15 - state.closesAt;
}

export default function HuntScreen() {
  const theme = useTheme();
  const now = useNow(30_000);
  const { kills, bills, linked, pluginOutdated } = useHunt(now);
  const notify = useHuntStore((s) => s.notify);
  const setNotify = useHuntStore((s) => s.setNotify);
  const sorted = [...kills].sort((a, b) => killRank(a, now) - killRank(b, now));
  const data = huntData();

  return (
    <Screen>
      <GameWindow
        icon={MenuIcons.bestiaire}
        title="Mes marques"
        subtitle="Rangs A et S tués : quand peuvent-ils revenir ?"
        right={
          notificationsSupported ? (
            <Chip label={notify ? 'Rappel activé' : 'Sans rappel'} selected={notify} onPress={() => setNotify(!notify)} />
          ) : null
        }>
        {sorted.length === 0 ? (
          <Empty>Note la mort d’un rang A ou S depuis sa zone : Clavicule te dira quand sa fenêtre de réapparition s’ouvre.</Empty>
        ) : null}
        {sorted.map((kill) => {
          const status = windowText(kill, now);
          return (
            <View key={`${kill.world}|${kill.territory}|${kill.mark}`} style={styles.kill}>
              <RankBadge rank={kill.rank} />
              <View style={styles.flex}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  onPress={() => router.push({ pathname: '/hunt/zone/[territory]', params: { territory: String(kill.territory) } })}>
                  {markName(kill.mark)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {[zoneName(kill.territory), kill.world, kill.source === 'plugin' ? 'vue par le plugin' : null].filter(Boolean).join(' · ')}
                </ThemedText>
                <ThemedText
                  type="small"
                  style={{ color: status.tone === 'open' ? theme.success : status.tone === 'due' ? theme.accent : theme.textSecondary }}>
                  {status.text}
                </ThemedText>
              </View>
            </View>
          );
        })}
      </GameWindow>

      <GameWindow icon={MenuIcons.journal} title="Contrats en main">
        {bills.length === 0 ? (
          <Empty>
            {linked
              ? pluginOutdated
                ? 'Mets à jour le plugin Clavicule pour voir tes contrats et tes victimes ici.'
                : 'Aucun contrat en main. Prends-en au tableau des contrats : ils s’afficheront ici avec tes victimes.'
              : 'Connecte le plugin Clavicule pour suivre tes contrats et tes victimes en direct.'}
          </Empty>
        ) : null}
        {bills.map((b) => {
          const type = billByIndex(b.k);
          const order = type?.orders[String(b.row)] ?? [];
          return (
            <View key={`${b.k}-${b.row}`} style={styles.bill}>
              <ThemedText type="smallBold" style={{ color: billDone(b) ? theme.success : theme.ornament }}>
                {type?.n ?? 'Contrat'}
                {billDone(b) ? ' · terminé' : ''}
              </ThemedText>
              {order.map(([id, needed], i) => {
                const target = huntTarget(id);
                return target ? <TargetRow key={id} target={target} kills={b.needed[i] ?? needed} progress={b.kills[i] ?? 0} /> : null;
              })}
            </View>
          );
        })}
      </GameWindow>

      <MenuEntry
        icon={MenuIcons.bestiaire}
        title="Rangs A et S"
        subtitle="Marques de chaque zone, conditions d’apparition, points sur la carte"
        onPress={() => router.push('/hunt/marks')}
      />
      <MenuEntry
        icon={MenuIcons.journal}
        title="Contrats de chasse"
        subtitle="Quotidiens et d’élite : cibles et où les trouver"
        onPress={() => router.push('/hunt/bills')}
      />
      <ThemedText type="small" themeColor="textSecondary">
        Marques et contrats : données du jeu. Points d’apparition : HuntHelper. Positions des cibles : Teamcraft. Conditions et délais de réapparition
        : guides de la communauté, à titre indicatif. Mises à jour le {new Date(data.updatedAt).toLocaleDateString('fr-FR')}.
      </ThemedText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  kill: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  bill: { gap: Spacing.half },
});
