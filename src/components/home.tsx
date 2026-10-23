/** Éléments partagés par les onglets : bouton Réglages, accueil des nouveaux, personnage principal. */
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore, type SavedCharacter } from '@/store/app-store';

export function useMainCharacter(): SavedCharacter | null {
  return useAppStore((s) => s.characters.find((c) => c.id === s.mainCharacterId) ?? s.characters[0] ?? null);
}

export function SettingsButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Réglages" hitSlop={8} onPress={() => router.push('/settings')}>
      {({ pressed }) => <View style={{ opacity: pressed ? 0.6 : 1 }}><MenuIcon id={MenuIcons.configuration} size={34} /></View>}
    </Pressable>
  );
}

/** Premier lancement : ajouter son personnage, puis (facultatif) connecter le plugin. */
export function Welcome() {
  return (
    <Card>
      <View style={styles.welcomeHead}>
        <MenuIcon id={MenuIcons.personnage} size={44} />
        <View style={styles.flex}>
          <ThemedText type="display">Bienvenue, aventurier</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Clavicule réunit ton personnage, tes collections, le marché et bientôt des guides.
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small">1. Ajoute ton personnage depuis le Lodestone : jobs, équipement, portrait.</ThemedText>
      <ThemedText type="small">
        2. Facultatif : installe le plugin Dalamud Clavicule pour voir aussi ton inventaire, tes servants, tes collections et ton modèle 3D.
      </ThemedText>
      <Button label="Ajouter mon personnage" onPress={() => router.push('/character/search')} />
    </Card>
  );
}

/** Choix du personnage affiché : avatars des personnages suivis, et ajout. */
export function CharacterSwitcher({ selected, onSelect }: { selected: number | null; onSelect: (id: number) => void }) {
  const theme = useTheme();
  const characters = useAppStore((s) => s.characters);
  const mainId = useAppStore((s) => s.mainCharacterId);
  const links = useAppStore((s) => s.privateLinks);
  const sorted = [...characters].sort((a, b) => (a.id === mainId ? -1 : b.id === mainId ? 1 : a.name.localeCompare(b.name)));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcher}>
      {sorted.map((c) => {
        const active = c.id === selected;
        const linked = Boolean(links[c.id]);
        return (
          <Pressable
            key={c.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={linked ? `${c.name}, téléphone connecté` : c.name}
            onPress={() => onSelect(c.id)}
            style={styles.switchItem}>
            <View>
              <View style={[styles.avatarRing, { borderColor: active ? theme.accent : theme.frame }]}>
                {c.avatar ? <Image source={c.avatar} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: theme.backgroundSelected }]} />}
              </View>
              {linked ? <PhoneBadge /> : null}
            </View>
            <ThemedText type="small" numberOfLines={1} style={[styles.switchName, { color: active ? theme.text : theme.textSecondary }]}>
              {c.name.split(' ')[0]}
            </ThemedText>
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" accessibilityLabel="Ajouter un personnage" onPress={() => router.push('/character/search')} style={styles.switchItem}>
        <View style={[styles.avatarRing, styles.add, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="subtitle" themeColor="textSecondary">
            +
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" style={styles.switchName}>
          Ajouter
        </ThemedText>
      </Pressable>
    </ScrollView>
  );
}

/** Pastille dorée « téléphone connecté » en bas à droite du portrait. */
function PhoneBadge() {
  const theme = useTheme();
  return (
    <View style={[styles.phoneBadge, { backgroundColor: theme.background, borderColor: theme.accent }]}>
      <Svg width={12} height={12} viewBox="0 0 24 24">
        <Rect x={6} y={1.5} width={12} height={21} rx={2.5} fill={theme.accent} />
        <Rect x={8} y={4} width={8} height={13} rx={0.8} fill={theme.background} />
        <Circle cx={12} cy={19.6} r={1.2} fill={theme.background} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  phoneBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0 },
  welcomeHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  switcher: { gap: Spacing.three, paddingVertical: Spacing.one },
  switchItem: { alignItems: 'center', width: 64, gap: Spacing.one },
  avatarRing: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  add: { borderStyle: 'dashed' },
  switchName: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
});
