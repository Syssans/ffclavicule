import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Empty, ErrorBox, Input, ListRow, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { searchCharacters, type CharacterSearchResult } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';

export default function CharacterSearchScreen() {
  const region = useAppStore((s) => s.region);
  const saveCharacter = useAppStore((s) => s.saveCharacter);
  const [name, setName] = useState('');
  const [world, setWorld] = useState('');
  const [submitted, setSubmitted] = useState<{ name: string; world: string } | null>(null);

  const search = useQuery({
    queryKey: ['lodestone', 'search', region, submitted],
    queryFn: () => searchCharacters(region, submitted!.name, submitted!.world),
    enabled: submitted !== null,
  });

  const canSearch = name.trim().length >= 2;
  const submit = () => canSearch && setSubmitted({ name: name.trim(), world: world.trim() });

  const pick = (c: CharacterSearchResult) => {
    saveCharacter({ id: c.id, name: c.name, world: c.world, dataCenter: c.dataCenter, avatar: c.avatar });
    router.replace({ pathname: '/character/[id]', params: { id: String(c.id) } });
  };

  return (
    <Screen>
      <View style={{ gap: Spacing.two }}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Nom du personnage"
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={submit}
          accessibilityLabel="Nom du personnage"
        />
        <Input
          value={world}
          onChangeText={setWorld}
          placeholder="Monde (facultatif, ex. Moogle)"
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={submit}
          accessibilityLabel="Monde"
        />
        <Button label="Rechercher" onPress={submit} disabled={!canSearch} />
      </View>

      {search.isFetching ? <Loading label="Recherche sur le Lodestone…" /> : null}
      {search.error ? <ErrorBox error={search.error} onRetry={() => search.refetch()} /> : null}
      {search.data && !search.isFetching ? (
        search.data.results.length === 0 ? (
          <Empty>Aucun personnage trouvé. Vérifie l’orthographe et le monde.</Empty>
        ) : (
          <View style={{ gap: Spacing.two }}>
            {search.data.results.map((c) => (
              <ListRow
                key={c.id}
                image={c.avatar}
                title={c.name}
                subtitle={[c.world, c.dataCenter].filter(Boolean).join(' · ')}
                onPress={() => pick(c)}
              />
            ))}
            {search.data.totalPages > 1 ? (
              <Empty>Seule la première page de résultats est affichée : précise le monde pour affiner.</Empty>
            ) : null}
          </View>
        )
      ) : null}
    </Screen>
  );
}
