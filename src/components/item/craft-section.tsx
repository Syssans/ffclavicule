/** Partie « Artisanat » de la fiche d'un objet : les recettes qui le fabriquent. */
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Recipe } from '@/api/crafting';
import { CrafterBadge } from '@/components/crafting/plan-view';
import { GameWindow } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function CraftSection({ recipes }: { recipes: Recipe[] }) {
  const theme = useTheme();
  if (!recipes.length) return null;
  return (
    <GameWindow icon={MenuIcons.artisanat} title="Artisanat" subtitle={recipes.length > 1 ? `${recipes.length} recettes` : 'Recette, sous-recettes et liste de courses'}>
      {recipes.map((r, i) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(r.id) } })}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
          <View style={styles.flex}>
            <CrafterBadge recipe={r} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {r.amount > 1 ? `${r.amount} par fabrication · ` : ''}
              {r.ingredients.length} matière{r.ingredients.length > 1 ? 's' : ''}
              {r.masterBook ? ` · ${r.masterBook}` : ''}
            </ThemedText>
          </View>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </Pressable>
      ))}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
});
