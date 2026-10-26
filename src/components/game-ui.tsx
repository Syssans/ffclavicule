/** Briques visuelles à l'image de l'interface du jeu : icônes du menu principal, tuiles de menu, anneaux de progression. */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { gameIconUrl } from '@/api/xivapi';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Icône du jeu (menu principal, collection…) sans fond ajouté : elles ont déjà leur propre médaillon. */
export function MenuIcon({ id, size = 36, dimmed = false }: { id: number; size?: number; dimmed?: boolean }) {
  return (
    <Image
      source={gameIconUrl(id)}
      style={{ width: size, height: size, opacity: dimmed ? 0.4 : 1 }}
      contentFit="contain"
      transition={120}
      accessibilityIgnoresInvertColors
    />
  );
}

/** Tuile de menu : icône du jeu, titre, sous-titre, pastille (« 3 », « Bientôt »…). Deux par ligne dans un MenuGrid. */
export function MenuTile({
  icon,
  title,
  subtitle,
  badge,
  onPress,
  disabled = false,
}: {
  icon: number;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, badge].filter(Boolean).join(', ')}
      accessibilityState={{ disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundElement, borderColor: theme.frame, opacity: disabled ? 0.55 : pressed ? 0.8 : 1 },
      ]}>
      <View style={styles.tileTop}>
        <MenuIcon id={icon} size={40} dimmed={disabled} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: disabled ? theme.backgroundSelected : theme.accent }]}>
            <ThemedText type="smallBold" style={[styles.badgeText, { color: disabled ? theme.textSecondary : theme.accentText }]}>
              {badge}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="smallBold" numberOfLines={1}>
        {title}
      </ThemedText>
      {subtitle ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.tileSubtitle}>
          {subtitle}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

export function MenuGrid({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.grid, style]}>{children}</View>;
}

/** Anneau de progression (0 à 1), avec un texte au centre. */
export function ProgressRing({ value, size = 56, stroke = 5, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const theme = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.backgroundSelected} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * clamped} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Ligne de menu (icône du jeu, titre, détail, flèche), pour les listes. */
export function MenuRow({ icon, title, subtitle, right, onPress }: { icon: number; title: string; subtitle?: string | null; right?: ReactNode; onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.backgroundSelected }]}>
      <MenuIcon id={icon} size={34} />
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right ?? (onPress ? <ThemedText themeColor="textSecondary">›</ThemedText> : null)}
    </Pressable>
  );
}

/**
 * Fenêtre à la façon du jeu : bandeau titré avec son icône sur un dégradé doré, filet, puis le contenu.
 * Le contenu est libre (lignes, puces, texte).
 */
export function GameWindow({
  icon,
  image,
  title,
  subtitle,
  right,
  children,
  style,
}: {
  /** Icône du jeu par son numéro, ou `image` : adresse d'une icône (objet…). */
  icon?: number;
  image?: string | null;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.window, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, style]}>
      <LinearGradient
        colors={[`${theme.ornament}38`, `${theme.ornament}08`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.windowHead}>
        {image ? (
          <Image source={image} style={{ width: 40, height: 40, borderRadius: 6 }} contentFit="contain" />
        ) : icon !== undefined ? (
          <MenuIcon id={icon} size={40} />
        ) : null}
        <View style={styles.rowText}>
          <ThemedText type="display" accessibilityRole="header" numberOfLines={2} style={{ color: theme.ornament }}>
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        {right}
      </LinearGradient>
      <View style={[styles.windowRule, { backgroundColor: theme.frame }]} />
      {children ? <View style={styles.windowBody}>{children}</View> : null}
    </View>
  );
}

/** Grande entrée de menu : grosse icône du jeu, titre, état (« 3 actives »), flèche. */
export function MenuEntry({
  icon,
  title,
  subtitle,
  status,
  onPress,
}: {
  icon: number;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[title, status, subtitle].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.entry, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.8 }]}>
      <LinearGradient colors={[`${theme.ornament}30`, 'transparent']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      <MenuIcon id={icon} size={56} />
      <View style={styles.rowText}>
        <ThemedText type="display" numberOfLines={1} style={{ color: theme.ornament }}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
        ) : null}
        {status ? (
          <View style={[styles.entryStatus, { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type="smallBold" style={[styles.badgeText, { color: theme.accent }]}>
              {status}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="subtitle" style={{ color: theme.ornament }}>
        ›
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  windowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  windowRule: { height: 1 },
  windowBody: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  entryStatus: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: Spacing.one },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
    minHeight: 112,
  },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: Spacing.one },
  tileSubtitle: { fontSize: 13, lineHeight: 17 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 12, lineHeight: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, paddingHorizontal: Spacing.one, borderRadius: 10 },
  rowText: { flex: 1, minWidth: 0 },
});
