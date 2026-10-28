/** Onglet Guides : l'heure d'Éorzéa, les modules du jeu et les prochaines réinitialisations. */
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Clocks, ResetBoard } from '@/components/clocks';
import { MenuIcon } from '@/components/game-ui';
import { SettingsButton } from '@/components/home';
import { ThemedText } from '@/components/themed-text';
import { Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';

const MODULES: { title: string; icon: number; href: Href }[] = [
  { title: 'Artisanat', icon: MenuIcons.artisanat, href: '/crafting' },
  { title: 'Pêche', icon: MenuIcons.peche, href: '/fishing' },
  { title: 'Récolte', icon: MenuIcons.recolte, href: '/gathering' },
];

export default function GuidesScreen() {
  const now = useNow(1000);
  return (
    <Screen title="Guides" tab right={<SettingsButton />}>
      <Clocks now={now} />
      <View style={styles.modules}>
        {MODULES.map((m) => (
          <ModuleTile key={m.title} {...m} />
        ))}
      </View>
      <ResetBoard now={now} />
    </Screen>
  );
}

function ModuleTile({ title, icon, href }: { title: string; icon: number; href: Href }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href)}
      style={({ pressed }) => [styles.tile, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}>
      <MenuIcon id={icon} size={52} />
      <ThemedText type="smallBold" numberOfLines={1}>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  modules: { flexDirection: 'row', gap: Spacing.two },
  tile: { flex: 1, alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.three, borderRadius: 14, borderWidth: 1 },
});
