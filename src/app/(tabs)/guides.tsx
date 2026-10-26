/** Onglet Guides : l'encyclopédie du jeu, construite module par module. */
import { router } from 'expo-router';

import { MenuEntry, MenuGrid, MenuTile } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';

const MODULES = [
  { icon: MenuIcons.journal, title: 'Quêtes', subtitle: 'Scénario, quêtes de job, enchaînements' },
  { icon: MenuIcons.carte, title: 'Cartes', subtitle: 'Éthérites, PNJ, points d’intérêt' },
  { icon: MenuIcons.actions, title: 'Jobs', subtitle: 'Actions, traits, niveaux' },
  { icon: MenuIcons.bestiaire, title: 'Combats', subtitle: 'Donjons, défis, raids, butins' },
  { icon: MenuIcons.alea, title: 'Chasse', subtitle: 'Rangs S et A, conditions d’apparition' },
];

export default function GuidesScreen() {
  return (
    <Screen title="Guides" tab>
      <Card>
        <ThemedText type="small" themeColor="textSecondary">
          L’encyclopédie de Clavicule arrive module par module, construite à partir des données du jeu et de ta progression lue par le plugin.
        </ThemedText>
      </Card>
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
