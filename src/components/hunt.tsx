/** Éléments du module Chasse : écusson de rang, état de la fenêtre de réapparition, ligne de marque, cible de contrat. */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Chip } from '@/components/ui';
import { DisplayFont, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { countdown } from '@/shared/today';
import { killKey, useHuntStore, type HuntKill } from '@/store/hunt-store';
import {
  hoursText,
  markName,
  placeName,
  respawnWindow,
  targetMapName,
  targetSpot,
  windowState,
  type HuntMark,
  type HuntRank,
  type HuntTarget,
} from '@/utils/hunt';

/** Couleurs des rangs, comme les traqueurs de la communauté : B bleu, A or, S rouge, SS violet. */
export const RANK_COLORS: Record<HuntRank, string> = { B: '#5B8DEF', A: '#E0A43A', S: '#E0554F', SS: '#B06BE0', sbire: '#8A8F9C' };

/** Écusson du rang d'une marque. */
export function RankBadge({ rank, size = 30 }: { rank: HuntRank; size?: number }) {
  const color = RANK_COLORS[rank];
  return (
    <View
      accessibilityLabel={`Rang ${rank}`}
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.28, borderColor: color, backgroundColor: `${color}2E` }]}>
      <Text style={[styles.badgeText, { color, fontSize: size * (rank === 'SS' ? 0.42 : 0.55), lineHeight: size * 0.7 }]}>
        {rank === 'sbire' ? '·' : rank}
      </Text>
    </View>
  );
}

/** État de la fenêtre de réapparition après une mort, en une ligne. */
export function windowText(kill: HuntKill, now: number): { text: string; tone: 'muted' | 'open' | 'due' } {
  const window = respawnWindow(kill.rank, kill.territory);
  const ago = `Tuée il y a ${countdown(now - kill.at)}`;
  if (!window) return { text: `${ago} · délai de retour inconnu`, tone: 'muted' };
  const state = windowState(kill.at, window.window, now);
  if (state.kind === 'closed') return { text: `${ago} · fenêtre dans ${countdown(state.opensAt - now)}`, tone: 'muted' };
  if (state.kind === 'open')
    return { text: `Fenêtre ouverte (${Math.round(state.progress * 100)} %) · fin dans ${countdown(state.closesAt - now)}`, tone: 'open' };
  return { text: kill.rank === 'S' ? 'Fenêtre passée : n’attend plus que sa condition' : 'Sûrement revenue', tone: 'due' };
}

/** Une marque d'une zone : écusson, nom, état de sa fenêtre et bouton pour noter sa mort. */
export function MarkRow({
  mark,
  territory,
  kill,
  world,
  now,
  onPress,
  hint = true,
}: {
  mark: HuntMark;
  territory: number;
  kill?: HuntKill;
  world: string;
  now: number;
  onPress?: () => void;
  /** Rappeler le délai de retour quand aucune mort n'est notée. */
  hint?: boolean;
}) {
  const theme = useTheme();
  const recordKill = useHuntStore((s) => s.recordKill);
  const removeKill = useHuntStore((s) => s.removeKill);
  const [asking, setAsking] = useState(false);
  const trackable = mark.r === 'A' || mark.r === 'S';
  const window = trackable ? respawnWindow(mark.r, territory) : null;
  const status = kill ? windowText(kill, now) : null;
  const record = (minutesAgo: number) => {
    recordKill({ territory, mark: mark.n, rank: mark.r as 'A' | 'S', at: now - minutesAgo * 60_000, world, source: 'manual' });
    setAsking(false);
  };
  return (
    <View style={styles.markRow}>
      <View style={styles.markLine}>
        <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={styles.markMain}>
          <RankBadge rank={mark.r} />
          <View style={styles.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {markName(mark.n)}
            </ThemedText>
            {status ? (
              <ThemedText
                type="small"
                numberOfLines={2}
                style={{ color: status.tone === 'open' ? theme.success : status.tone === 'due' ? theme.accent : theme.textSecondary }}>
                {status.text}
              </ThemedText>
            ) : window && hint ? (
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                Revient {hoursText(window.window)} après sa mort
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
        {trackable && !asking ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Noter la mort de ${markName(mark.n)}`}
            hitSlop={6}
            onPress={() => setAsking(true)}
            style={({ pressed }) => [styles.killButton, { borderColor: theme.frame, opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText type="smallBold" style={{ color: theme.ornament, fontSize: 13 }}>
              Tuée
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {asking ? (
        <View style={styles.askRow}>
          <ThemedText type="small" themeColor="textSecondary">
            Morte
          </ThemedText>
          <Chip label="à l’instant" onPress={() => record(0)} />
          <Chip label="il y a 30 min" onPress={() => record(30)} />
          <Chip label="il y a 1 h" onPress={() => record(60)} />
          <Chip label="il y a 3 h" onPress={() => record(180)} />
          {kill ? <Chip label="Effacer" onPress={() => (removeKill(killKey(kill)), setAsking(false))} /> : null}
          <Chip label="Annuler" onPress={() => setAsking(false)} />
        </View>
      ) : null}
    </View>
  );
}

/** Une cible de contrat : icône du contrat, nom, lieu, victimes, et sa position sur la carte. */
export function TargetRow({
  id,
  target,
  kills,
  progress,
  showMap = true,
}: {
  /** Cible (MobHuntTarget), pour montrer ses positions sur la carte. */
  id: number;
  target: HuntTarget;
  kills: number;
  progress?: number;
  /** Rappeler la carte (inutile dans une liste déjà rangée par carte). */
  showMap?: boolean;
}) {
  const theme = useTheme();
  const spot = targetSpot(target);
  const mapName = targetMapName(target);
  const place = placeName(target.p);
  const where =
    [showMap ? mapName : null, place && place !== mapName ? place : null].filter(Boolean).join(' · ') || (showMap ? '' : 'Dans toute la zone');
  const done = progress !== undefined && progress >= kills;
  return (
    <Pressable
      accessibilityRole={spot ? 'button' : undefined}
      accessibilityLabel={`${markName(target.n)}, ${where}${spot ? ', voir sur la carte' : ''}`}
      disabled={!spot}
      onPress={() =>
        spot &&
        router.push({
          pathname: '/map',
          params: {
            map: String(spot.mapId),
            x: String(Math.round(spot.x)),
            y: String(Math.round(spot.y)),
            label: markName(target.n),
            hunt: String(id),
          },
        })
      }
      style={({ pressed }) => [styles.target, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <Image source={gameIconUrl(target.i)} style={styles.targetIcon} contentFit="contain" />
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={1} style={done ? { color: theme.textSecondary, textDecorationLine: 'line-through' } : undefined}>
          {markName(target.n)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {where || 'Lieu inconnu'}
          {target.f ? ' · pendant un ALÉA' : ''}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ color: done ? theme.success : theme.ornament }}>
        {progress !== undefined ? `${Math.min(progress, kills)}/${kills}` : `×${kills}`}
      </ThemedText>
      {spot ? <ThemedText themeColor="textSecondary">›</ThemedText> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  badge: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: DisplayFont.bold, textAlign: 'center' },
  markRow: { gap: Spacing.one },
  markLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  markMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  killButton: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  askRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one, paddingLeft: 38 },
  target: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, borderRadius: 10 },
  targetIcon: { width: 36, height: 36 },
});
