/** Onglet Guides : l'encyclopédie du jeu, construite module par module. */
import { MenuGrid, MenuTile } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';

const MODULES = [
  { icon: MenuIcons.artisanat, title: 'Artisanat', subtitle: 'Recettes, ingrédients, rentabilité au marché', next: true },
  { icon: MenuIcons.journal, title: 'Quêtes', subtitle: 'Scénario, quêtes de job, enchaînements' },
  { icon: MenuIcons.peche, title: 'Pêche', subtitle: 'Fenêtres météo, appâts, carnet' },
  { icon: MenuIcons.recolte, title: 'Récolte', subtitle: 'Nœuds éphémères, horaires' },
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
      <Section title="Bientôt">
        <MenuGrid>
          {MODULES.map((m) => (
            <MenuTile key={m.title} icon={m.icon} title={m.title} subtitle={m.subtitle} badge={m.next ? 'Prochain' : 'Bientôt'} disabled />
          ))}
        </MenuGrid>
      </Section>
    </Screen>
  );
}
