/**
 * Blocs de l'artisanat : badge d'artisan, arbre des ingrédients, et le plan complet d'une ou plusieurs recettes
 * (liste de courses avec provenance et prix, cristaux, étapes de fabrication, coût et bénéfice).
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import type { ItemSource, Recipe } from '@/api/crafting';
import { gameIconUrl } from '@/api/xivapi';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Badge, Empty, ErrorBox, GameIcon, Loading } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { Spacing } from '@/constants/theme';
import { useCraftPrices, useItemSources, useOwnedItems, useRecipeBook } from '@/hooks/use-crafting';
import { useTheme } from '@/hooks/use-theme';
import { buyPrice, crafterOf, ownedCounts, planCrafts, recipeProfit, unitCosts, type Owned, type PlanEntry, type TreeNode } from '@/utils/crafting';
import { formatGil, formatNumber } from '@/utils/format';
import { gatherableItems } from '@/utils/gathering';

/** Icônes des récolteurs (classes 16 à 18). */
const GATHERER_ICONS = { miner: 62116, botanist: 62117, fisher: 62118 } as const;
const GATHERER_NAMES = { miner: 'Mineur', botanist: 'Botaniste', fisher: 'Pêcheur' } as const;

export function jobIconOf(craftType: number): number {
  return 62100 + (crafterOf(craftType)?.job.id ?? 8);
}

export function stars(n: number): string {
  return n > 0 ? ` ${'★'.repeat(n)}` : '';
}

/** « Forgeron niv. 50 ★★ » avec l'icône du job. */
export function CrafterBadge({ recipe, size = 22 }: { recipe: Recipe; size?: number }) {
  const crafter = crafterOf(recipe.craftType);
  return (
    <View style={styles.badge}>
      <MenuIcon id={jobIconOf(recipe.craftType)} size={size} />
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {crafter?.job.name ?? 'Artisan'} niv. {recipe.level}
        {stars(recipe.stars)}
      </ThemedText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Arbre
// ---------------------------------------------------------------------------

export function TreeView({ node, owned }: { node: TreeNode; owned?: Map<number, Owned> }) {
  return (
    <View>
      {node.children.map((child, i) => (
        <TreeRow key={`${child.itemId}-${i}`} node={child} depth={0} owned={owned} />
      ))}
    </View>
  );
}

function TreeRow({ node, depth, owned }: { node: TreeNode; depth: number; owned?: Map<number, Owned> }) {
  const theme = useTheme();
  const [open, setOpen] = useState(depth < 1);
  const have = owned?.get(node.itemId)?.count ?? 0;
  const enough = owned && have >= node.quantity;
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${node.name}, ${node.quantity}${node.recipe ? ', se fabrique' : ''}`}
        onPress={() => (node.recipe ? setOpen(!open) : router.push({ pathname: '/item/[id]', params: { id: String(node.itemId) } }))}
        style={({ pressed }) => [styles.treeRow, { paddingLeft: depth * 18 }, pressed && { opacity: 0.7 }]}>
        {depth > 0 ? <View style={[styles.treeLine, { backgroundColor: theme.frame, left: depth * 18 - 10 }]} /> : null}
        <GameIcon uri={node.icon} size={node.crystal ? 24 : 32} />
        <View style={styles.flex}>
          <ThemedText type="small" numberOfLines={1}>
            {node.name}
          </ThemedText>
          {node.recipe ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
              {open ? '▾' : '▸'} {crafterOf(node.recipe.craftType)?.job.name} niv. {node.recipe.level} · {node.crafts} fabrication{node.crafts > 1 ? 's' : ''}
            </ThemedText>
          ) : null}
        </View>
        {owned && have > 0 ? (
          <ThemedText type="small" style={[styles.tiny, { color: enough ? theme.success : theme.textSecondary }]}>
            {enough ? '✓' : `${formatNumber(have)}/`}
          </ThemedText>
        ) : null}
        <ThemedText type="smallBold">×{formatNumber(node.quantity)}</ThemedText>
      </Pressable>
      {node.recipe && open ? node.children.map((child, i) => <TreeRow key={`${child.itemId}-${i}`} node={child} depth={depth + 1} owned={owned} />) : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Plan complet
// ---------------------------------------------------------------------------

export function CraftPlanView({ targets }: { targets: { recipe: Recipe; quantity: number }[] }) {
  const theme = useTheme();
  const { book, query } = useRecipeBook(targets.map((t) => t.recipe));
  const { owned, linked, name } = useOwnedItems();
  const [useInventory, setUseInventory] = useState(true);
  const plan = useMemo(
    () => planCrafts(targets, book, linked && useInventory ? ownedCounts(owned) : new Map()),
    [targets, book, owned, linked, useInventory],
  );
  const allIds = useMemo(() => [...plan.steps, ...plan.materials, ...plan.crystals].map((e) => e.itemId), [plan]);
  const prices = useCraftPrices(allIds);
  const sources = useItemSources(plan.materials.map((m) => m.itemId));

  const vendors = useMemo(() => {
    const out = new Map<number, number>();
    for (const [id, s] of sources.data ?? []) if (s.vendorPrice) out.set(id, s.vendorPrice);
    return out;
  }, [sources.data]);
  const cost = useMemo(() => unitCosts(book, prices.data ?? new Map(), vendors), [book, prices.data, vendors]);

  if (query.isPending) return <Loading label="Lecture des sous-recettes…" />;
  if (query.error) return <ErrorBox error={query.error} onRetry={() => query.refetch()} />;

  const unitBuy = (id: number) => buyPrice(prices.data?.get(id), vendors.get(id));
  const materialsCost = [...plan.materials, ...plan.crystals].reduce((sum, e) => sum + (unitBuy(e.itemId) ?? 0) * e.missing, 0);
  const missingPrices = [...plan.materials, ...plan.crystals].filter((e) => e.missing > 0 && unitBuy(e.itemId) === null).length;
  const profits = targets.map((t) => ({ t, p: recipeProfit(t.recipe, cost, prices.data?.get(t.recipe.itemId)) }));
  const steps = plan.steps.filter((s) => s.crafts > 0);

  return (
    <>
      {linked ? (
        <View style={[styles.inventory, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
          <MenuIcon id={2} size={28} />
          <ThemedText type="small" style={styles.flex}>
            Déduire ce que possède {name ?? 'mon personnage'} (sacs, sacoches, servants)
          </ThemedText>
          <Switch value={useInventory} onValueChange={setUseInventory} trackColor={{ true: theme.accent }} />
        </View>
      ) : null}

      <GameWindow
        icon={GameIcons.marketBoard}
        title="Liste de courses"
        subtitle={
          plan.materials.length
            ? `${plan.materials.filter((m) => m.missing > 0).length} matière${plan.materials.length > 1 ? 's' : ''} à obtenir${prices.data ? ` · ${formatGil(Math.round(materialsCost))} au plus bas` : ''}`
            : 'Aucune matière première'
        }>
        {plan.materials.length === 0 ? <Empty>Tout se fabrique à partir de cristaux.</Empty> : null}
        {plan.materials.map((m, i) => (
          <MaterialRow key={m.itemId} entry={m} first={i === 0} source={sources.data?.get(m.itemId)} unit={unitBuy(m.itemId)} showOwned={linked && useInventory} owned={owned.get(m.itemId)} />
        ))}
        {sources.isPending && plan.materials.length > 0 ? <Loading label="Provenance des matières…" /> : null}
      </GameWindow>

      {plan.crystals.length > 0 ? (
        <GameWindow icon={20001} title="Cristaux" subtitle={`${plan.crystals.reduce((s, c) => s + c.missing, 0)} à obtenir`}>
          <View style={styles.crystals}>
            {plan.crystals.map((c) => (
              <View key={c.itemId} style={styles.crystal}>
                <GameIcon uri={c.icon ?? gameIconUrl(20000 + c.itemId - 1)} size={28} />
                <View style={styles.flex}>
                  <ThemedText type="small" numberOfLines={1}>
                    {c.name}
                  </ThemedText>
                  <ThemedText type="smallBold">
                    ×{formatNumber(c.missing)}
                    {c.owned > 0 ? <ThemedText type="small" themeColor="textSecondary">{`  (${formatNumber(c.owned)} en poche)`}</ThemedText> : null}
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        </GameWindow>
      ) : null}

      {steps.length > 0 ? (
        <GameWindow icon={GameIcons.deliveries} title="Étapes" subtitle="Dans l’ordre, de la première à la dernière fabrication">
          {steps.map((s, i) => (
            <StepRow key={s.itemId} entry={s} index={i + 1} first={i === 0} />
          ))}
        </GameWindow>
      ) : null}

      <GameWindow icon={GameIcons.gil} title="Coût et bénéfice" subtitle={`Prix du marché sur ${prices.data ? 'ton serveur' : '…'}`}>
        {prices.isPending ? <Loading label="Prix du marché…" /> : null}
        {prices.error ? <ErrorBox error={prices.error} onRetry={() => prices.refetch()} /> : null}
        {prices.data ? (
          <>
            <Line label="Matières premières et cristaux au plus bas" value={formatGil(Math.round(materialsCost))} />
            {missingPrices > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {missingPrices} matière{missingPrices > 1 ? 's' : ''} sans prix (ni marché ni marchand) : à récolter.
              </ThemedText>
            ) : null}
            {profits.map(({ t, p }) => (
              <View key={t.recipe.id} style={styles.profit}>
                {targets.length > 1 ? (
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {t.recipe.name} ×{t.quantity}
                  </ThemedText>
                ) : null}
                <Line label="Coût d’une fabrication (au mieux : acheter ou fabriquer chaque étape)" value={p.craftCost === null ? '—' : formatGil(p.craftCost)} />
                <Line label={`Prix de vente${p.hq ? ' HQ' : ''} (prudent : annonce la moins chère ou moyenne des ventes)`} value={p.sale === null ? 'Pas en vente' : formatGil(p.sale)} />
                {p.profit !== null ? (
                  <Line
                    label={`Bénéfice par fabrication${t.recipe.amount > 1 ? ` (${t.recipe.amount} objets)` : ''}`}
                    value={`${p.profit >= 0 ? '+' : ''}${formatGil(p.profit)}`}
                    color={p.profit >= 0 ? theme.success : theme.danger}
                  />
                ) : null}
                <Line label="Ventes par jour" value={formatNumber(Math.round(p.velocity * 10) / 10)} />
                {p.sale !== null && p.velocity < 0.2 ? (
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Se vend très rarement sur ce serveur : le bénéfice n’est pas garanti.
                  </ThemedText>
                ) : null}
              </View>
            ))}
          </>
        ) : null}
      </GameWindow>
    </>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.line}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={color ? { color } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

function sourceText(source: ItemSource | undefined): { icon: number; text: string }[] {
  const out: { icon: number; text: string }[] = [];
  if (source?.gathering) {
    const g = source.gathering;
    out.push({ icon: GATHERER_ICONS[g.job], text: `${GATHERER_NAMES[g.job]} niv. ${g.level}${g.place ? ` · ${g.place}` : ''}${g.hidden ? ' (caché)' : ''}` });
  }
  if (source?.fishing && !source.gathering) out.push({ icon: GATHERER_ICONS.fisher, text: 'Pêche' });
  if (source?.vendorPrice) out.push({ icon: GameIcons.gil, text: `Marchand : ${formatGil(source.vendorPrice)}` });
  return out;
}

function MaterialRow({
  entry,
  first,
  source,
  unit,
  showOwned,
  owned,
}: {
  entry: PlanEntry;
  first: boolean;
  source?: ItemSource;
  unit: number | null;
  showOwned: boolean;
  owned?: Owned;
}) {
  const theme = useTheme();
  const done = entry.missing === 0;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        gatherableItems().has(entry.itemId)
          ? router.push({ pathname: '/gathering/item/[id]', params: { id: String(entry.itemId) } })
          : router.push({ pathname: '/item/[id]', params: { id: String(entry.itemId) } })
      }
      style={({ pressed }) => [styles.material, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <GameIcon uri={entry.icon} size={36} dimmed={done} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1} style={done ? { color: theme.textSecondary } : undefined}>
          {entry.name}
        </ThemedText>
        {sourceText(source).map((s) => (
          <View key={s.text} style={styles.source}>
            <MenuIcon id={s.icon} size={14} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={[styles.tiny, styles.flex]}>
              {s.text}
            </ThemedText>
          </View>
        ))}
        {unit !== null && entry.missing > 0 ? (
          <View style={styles.source}>
            <MenuIcon id={GameIcons.marketBoard} size={14} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.tiny}>
              {formatGil(unit)} l’unité · {formatGil(Math.round(unit * entry.missing))}
            </ThemedText>
          </View>
        ) : null}
        {showOwned && owned && owned.count > 0 ? (
          <ThemedText type="small" numberOfLines={1} style={[styles.tiny, { color: theme.success }]}>
            En poche : {owned.places.map((p) => `${p.place} ${p.count}`).join(', ')}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.qty}>
        <ThemedText type="smallBold" style={done ? { color: theme.success } : undefined}>
          {done ? '✓' : `×${formatNumber(entry.missing)}`}
        </ThemedText>
        {entry.owned > 0 && !done ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.tiny}>
            sur {formatNumber(entry.need)}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

function StepRow({ entry, index, first }: { entry: PlanEntry; index: number; first: boolean }) {
  const theme = useTheme();
  const recipe = entry.recipe!;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/crafting/recipe/[id]', params: { id: String(recipe.id) } })}
      style={({ pressed }) => [styles.material, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { opacity: 0.7 }]}>
      <ThemedText type="smallBold" style={[styles.step, { color: theme.ornament }]}>
        {index}
      </ThemedText>
      <GameIcon uri={entry.icon} size={32} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={1}>
          {entry.name}
        </ThemedText>
        <CrafterBadge recipe={recipe} size={16} />
      </View>
      <View style={styles.qty}>
        <ThemedText type="smallBold">{entry.crafts}×</ThemedText>
        {entry.owned > 0 ? <Badge label={`${entry.owned} en poche`} tone="up" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  treeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 6 },
  treeLine: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  inventory: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 12, borderWidth: 1 },
  material: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
  source: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qty: { alignItems: 'flex-end', gap: 2 },
  crystals: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.two },
  crystal: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexBasis: '50%' },
  step: { width: 18, textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  profit: { gap: Spacing.one, marginTop: Spacing.one },
});
