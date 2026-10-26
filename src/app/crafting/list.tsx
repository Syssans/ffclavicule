/** Ma liste d'artisanat : plusieurs recettes à la fois, avec une seule liste de courses pour tout. */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useQueries } from '@tanstack/react-query';

import { getRecipe, type Recipe } from '@/api/crafting';
import { CraftPlanView } from '@/components/crafting/plan-view';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, GameIcon, Loading, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useCraftStore } from '@/store/craft-store';

export default function CraftListScreen() {
  const theme = useTheme();
  const list = useCraftStore((s) => s.list);
  const setQuantity = useCraftStore((s) => s.setQuantity);
  const remove = useCraftStore((s) => s.removeFromList);
  const clear = useCraftStore((s) => s.clearList);

  const recipes = useQueries({
    queries: list.map((e) => ({ queryKey: ['craft', 'recipe', e.recipeId], queryFn: () => getRecipe(e.recipeId), staleTime: 24 * 3600_000 })),
  });
  const loaded = recipes.every((q) => q.data);
  const targets = useMemo(
    () =>
      loaded
        ? list.map((e, i) => ({ recipe: recipes[i].data as Recipe, quantity: e.quantity }))
        : [],
    // Les recettes chargées ne changent pas : la liste et ses quantités suffisent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, list],
  );

  if (list.length === 0) {
    return (
      <Screen>
        <Empty>Ta liste est vide. Ouvre une recette et touche « Ajouter à ma liste » : tout ce qu’il faut pour l’ensemble apparaîtra ici.</Empty>
        <Button label="Chercher une recette" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <GameWindow icon={GameIcons.deliveries} title="À fabriquer" subtitle={`${list.length} recette${list.length > 1 ? 's' : ''}`}>
        {list.map((e, i) => (
          <View key={e.recipeId} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(e.recipeId) } })}
              style={styles.name}>
              <GameIcon uri={e.icon} size={36} />
              <ThemedText type="small" numberOfLines={2} style={styles.flex}>
                {e.name}
              </ThemedText>
            </Pressable>
            <Small label="−" onPress={() => (e.quantity > 1 ? setQuantity(e.recipeId, e.quantity - 1) : remove(e.recipeId))} />
            <ThemedText type="smallBold" style={[styles.qty, { color: theme.ornament }]}>
              {e.quantity}
            </ThemedText>
            <Small label="+" onPress={() => setQuantity(e.recipeId, e.quantity + 1)} />
          </View>
        ))}
        <Button label="Vider la liste" variant="danger" onPress={clear} />
      </GameWindow>
      {loaded ? <CraftPlanView targets={targets} /> : <Loading label="Lecture des recettes…" />}
    </Screen>
  );
}

function Small({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Un de plus' : 'Un de moins'}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.small, { borderColor: theme.accent }, pressed && { opacity: 0.6 }]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  name: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  qty: { minWidth: 32, textAlign: 'center' },
  small: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
