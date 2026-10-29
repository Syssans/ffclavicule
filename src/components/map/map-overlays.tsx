/** Éléments posés sur la carte : barres de puces (calques, étages, fil d'Ariane), boutons ronds et fiche d'un point. */
import { Image, type ImageSource } from 'expo-image';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { DisplayFont, Spacing } from '@/constants/theme';

/** Couleurs des éléments posés sur la carte : sombres et dorées, comme l'interface du jeu, quel que soit le thème. */
export const MapColors = {
  panel: 'rgba(14,16,24,0.9)',
  panelSoft: 'rgba(14,16,24,0.72)',
  border: 'rgba(217,179,108,0.45)',
  gold: '#E8C978',
  text: '#F4EEDC',
  muted: '#B9B2A0',
  selected: '#4A3B1C',
} as const;

export function MapChip({
  label,
  icon,
  selected = false,
  dimmed = false,
  onPress,
  accessibilityLabel,
}: {
  label?: string;
  icon?: number;
  selected?: boolean;
  dimmed?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && {
          backgroundColor: MapColors.selected,
          borderColor: MapColors.gold,
        },
        dimmed && { opacity: 0.45 },
        pressed && { opacity: 0.7 },
      ]}>
      {icon ? <Image source={{ uri: gameIconUrl(icon) }} style={styles.chipIcon} cachePolicy="disk" /> : null}
      {label ? (
        <Text style={[styles.chipText, selected && { color: MapColors.gold }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Choix du monde, en tête du fil d'Ariane : le globe doré, le monde affiché et une flèche, bien visibles pour
 * qu'on comprenne qu'on peut en changer.
 */
export function WorldChip({ globe, label, open, onPress }: { globe: ImageSource | number; label: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Monde : ${label}. Changer de monde`}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, styles.world, open && { backgroundColor: MapColors.selected }, pressed && { opacity: 0.7 }]}>
      <Image source={globe} style={styles.worldGlobe} contentFit="contain" />
      <Text style={[styles.chipText, styles.worldText]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.worldArrow}>{open ? '▴' : '▾'}</Text>
    </Pressable>
  );
}

/** Un monde à choisir : la vignette de sa carte, son nom et ce qu'on y trouve. */
export function WorldRow({
  image,
  title,
  detail,
  current,
  onPress,
}: {
  image: string;
  title: string;
  detail: string;
  current: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      onPress={onPress}
      style={({ pressed }) => [styles.worldRow, current && { borderColor: MapColors.gold }, pressed && { opacity: 0.75 }]}>
      <Image source={{ uri: image }} style={styles.worldThumb} contentFit="cover" cachePolicy="disk" />
      <View style={styles.flex}>
        <Text style={[styles.cardTitleText, current && { color: MapColors.gold }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.cardText, { color: MapColors.muted }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Text style={[styles.cardText, { color: MapColors.gold }]}>›</Text>
    </Pressable>
  );
}

export function ChipBar({ children }: { children: ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bar} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function RoundButton({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.round, pressed && { opacity: 0.7 }]}>
      <Text style={styles.roundText}>{label}</Text>
    </Pressable>
  );
}

/** Fiche d'un point : icône, titre, détails, actions. */
export function PointCard({
  icon,
  image,
  title,
  subtitle,
  children,
  onClose,
}: {
  icon?: number;
  image?: string | null;
  title: string;
  subtitle?: string | null;
  children?: ReactNode;
  onClose: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {image || icon ? <Image source={{ uri: image ?? gameIconUrl(icon!) }} style={styles.cardIcon} cachePolicy="disk" /> : null}
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.cardSubtitle} numberOfLines={3}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onClose} hitSlop={10} style={styles.close}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
      {children ? <View style={styles.cardBody}>{children}</View> : null}
    </View>
  );
}

export function CardText({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.cardText, muted && { color: MapColors.muted }]}>{children}</Text>;
}

export function CardButton({ label, onPress, icon }: { label: string; onPress: () => void; icon?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.cardButton, pressed && { opacity: 0.75 }]}>
      {icon ? <Image source={{ uri: gameIconUrl(icon) }} style={styles.chipIcon} cachePolicy="disk" /> : null}
      <Text style={styles.cardButtonText}>{label}</Text>
    </Pressable>
  );
}

/** Ligne d'élément dans une fiche (objet, poisson) : icône, nom, détail, appui. */
export function CardRow({ image, title, detail, onPress }: { image?: string | null; title: string; detail?: string | null; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.cardRow, pressed && { opacity: 0.7 }]}>
      {image ? <Image source={{ uri: image }} style={styles.rowIcon} cachePolicy="disk" /> : null}
      <Text style={[styles.cardText, styles.flex]} numberOfLines={1}>
        {title}
      </Text>
      {detail ? <Text style={[styles.cardText, { color: MapColors.muted }]}>{detail}</Text> : null}
      {onPress ? <Text style={[styles.cardText, { color: MapColors.gold }]}>›</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  world: { borderColor: MapColors.gold, borderWidth: 1.5, paddingLeft: 6, gap: 4 },
  worldGlobe: { width: 26, height: 26 },
  worldText: { color: MapColors.gold, fontWeight: '700' },
  worldArrow: { color: MapColors.gold, fontSize: 13 },
  worldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.one,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: MapColors.border,
  },
  worldThumb: { width: 84, height: 52, borderRadius: 8, backgroundColor: '#000' },
  cardTitleText: { color: MapColors.text, fontSize: 16, fontWeight: '700' },
  bar: {
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: MapColors.border,
    backgroundColor: MapColors.panel,
  },
  chipIcon: { width: 22, height: 22 },
  chipText: {
    color: MapColors.text,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 200,
  },
  round: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: MapColors.border,
    backgroundColor: MapColors.panel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundText: {
    color: MapColors.gold,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MapColors.border,
    backgroundColor: MapColors.panel,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardIcon: { width: 40, height: 40 },
  cardTitle: {
    color: MapColors.gold,
    fontFamily: DisplayFont.bold,
    fontSize: 17,
    lineHeight: 22,
  },
  cardSubtitle: { color: MapColors.muted, fontSize: 13, lineHeight: 18 },
  cardBody: { gap: 6 },
  cardText: { color: MapColors.text, fontSize: 14, lineHeight: 20 },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: MapColors.muted, fontSize: 16 },
  cardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: MapColors.gold,
    backgroundColor: 'rgba(217,179,108,0.16)',
    paddingHorizontal: Spacing.three,
  },
  cardButtonText: { color: MapColors.gold, fontSize: 14, fontWeight: '700' },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 32,
  },
  rowIcon: { width: 26, height: 26, borderRadius: 4 },
});
