/** Module Artisanat : chercher une recette, ma liste, la rentabilité au marché et le guide de chaque artisan. */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { searchRecipes } from '@/api/crafting';
import { CrafterBadge } from '@/components/crafting/plan-view';
import { GameWindow, MenuEntry, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Empty, ErrorBox, GameIcon, Input, Loading, ProgressBar, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useCrafterLevels } from '@/hooks/use-crafting';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { useCraftStore } from '@/store/craft-store';
import { CRAFTERS, MAX_CRAFTER_LEVEL } from '@/utils/crafting';

export default function CraftingScreen() {
  const [text, setText] = useState('');
  const query = useDebounced(text.trim(), 400);
  return (
    <Screen>
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Chercher une recette (ex. lingot de mithril)"
        returnKeyType="search"
        clearButtonMode="while-editing"
        accessibilityLabel="Chercher une recette"
      />
      {query.length >= 2 ? <Results query={query} /> : <Home />}
    </Screen>
  );
}

function Results({ query }: { query: string }) {
  const theme = useTheme();
  const results = useQuery({ queryKey: ['craft', 'search', query], queryFn: () => searchRecipes(query), staleTime: 24 * 3600_000 });
  if (results.isPending) return <Loading label="Recherche des recettes…" />;
  if (results.error) return <ErrorBox error={results.error} onRetry={() => results.refetch()} />;
  if (results.data.length === 0) return <Empty>Aucune recette ne fabrique un objet de ce nom.</Empty>;
  return (
    <GameWindow icon={GameIcons.deliveries} title="Recettes">
      {results.data.map((r, i) => (
        <Pressable
          key={r.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(r.id) } })}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
          <GameIcon uri={r.icon} size={40} />
          <View style={styles.flex}>
            <ThemedText type="small" numberOfLines={1}>
              {r.name}
              {r.amount > 1 ? ` ×${r.amount}` : ''}
            </ThemedText>
            <CrafterBadge recipe={r} size={18} />
          </View>
          <ThemedText themeColor="textSecondary">›</ThemedText>
        </Pressable>
      ))}
    </GameWindow>
  );
}

function Home() {
  const theme = useTheme();
  const list = useCraftStore((s) => s.list);
  const { levels, query, character } = useCrafterLevels();
  return (
    <>
      <MenuEntry
        icon={GameIcons.deliveries}
        title="Ma liste"
        status={list.length ? `${list.length} recette${list.length > 1 ? 's' : ''}` : 'Vide'}
        onPress={() => router.push('/crafting/list')}
      />
      <MenuEntry
        icon={GameIcons.marketBoard}
        title="Rentabilité"
        onPress={() => router.push('/crafting/profit')}
      />
      <GameWindow
        icon={22}
        title="Mes artisans"
        subtitle={character ? character.name : null}>
        {query.isPending && character ? <Loading label="Lecture du Lodestone…" /> : null}
        <View style={styles.crafters}>
          {CRAFTERS.map((c) => {
            const l = levels.get(c.craftType);
            const level = l?.level ?? null;
            return (
              <Pressable
                key={c.craftType}
                accessibilityRole="button"
                accessibilityLabel={`${c.job.name}, ${level ? `niveau ${level}` : 'non débloqué'}`}
                onPress={() => router.push({ pathname: '/crafting/job/[craftType]', params: { craftType: String(c.craftType) } })}
                style={({ pressed }) => [styles.crafter, { borderColor: theme.frame, backgroundColor: theme.background }, pressed && { opacity: 0.7 }]}>
                <MenuIcon id={62100 + c.job.id} size={36} dimmed={character ? !level : false} />
                <ThemedText type="small" numberOfLines={1} style={styles.abbr}>
                  {c.job.abbr}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: level === MAX_CRAFTER_LEVEL ? theme.ornament : theme.text }}>
                  {level ?? '—'}
                </ThemedText>
                <ProgressBar value={level === MAX_CRAFTER_LEVEL ? 1 : l?.exp && l.maxExp ? l.exp / l.maxExp : 0} />
              </Pressable>
            );
          })}
        </View>
      </GameWindow>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  crafters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  crafter: { flexBasis: '22%', flexGrow: 1, alignItems: 'center', gap: 2, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
  abbr: { fontSize: 12, lineHeight: 16 },
});
