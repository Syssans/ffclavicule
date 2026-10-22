import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Empty, ListRow, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';

export default function CharactersScreen() {
  const theme = useTheme();
  const characters = useAppStore((s) => s.characters);
  const mainCharacterId = useAppStore((s) => s.mainCharacterId);
  const sorted = [...characters].sort((a, b) =>
    a.id === mainCharacterId ? -1 : b.id === mainCharacterId ? 1 : a.name.localeCompare(b.name),
  );

  return (
    <Screen title="Personnages" tab>
      {sorted.length === 0 ? (
        <Card>
          <ThemedText>Aucun personnage suivi.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ajoute ton personnage pour voir ses jobs, son équipement et ses collections.
          </ThemedText>
        </Card>
      ) : (
        sorted.map((c) => (
          <ListRow
            key={c.id}
            image={c.avatar}
            title={c.name}
            subtitle={[c.world, c.dataCenter].filter(Boolean).join(' · ')}
            right={
              c.id === mainCharacterId ? (
                <ThemedText type="smallBold" style={{ color: theme.accent }}>
                  Principal
                </ThemedText>
              ) : undefined
            }
            onPress={() => router.push({ pathname: '/character/[id]', params: { id: String(c.id) } })}
          />
        ))
      )}
      <Button label="Ajouter un personnage" onPress={() => router.push('/character/search')} />
      {sorted.length > 0 ? null : <Empty>Les données viennent du Lodestone, le site officiel du jeu.</Empty>}
    </Screen>
  );
}
