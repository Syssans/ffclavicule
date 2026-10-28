/** Onglet Guides : l'heure d'Éorzéa, puis l'encyclopédie du jeu, construite module par module. */
import { router } from 'expo-router';

import { MenuEntry, MenuGrid, MenuTile } from '@/components/game-ui';
import { Clocks, ResetBoard } from '@/components/clocks';
import { SettingsButton } from '@/components/home';
import { Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { useNow } from '@/hooks/use-now';

const MODULES = [
  { icon: MenuIcons.journal, title: 'Quêtes', subtitle: 'Scénario, quêtes de job, enchaînements' },
  { icon: MenuIcons.actions, title: 'Jobs', subtitle: 'Actions, traits, niveaux' },
  { icon: MenuIcons.bestiaire, title: 'Combats', subtitle: 'Donjons, défis, raids, butins' },
  { icon: MenuIcons.alea, title: 'Chasse', subtitle: 'Rangs S et A, conditions d’apparition' },
];

export default function GuidesScreen() {
  const now = useNow(1000);
  return (
    <Screen title="Guides" tab right={<SettingsButton />}>
      <Clocks now={now} />
      <MenuEntry
        icon={MenuIcons.artisanat}
        title="Artisanat"
        subtitle="Recettes et sous-recettes, liste de courses, rentabilité au marché, guide de niveau des artisans."
        onPress={() => router.push('/crafting')}
      />
      <MenuEntry
        icon={MenuIcons.peche}
        title="Pêche"
        subtitle="Fenêtres des poissons, appâts, météo d’Éorzéa, carnet de pêche et pêche en mer."
        onPress={() => router.push('/fishing')}
      />
      <MenuEntry
        icon={MenuIcons.recolte}
        title="Récolte"
        subtitle="Points légendaires, immaculés et éphémères, où récolter chaque objet, carnet et guide de niveau."
        onPress={() => router.push('/gathering')}
      />
      <ResetBoard now={now} />
      <Section title="Bientôt">
        <MenuGrid>
          {MODULES.map((m) => (
            <MenuTile key={m.title} icon={m.icon} title={m.title} subtitle={m.subtitle} badge="Bientôt" disabled />
          ))}
        </MenuGrid>
      </Section>
    </Screen>
  );
}
