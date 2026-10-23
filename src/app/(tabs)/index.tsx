/** Accueil : l'heure d'Éorzéa, la fiche du personnage principal et les réinitialisations du jeu. */
import { router } from 'expo-router';

import { MenuGrid, MenuTile } from '@/components/game-ui';
import { SettingsButton, useMainCharacter, Welcome } from '@/components/home';
import { Clocks, MainCharacterSheet, ResetBoard } from '@/components/home-board';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen, Section } from '@/components/ui';
import { MenuIcons } from '@/constants/menu-icons';
import { useNow } from '@/hooks/use-now';
import { usePrivate } from '@/hooks/use-private';

export default function HomeScreen() {
  const now = useNow(1000);
  const main = useMainCharacter();
  const id = main?.id ?? Number.NaN;
  const { link } = usePrivate(id);

  return (
    <Screen title="Clavicule" tab right={<SettingsButton />}>
      <Clocks now={now} />

      {main ? <MainCharacterSheet id={main.id} /> : <Welcome />}

      {main && !link ? (
        <Card>
          <ThemedText type="smallBold">Va plus loin avec le plugin</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Inventaire, servants, courrier, collections complètes, ATH : connecte le plugin Dalamud Clavicule (dans le jeu : /clavicule).
          </ThemedText>
          <Button label="Saisir le code du plugin" variant="secondary" onPress={() => router.push({ pathname: '/connect', params: { id: String(id), name: main.name } })} />
        </Card>
      ) : null}

      <ResetBoard now={now} />

      {main && link ? (
        <Section title="Raccourcis">
          <MenuGrid>
            <MenuTile icon={MenuIcons.ath} title="ATH" subtitle="Disposition de l’interface" onPress={() => router.push({ pathname: '/hud/[id]', params: { id: String(id) } })} />
            <MenuTile icon={MenuIcons.barres} title="Barres d’actions" subtitle="Par job" onPress={() => router.push({ pathname: '/hotbars/[id]', params: { id: String(id) } })} />
          </MenuGrid>
        </Section>
      ) : null}
    </Screen>
  );
}
