/**
 * Guide de montée en niveau d'un artisan : niveau et XP lus sur le Lodestone, mandats de ton palier avec le nombre
 * de remises pour passer au niveau suivant, et recettes de ton niveau à fabriquer.
 */
import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { craftLeves, recipesForItems, recipesForJob, type CraftLeve } from '@/api/crafting';
import { jobIconOf, stars } from '@/components/crafting/plan-view';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Chip, Empty, ErrorBox, GameIcon, Loading, ProgressBar, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useCrafterLevels } from '@/hooks/use-crafting';
import { useTheme } from '@/hooks/use-theme';
import { crafterOf, leveBrackets, MAX_CRAFTER_LEVEL, turnInsNeeded } from '@/utils/crafting';
import { formatGil, formatNumber } from '@/utils/format';

export default function CrafterGuideScreen() {
  const theme = useTheme();
  const craftType = Number(useLocalSearchParams<{ craftType: string }>().craftType);
  const crafter = crafterOf(craftType);
  const { levels, character } = useCrafterLevels();
  const known = levels.get(craftType);
  const [manual, setManual] = useState<number | null>(null);
  const level = manual ?? known?.level ?? 1;
  const expToGo = manual === null && known?.exp !== null && known?.maxExp ? Math.max(0, known.maxExp - (known.exp ?? 0)) : null;

  const leves = useQuery({
    queryKey: ['craft', 'leves', craftType, level],
    queryFn: () => craftLeves(craftType, Math.max(1, level - 10), level),
    enabled: level < MAX_CRAFTER_LEVEL,
    staleTime: 24 * 3600_000,
  });
  const recipes = useQuery({
    queryKey: ['craft', 'job-recipes', craftType, level],
    queryFn: () => recipesForJob(craftType, Math.max(1, level - 2), level, 200),
    staleTime: 24 * 3600_000,
  });
  const brackets = leveBrackets(leves.data ?? [], level);
  const shownLeves = (leves.data ?? []).filter((l) => brackets.includes(l.level));

  if (!crafter) return <Empty>Artisan inconnu.</Empty>;
  return (
    <Screen>
      <Stack.Screen options={{ title: crafter.job.name }} />
      <GameWindow
        icon={jobIconOf(craftType)}
        title={crafter.job.name}
        subtitle={
          manual !== null
            ? `Niveau choisi : ${level}`
            : known?.level
              ? `${character?.name ?? 'Ton personnage'} · niveau ${known.level}`
              : character
                ? 'Pas encore débloqué (d’après le Lodestone)'
                : 'Ajoute ton personnage pour suivre ton niveau'
        }>
        {level >= MAX_CRAFTER_LEVEL ? (
          <ThemedText type="small">Niveau maximum : place aux fabrications rentables et aux recettes de maître.</ThemedText>
        ) : (
          <>
            <ProgressBar value={known?.exp && known.maxExp && manual === null ? known.exp / known.maxExp : 0} />
            {expToGo !== null ? (
              <ThemedText type="small" themeColor="textSecondary">
                {formatNumber(expToGo)} points d’expérience avant le niveau {level + 1}.
              </ThemedText>
            ) : null}
          </>
        )}
        <View style={styles.chips}>
          <Chip label="−5" onPress={() => setManual(Math.max(1, level - 5))} />
          <Chip label="−1" onPress={() => setManual(Math.max(1, level - 1))} />
          <Chip label="+1" onPress={() => setManual(Math.min(MAX_CRAFTER_LEVEL, level + 1))} />
          <Chip label="+5" onPress={() => setManual(Math.min(MAX_CRAFTER_LEVEL, level + 5))} />
          {manual !== null && known?.level ? <Chip label="Mon niveau" onPress={() => setManual(null)} /> : null}
        </View>
      </GameWindow>

      {level < MAX_CRAFTER_LEVEL ? (
        <GameWindow
          icon={GameIcons.leves}
          title="Mandats"
          subtitle={brackets.length ? `Niveau ${brackets.join(' et ')}` : null}>
          {leves.isPending ? <Loading label="Lecture des mandats…" /> : null}
          {leves.error ? <ErrorBox error={leves.error} onRetry={() => leves.refetch()} /> : null}
          {leves.data && shownLeves.length === 0 ? <Empty>Pas de mandat d’artisan à ce niveau : fabrique les recettes ci-dessous.</Empty> : null}
          {shownLeves.map((leve, i) => (
            <LeveRow key={leve.id} leve={leve} craftType={craftType} expToGo={expToGo} first={i === 0} />
          ))}
          {shownLeves.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Rendre l’objet en HQ double l’expérience et les gils. Chaque mandat coûte une autorisation (3 toutes les 12 h).
            </ThemedText>
          ) : null}
        </GameWindow>
      ) : null}

      <GameWindow icon={jobIconOf(craftType)} title="Recettes de ton niveau">
        {recipes.isPending ? <Loading label="Lecture des recettes…" /> : null}
        {recipes.error ? <ErrorBox error={recipes.error} onRetry={() => recipes.refetch()} /> : null}
        {recipes.data?.length === 0 ? <Empty>Aucune recette à ce niveau.</Empty> : null}
        {(recipes.data ?? [])
          .sort((a, b) => b.level - a.level || b.stars - a.stars)
          .slice(0, 40)
          .map((r, i) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(r.id) } })}
              style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
              <GameIcon uri={r.icon} size={36} />
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={1}>
                  {r.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
                  Niv. {r.level}
                  {stars(r.stars)}
                  {r.masterBook ? ` · ${r.masterBook}` : ''}
                </ThemedText>
              </View>
              <ThemedText themeColor="textSecondary">›</ThemedText>
            </Pressable>
          ))}
      </GameWindow>
    </Screen>
  );
}

function LeveRow({ leve, craftType, expToGo, first }: { leve: CraftLeve; craftType: number; expToGo: number | null; first: boolean }) {
  const theme = useTheme();
  const [opening, setOpening] = useState(false);
  const item = leve.items[0];
  const open = async () => {
    if (!item || opening) return;
    setOpening(true);
    try {
      const found = await recipesForItems([item.itemId]);
      const recipe = found.find((r) => r.craftType === craftType) ?? found[0];
      if (recipe) router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(recipe.id) } });
      else router.push({ pathname: '/item/[id]', params: { id: String(item.itemId) } });
    } finally {
      setOpening(false);
    }
  };
  const needed = expToGo !== null ? turnInsNeeded(expToGo, leve) : null;
  const neededHq = expToGo !== null ? turnInsNeeded(expToGo, leve, true) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [styles.leve, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={item?.icon} size={40} />
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {leve.name}
        </ThemedText>
        {item ? (
          <ThemedText type="small" numberOfLines={1}>
            {leve.items.map((it) => `${it.name} ×${it.count}`).join(', ')}
          </ThemedText>
        ) : null}
        <View style={styles.leveInfo}>
          <MenuIcon id={GameIcons.leves} size={14} />
          <ThemedText type="small" themeColor="textSecondary" style={[styles.tiny, styles.flex]} numberOfLines={1}>
            Niv. {leve.level} · {formatNumber(leve.exp)} XP · {formatGil(leve.gil)}
            {leve.place ? ` · ${leve.place}` : ''}
          </ThemedText>
        </View>
      </View>
      {needed !== null ? (
        <View style={styles.needed}>
          <Badge label={`${needed}×`} tone="accent" />
          <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
            {neededHq}× en HQ
          </ThemedText>
        </View>
      ) : null}
      {opening ? <Loading /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  leve: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  leveInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  needed: { alignItems: 'flex-end', gap: 2 },
});
