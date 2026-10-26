/**
 * Rentabilité au marché : pour un artisan et une tranche de niveaux, les fabrications qui rapportent le plus
 * par jour sur le serveur choisi (ingrédients achetés au plus bas, objet vendu au prix le plus bas en vente).
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { recipesForJob } from '@/api/crafting';
import { getCraftPrices } from '@/api/universalis';
import { jobIconOf, stars } from '@/components/crafting/plan-view';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Chip, Empty, ErrorBox, GameIcon, Loading, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useCrafterLevels } from '@/hooks/use-crafting';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { CRAFTERS, rankProfits } from '@/utils/crafting';
import { formatGil, formatNumber } from '@/utils/format';

const BANDS = [
  { key: '1-50', min: 1, max: 50 },
  { key: '51-70', min: 51, max: 70 },
  { key: '71-90', min: 71, max: 90 },
  { key: '91-100', min: 91, max: 100 },
];

export default function ProfitScreen() {
  const scope = useAppStore((s) => s.marketScope);
  const { levels } = useCrafterLevels();
  const best = CRAFTERS.reduce((a, c) => ((levels.get(c.craftType)?.level ?? 0) > (levels.get(a.craftType)?.level ?? 0) ? c : a), CRAFTERS[1]);
  const [craftType, setCraftType] = useState<number | null>(null);
  const job = craftType ?? best.craftType;
  const myLevel = levels.get(job)?.level ?? null;
  const [band, setBand] = useState<string | null>(null);
  const range =
    band === 'mine' && myLevel
      ? { min: Math.max(1, myLevel - 9), max: myLevel }
      : (BANDS.find((b) => b.key === band) ?? (myLevel ? { min: Math.max(1, myLevel - 9), max: myLevel } : BANDS[3]));

  const ranking = useQuery({
    queryKey: ['craft', 'profit', job, range.min, range.max, scope],
    queryFn: async () => {
      const recipes = await recipesForJob(job, range.min, range.max, 400);
      const ids = recipes.flatMap((r) => [r.itemId, ...r.ingredients.map((i) => i.itemId), ...r.crystals.map((c) => c.itemId)]);
      const prices = await getCraftPrices(scope, ids);
      return { count: recipes.length, rows: rankProfits(recipes, prices).slice(0, 60) };
    },
    staleTime: 15 * 60_000,
  });

  return (
    <Screen>
      <ThemedText type="small" themeColor="textSecondary">
        Sur {scope} : ingrédients achetés au plus bas, objet vendu au prix le moins cher en vente (HQ si possible). Classées par bénéfice
        possible par jour, en ne gardant que ce qui se vend.
      </ThemedText>
      <View style={styles.jobs}>
        {CRAFTERS.map((c) => (
          <Pressable
            key={c.craftType}
            accessibilityRole="tab"
            accessibilityState={{ selected: c.craftType === job }}
            accessibilityLabel={c.job.name}
            onPress={() => setCraftType(c.craftType)}
            style={({ pressed }) => [styles.job, c.craftType === job && styles.jobOn, pressed && { opacity: 0.7 }]}>
            <MenuIcon id={jobIconOf(c.craftType)} size={34} dimmed={c.craftType !== job} />
          </Pressable>
        ))}
      </View>
      <View style={styles.chips}>
        {myLevel ? <Chip label={`Mon niveau (${Math.max(1, myLevel - 9)}-${myLevel})`} selected={band === 'mine' || (band === null && Boolean(myLevel))} onPress={() => setBand('mine')} /> : null}
        {BANDS.map((b) => (
          <Chip key={b.key} label={`Niv. ${b.key}`} selected={band === b.key || (band === null && !myLevel && b.key === '91-100')} onPress={() => setBand(b.key)} />
        ))}
      </View>
      {ranking.isPending ? <Loading label="Recettes et prix du marché…" /> : null}
      {ranking.error ? <ErrorBox error={ranking.error} onRetry={() => ranking.refetch()} /> : null}
      {ranking.data ? <Ranking rows={ranking.data.rows} count={ranking.data.count} craftType={job} /> : null}
    </Screen>
  );
}

function Ranking({ rows, count, craftType }: { rows: ReturnType<typeof rankProfits>; count: number; craftType: number }) {
  const theme = useTheme();
  const crafter = CRAFTERS.find((c) => c.craftType === craftType)!;
  if (rows.length === 0) return <Empty>Aucune des {count} recettes ne rapporte en ce moment (ou elles ne se vendent pas).</Empty>;
  return (
    <GameWindow icon={GameIcons.gil} title={crafter.job.name} subtitle={`${rows.length} rentables sur ${count} recettes`}>
      {rows.map((row, i) => (
        <Pressable
          key={row.recipe.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(row.recipe.id) } })}
          style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
          <ThemedText type="smallBold" style={[styles.rank, { color: theme.ornament }]}>
            {i + 1}
          </ThemedText>
          <GameIcon uri={row.recipe.icon} size={36} />
          <View style={styles.flex}>
            <ThemedText type="small" numberOfLines={1}>
              {row.recipe.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
              Niv. {row.recipe.level}
              {stars(row.recipe.stars)} · coût {formatGil(row.craftCost)} · vente {formatGil(row.sale)}
              {row.hq ? ' HQ' : ''}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
              {formatNumber(row.velocity)} vente{row.velocity > 1 ? 's' : ''}/jour · jusqu’à {formatGil(row.perDay)}/jour
            </ThemedText>
          </View>
          <View style={styles.gain}>
            <ThemedText type="smallBold" style={{ color: theme.success }}>
              +{formatGil(row.profit)}
            </ThemedText>
            <Badge label={`${row.margin} %`} tone="up" />
          </View>
        </Pressable>
      ))}
    </GameWindow>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  jobs: { flexDirection: 'row', justifyContent: 'space-between' },
  job: { padding: 4, borderRadius: 10, borderWidth: 1.5, borderColor: 'transparent' },
  jobOn: { borderColor: '#C9A45C' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  rank: { width: 20, textAlign: 'center' },
  gain: { alignItems: 'flex-end', gap: 2 },
});
