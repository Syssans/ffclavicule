/** Fiche d'une recette : artisan et niveau, arbre des ingrédients, liste de courses, étapes, coût et bénéfice. */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { recipesForItems } from '@/api/crafting';
import { CraftPlanView, CrafterBadge, jobIconOf, TreeView } from '@/components/crafting/plan-view';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Chip, ErrorBox, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useOwnedItems, useRecipe, useRecipeBook } from '@/hooks/use-crafting';
import { useTheme } from '@/hooks/use-theme';
import { useCraftStore } from '@/store/craft-store';
import { crafterOf, craftTree } from '@/utils/crafting';

const QUICK = [1, 3, 5, 10, 20, 99];

export default function RecipeScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const recipe = useRecipe(id);
  const [quantity, setQuantity] = useState(1);
  const r = recipe.data;

  return (
    <Screen>
      <Stack.Screen options={{ title: r?.name ?? 'Recette' }} />
      {recipe.isPending ? <Loading label="Lecture de la recette…" /> : null}
      {recipe.error ? <ErrorBox error={recipe.error} onRetry={() => recipe.refetch()} /> : null}
      {r ? <RecipeBody key={r.id} recipeId={r.id} quantity={quantity} setQuantity={setQuantity} /> : null}
    </Screen>
  );
}

function RecipeBody({ recipeId, quantity, setQuantity }: { recipeId: number; quantity: number; setQuantity: (n: number) => void }) {
  const theme = useTheme();
  const r = useRecipe(recipeId).data!;
  const { book } = useRecipeBook([r]);
  const { owned, linked } = useOwnedItems();
  const tree = useMemo(() => craftTree(r, quantity, book), [r, quantity, book]);
  const addToList = useCraftStore((s) => s.addToList);
  const inList = useCraftStore((s) => s.list.find((e) => e.recipeId === r.id));
  const others = useQuery({ queryKey: ['craft', 'for-item', r.itemId], queryFn: () => recipesForItems([r.itemId]), staleTime: 24 * 3600_000 });
  const targets = useMemo(() => [{ recipe: r, quantity }], [r, quantity]);

  return (
    <>
      <GameWindow
        image={r.icon}
        title={r.name}
        subtitle={r.amount > 1 ? `${r.amount} objets par fabrication` : null}
        right={<MenuIcon id={jobIconOf(r.craftType)} size={36} />}>
        <CrafterBadge recipe={r} />
        <View style={styles.badges}>
          {r.canHq ? <Badge label="HQ possible" tone="accent" /> : null}
          {r.expert ? <Badge label="Recette experte" tone="down" /> : null}
          {r.masterBook ? <Badge label={r.masterBook} /> : null}
        </View>
        {(others.data?.length ?? 0) > 1 ? (
          <View style={styles.chips}>
            {others.data!.map((o) => (
              <Chip
                key={o.id}
                label={crafterOf(o.craftType)?.job.abbr ?? '?'}
                selected={o.id === r.id}
                onPress={() => o.id !== r.id && router.replace({ pathname: '/crafting/recipe/[id]', params: { id: String(o.id) } })}
              />
            ))}
          </View>
        ) : null}
      </GameWindow>

      <View style={[styles.quantity, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="smallBold">Quantité voulue</ThemedText>
        <View style={styles.stepper}>
          <Stepper label="−" onPress={() => setQuantity(Math.max(1, quantity - 1))} />
          <ThemedText type="subtitle" style={[styles.count, { color: theme.ornament }]}>
            {quantity}
          </ThemedText>
          <Stepper label="+" onPress={() => setQuantity(Math.min(9999, quantity + 1))} />
        </View>
        <View style={styles.chips}>
          {QUICK.map((q) => (
            <Chip key={q} label={`×${q}`} selected={quantity === q} onPress={() => setQuantity(q)} />
          ))}
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <Button
              label={inList ? `Ajouter (${inList.quantity} dans la liste)` : 'Ajouter à ma liste'}
              onPress={() => addToList({ recipeId: r.id, itemId: r.itemId, name: r.name, icon: r.icon, quantity })}
            />
          </View>
          <View style={styles.flex}>
            <Button label="Voir au marché" variant="secondary" onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(r.itemId) } })} />
          </View>
        </View>
      </View>

      <GameWindow icon={jobIconOf(r.craftType)} title="Ingrédients" subtitle="Touche une étape pour la déplier, un objet pour son prix">
        <TreeView node={tree} owned={linked ? owned : undefined} />
      </GameWindow>

      <CraftPlanView targets={targets} />
    </>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'Un de plus' : 'Un de moins'}
      onPress={onPress}
      style={({ pressed }) => [styles.stepButton, { borderColor: theme.accent }, pressed && { opacity: 0.6 }]}>
      <ThemedText type="subtitle" style={{ color: theme.accent }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  quantity: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  stepButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 60, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: Spacing.two },
});
