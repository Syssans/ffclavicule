/** Briques d'interface partagées par les écrans. */
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ScrollViewProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Page défilante. `tab` ajoute la marge de la barre d'onglets et le grand titre. */
export function Screen({
  title,
  tab = false,
  children,
  ...scrollProps
}: { title?: string; tab?: boolean; children: ReactNode } & ScrollViewProps) {
  const theme = useTheme();
  const content = (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.screen,
        tab && { paddingBottom: BottomTabInset + Spacing.four },
        // Sur le web, la barre d'onglets est en haut de l'écran.
        tab && Platform.OS === 'web' && { paddingTop: 72 },
      ]}
      keyboardShouldPersistTaps="handled"
      {...scrollProps}>
      {title ? (
        <ThemedText type="title" accessibilityRole="header">
          {title}
        </ThemedText>
      ) : null}
      {children}
    </ScrollView>
  );
  return tab ? (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.background }}>
      {content}
    </SafeAreaView>
  ) : (
    content
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ThemedText type="subtitle" accessibilityRole="header">
          {title}
        </ThemedText>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Ligne "libellé : valeur". */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.infoLabel}>
        {label}
      </ThemedText>
      {typeof value === 'string' || typeof value === 'number' ? (
        <ThemedText type="small" style={styles.infoValue}>
          {value}
        </ThemedText>
      ) : (
        value
      )}
    </View>
  );
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.centered} accessibilityLiveRegion="polite">
      <ActivityIndicator color={theme.accent} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const theme = useTheme();
  const message = error instanceof Error ? error.message : 'Une erreur est survenue.';
  return (
    <Card style={{ borderColor: theme.danger, borderWidth: 1 }}>
      <ThemedText type="small" style={{ color: theme.danger }}>
        {message}
      </ThemedText>
      {onRetry ? <Button label="Réessayer" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
      {children}
    </ThemedText>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const theme = useTheme();
  const background = variant === 'primary' ? theme.accent : theme.backgroundSelected;
  const color = variant === 'primary' ? theme.accentText : variant === 'danger' ? theme.danger : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      autoCorrect={false}
      {...props}
      style={[
        styles.input,
        { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
        props.style,
      ]}
    />
  );
}

/** Choix parmi quelques options, en ligne. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundElement }]} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.accent }]}>
            <ThemedText type="smallBold" style={{ color: selected ? theme.accentText : theme.text }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Ligne cliquable avec image, titre et sous-titre. */
export function ListRow({
  image,
  title,
  subtitle,
  right,
  onPress,
}: {
  image?: string | null;
  title: string;
  subtitle?: string | null;
  right?: ReactNode;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      {image !== undefined ? (
        <Image source={image ?? undefined} style={[styles.thumb, { backgroundColor: theme.backgroundSelected }]} />
      ) : null}
      <View style={styles.listRowText}>
        <ThemedText numberOfLines={1}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** Barre de progression horizontale (0 à 1). */
export function ProgressBar({ value }: { value: number }) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.fill, { width: `${clamped * 100}%`, backgroundColor: theme.accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: Spacing.three,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  section: { gap: Spacing.two },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.three },
  infoLabel: { flexShrink: 0 },
  infoValue: { flexShrink: 1, textAlign: 'right' },
  centered: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four },
  empty: { textAlign: 'center', padding: Spacing.three },
  button: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.one, gap: Spacing.one },
  segment: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: 12,
    minHeight: 56,
  },
  listRowText: { flex: 1, minWidth: 0 },
  thumb: { width: 40, height: 40, borderRadius: 8 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
