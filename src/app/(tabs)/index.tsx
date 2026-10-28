/** Onglet Personnages (premier onglet) : la fiche du personnage choisi, le principal par défaut. */
import { useState } from 'react';

import { CharacterView } from '@/components/character/character-view';
import { CharacterSwitcher, SettingsButton, useMainCharacter, Welcome } from '@/components/home';
import { Screen } from '@/components/ui';
import { useAppStore } from '@/store/app-store';

export default function PersonnageScreen() {
  const main = useMainCharacter();
  const characters = useAppStore((s) => s.characters);
  const [chosen, setChosen] = useState<number | null>(null);
  const selected = chosen !== null && characters.some((c) => c.id === chosen) ? chosen : (main?.id ?? null);

  return (
    <Screen title="Personnages" tab right={<SettingsButton />}>
      {selected === null ? (
        <Welcome />
      ) : (
        <>
          <CharacterSwitcher selected={selected} onSelect={setChosen} />
          <CharacterView key={selected} id={selected} />
        </>
      )}
    </Screen>
  );
}
