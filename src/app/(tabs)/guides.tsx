/** Onglet Guides : l'heure d'Éorzéa, les modules du jeu et les prochaines réinitialisations. */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Clocks, ResetBoard } from '@/components/clocks';
import { ModuleTile, TileRow } from '@/components/game-ui';
import { SettingsButton } from '@/components/home';
import { Screen } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { DisplayFont, Spacing } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import { daySeed, loreImage, lorePick } from '@/utils/lore';

/** Entrée de la Légende : un panorama du jour en bannière. */
function LoreBanner() {
  const panorama = useMemo(() => lorePick('lieu', 1, daySeed() + 11)[0], []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Légende : le lore du jeu"
      onPress={() => router.push('/lore')}
      style={({ pressed }) => [styles.lore, pressed && { opacity: 0.85 }]}>
      {panorama ? <Image source={loreImage(panorama)} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
      <LinearGradient
        colors={['rgba(5,8,15,0.8)', 'rgba(5,8,15,0.15)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.loreTitle}>Légende</Text>
      <Text style={styles.loreTagline}>Personnages, lieux, chroniques…</Text>
    </Pressable>
  );
}

const MODULES: { title: string; icon: number; href: Href }[] = [
  { title: 'Artisanat', icon: MenuIcons.artisanat, href: '/crafting' },
  { title: 'Pêche', icon: MenuIcons.peche, href: '/fishing' },
  { title: 'Récolte', icon: MenuIcons.recolte, href: '/gathering' },
  { title: 'Chasse', icon: MenuIcons.bestiaire, href: '/hunt' },
];

export default function GuidesScreen() {
  const now = useNow(1000);
  return (
    <Screen title="Guides" tab right={<SettingsButton />}>
      <Clocks now={now} />
      <LoreBanner />
      <TileRow>
        {MODULES.map((m) => (
          <ModuleTile key={m.title} icon={m.icon} title={m.title} onPress={() => router.push(m.href)} />
        ))}
      </TileRow>
      <ResetBoard now={now} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lore: { height: 120, borderRadius: 16, overflow: 'hidden', justifyContent: 'center', padding: Spacing.three, backgroundColor: '#151B2B' },
  loreTitle: { fontFamily: DisplayFont.bold, fontSize: 30, lineHeight: 36, color: '#F3DC9A' },
  loreTagline: { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 18 },
});
