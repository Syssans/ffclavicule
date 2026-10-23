/** Fiche d'un personnage (un personnage suivi, ou trouvé par la recherche). */
import { Stack, useLocalSearchParams } from 'expo-router';

import { CharacterView } from '@/components/character/character-view';
import { Screen } from '@/components/ui';

export default function CharacterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Stack.Screen options={{ title: '' }} />
      <CharacterView id={Number(id)} />
    </Screen>
  );
}
