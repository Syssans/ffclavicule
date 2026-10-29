/**
 * Onglet Recherche : un seul champ pour tout Clavicule. Objets, fiches de la Légende, marques de chasse, donjons et autres instances, lieux et éthérites,
 * aléas, coins de pêche, personnages suivis et pages de l'appli. Les majuscules, les accents et la ponctuation ne
 * comptent pas, l'ordre des mots non plus, et les résultats les plus proches passent devant.
 */
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { GameWindow, MenuIcon } from '@/components/game-ui';
import { CharacterTag, SettingsButton, useMainCharacter } from '@/components/home';
import { isFish } from '@/components/item/fish-section';
import { isGatherable } from '@/components/item/gathering-section';
import { Highlighted } from '@/components/search/highlighted';
import { APP_PAGES, huntMarkPages, type AppPage } from '@/components/search/pages';
import { ThemedText } from '@/components/themed-text';
import { Badge, Chip, Empty, GameIcon, Input, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { gameIconUrl } from '@/api/xivapi';
import { useAppStore, type SavedCharacter } from '@/store/app-store';
import { useLoreStore } from '@/store/lore-store';
import { useSearchStore } from '@/store/search-store';
import { searchItemIndex, type ItemHit } from '@/utils/items-index';
import { EXPANSIONS, isSpoiler, LORE_TYPES, loreImage, searchLore, type LoreHit } from '@/utils/lore';
import { searchMap, type SearchResult } from '@/utils/map';
import { matchScore, parseQuery, rankMatches, searchKey, type SearchQuery } from '@/utils/search';

type Group = 'pages' | 'characters' | 'items' | 'lore' | 'hunts' | 'instances' | 'places' | 'fates' | 'fishing';

const GROUPS: { key: Group; label: string; icon: number }[] = [
  { key: 'pages', label: 'Pages de l’appli', icon: MenuIcons.guides },
  { key: 'characters', label: 'Personnages', icon: MenuIcons.personnage },
  { key: 'items', label: 'Objets', icon: MenuIcons.objets },
  { key: 'lore', label: 'Légende', icon: MenuIcons.journal },
  { key: 'hunts', label: 'Chasse', icon: MenuIcons.bestiaire },
  { key: 'instances', label: 'Donjons, défis et raids', icon: GameIcons.raids },
  { key: 'places', label: 'Lieux', icon: MenuIcons.carte },
  { key: 'fates', label: 'Aléas', icon: MenuIcons.alea },
  { key: 'fishing', label: 'Coins de pêche', icon: MenuIcons.peche },
];

/** Résultats montrés par groupe quand tous les groupes sont affichés ensemble. */
const PREVIEW = 4;
/** Résultats montrés d'un coup quand un seul groupe est affiché. */
const PAGE = 30;

interface Results {
  pages: AppPage[];
  characters: SavedCharacter[];
  items: ItemHit[];
  itemTotal: number;
  /** Fiches de la Légende : par leur nom d'abord, puis celles qui en parlent. */
  lore: LoreHit[];
  /** Marques de chasse (rangs B, A, S, SS). */
  hunts: AppPage[];
  instances: SearchResult[];
  places: SearchResult[];
  fates: SearchResult[];
  fishing: SearchResult[];
}

function search(query: SearchQuery, text: string, pages: AppPage[], characters: SavedCharacter[]): Results {
  const items = searchItemIndex(text, { limit: 200 });
  const map = searchMap(text, 400);
  return {
    pages: rankMatches(pages, (p) => p.search, query),
    characters: rankMatches(characters, (c) => searchKey(`${c.name} ${c.world ?? ''}`), query),
    items: items.items,
    itemTotal: items.total,
    lore: searchLore(text, 200),
    hunts: rankMatches(huntMarkPages(), (p) => p.search, query),
    instances: map.filter((r) => r.kind === 'instance'),
    places: map.filter((r) => r.kind === 'map' || r.kind === 'place'),
    fates: map.filter((r) => r.kind === 'fate'),
    fishing: map.filter((r) => r.kind === 'fishing'),
  };
}

function countOf(results: Results, group: Group): number {
  return group === 'items' ? results.itemTotal : results[group].length;
}

/** Proximité du meilleur résultat d'un groupe (plus petit = plus proche), pour ranger les groupes. */
function bestScore(results: Results, group: Group, query: SearchQuery): number {
  const titles: string[] =
    group === 'pages' || group === 'hunts'
      ? results[group].slice(0, 3).map((p) => p.title)
      : group === 'characters'
        ? results.characters.slice(0, 3).map((c) => c.name)
        : group === 'lore'
          ? // Une fiche qui en parle seulement dans son texte ne fait pas passer la Légende devant.
            results.lore
              .filter((h) => h.byName)
              .slice(0, 3)
              .flatMap((h) => [h.entry.n, ...(h.entry.aka ?? [])])
          : results[group].slice(0, 3).map((r) => (group === 'items' ? (r as ItemHit).name : (r as SearchResult).title));
  // Une page trouvée par un synonyme (« craft » pour Artisanat) reste bien placée.
  const fallback = group === 'pages' && results.pages.length ? 2500 : 9999;
  return Math.min(fallback, ...titles.map((t) => matchScore(searchKey(t), query) ?? 9999));
}

/** Les pages du personnage principal (profil, collections…), qu'on cherche aussi par leur nom. */
function characterPages(main: SavedCharacter | null, linked: boolean): AppPage[] {
  if (!main) return [];
  const id = String(main.id);
  const section = (key: string, title: string, subtitle: string, icon: number, href: Href, synonyms = ''): AppPage => ({
    key,
    title,
    subtitle: `${subtitle} · ${main.name}`,
    icon,
    href,
    search: searchKey(`${title} ${subtitle} ${synonyms}`),
  });
  const pages = [
    section('profil', 'Profil', 'Race, cité, divinité, compagnie', MenuIcons.personnage, {
      pathname: '/character/[id]/[section]',
      params: { id, section: 'profil' },
    }),
    section(
      'jobs',
      'Jobs',
      'Niveau de chaque job',
      MenuIcons.actions,
      { pathname: '/character/[id]/[section]', params: { id, section: 'jobs' } },
      'classes niveaux',
    ),
    section(
      'equipement',
      'Équipement',
      'Ce que porte ton personnage',
      MenuIcons.arsenal,
      { pathname: '/character/[id]/[section]', params: { id, section: 'equipement' } },
      'stuff armure arme',
    ),
    section(
      'collections',
      'Collections',
      'Montures, mascottes, hauts faits…',
      MenuIcons.hautsFaits,
      { pathname: '/character/[id]/[section]', params: { id, section: 'collections' } },
      'montures mascottes hauts faits orchestrion',
    ),
  ];
  if (linked) {
    pages.push(
      section('inventaire', 'Inventaire', 'Sacs, arsenal, sacoches', MenuIcons.inventaire, { pathname: '/inventory/[id]', params: { id } }, 'sac'),
      section(
        'servants',
        'Servants',
        'Inventaire, ventes, missions',
        GameIcons.retainers,
        { pathname: '/retainers/[id]', params: { id } },
        'retainer',
      ),
      section('courrier', 'Courrier', 'Lettres et pièces jointes', MenuIcons.objetsPrecieux, { pathname: '/mail/[id]', params: { id } }, 'lettres'),
      section('ath', 'ATH', 'Disposition de l’interface', MenuIcons.ath, { pathname: '/hud/[id]', params: { id } }, 'hud interface'),
      section('barres', 'Barres d’actions', 'Par job', MenuIcons.barres, { pathname: '/hotbars/[id]', params: { id } }, 'hotbar raccourcis'),
    );
  }
  return pages;
}

export default function SearchScreen() {
  // « Chercher partout » depuis la Légende : la recherche arrive déjà tapée.
  const { q } = useLocalSearchParams<{ q?: string }>();
  const [text, setText] = useState(q ?? '');
  const [seenQ, setSeenQ] = useState(q);
  if (q !== seenQ) {
    setSeenQ(q);
    if (q) setText(q);
  }
  const [group, setGroup] = useState<Group | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const debounced = useDebounced(text, 120);
  const query = useMemo(() => parseQuery(debounced), [debounced]);
  const active = query.key.length >= 2;

  const main = useMainCharacter();
  const linked = useAppStore((s) => Boolean(main && s.privateLinks[main.id]));
  const characters = useAppStore((s) => s.characters);
  const remember = useSearchStore((s) => s.remember);
  const pages = useMemo(() => [...APP_PAGES, ...characterPages(main, linked)], [main, linked]);

  // Les index (objets, carte) se préparent dès l'ouverture de l'onglet, pour que la première recherche soit immédiate.
  useEffect(() => {
    const timer = setTimeout(() => {
      searchItemIndex('xx', { limit: 1 });
      searchMap('xx', 1);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const results = useMemo(() => (active ? search(query, debounced, pages, characters) : null), [active, query, debounced, pages, characters]);
  // Les groupes dont le meilleur résultat est le plus proche de la recherche passent devant (« sastasha » : le
  // donjon avant l'eau de Sastasha) ; à égalité, l'ordre habituel.
  const available = results
    ? GROUPS.filter((g) => countOf(results, g.key) > 0)
        .map((g, order) => ({ ...g, order, score: bestScore(results, g.key, query) }))
        .sort((a, b) => a.score - b.score || a.order - b.order)
    : [];
  const total = results ? available.reduce((n, g) => n + countOf(results, g.key), 0) : 0;
  // Un filtre qui n'a plus de résultat revient sur « Tout ».
  const current = group !== 'all' && available.some((g) => g.key === group) ? group : 'all';

  const onType = (value: string) => {
    setText(value);
    setShown(PAGE);
  };
  const choose = (next: Group | 'all') => {
    setGroup(next);
    setShown(PAGE);
  };
  const open = (href: Href) => {
    remember(text);
    router.push(href);
  };

  return (
    <Screen title="Recherche" tab right={<SettingsButton />} keyboardDismissMode="on-drag">
      <Input
        value={text}
        onChangeText={onType}
        placeholder="Objet, lieu, personnage, donjon, page…"
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCapitalize="none"
        accessibilityLabel="Rechercher dans Clavicule"
        onSubmitEditing={() => remember(text)}
      />

      {!active ? (
        <Idle onPick={onType} />
      ) : !results || total === 0 ? (
        <NoResult text={debounced.trim()} />
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.filters}>
            <Chip label={`Tout · ${total}`} selected={current === 'all'} onPress={() => choose('all')} />
            {available.map((g) => (
              <Chip key={g.key} label={`${g.label} · ${countOf(results, g.key)}`} selected={current === g.key} onPress={() => choose(g.key)} />
            ))}
          </ScrollView>

          {available
            .filter((g) => current === 'all' || current === g.key)
            .map((g) => {
              const limit = current === 'all' ? PREVIEW : shown;
              const count = countOf(results, g.key);
              const more = count - limit;
              return (
                <GameWindow key={g.key} icon={g.icon} title={g.label}>
                  <GroupRows group={g.key} results={results} query={query} limit={limit} open={open} />
                  {more > 0 ? (
                    current === 'all' ? (
                      <MoreButton label={`Voir les ${count} résultats`} onPress={() => choose(g.key)} />
                    ) : g.key === 'items' && results.items.length <= limit ? (
                      <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                        Précise ta recherche pour voir les autres.
                      </ThemedText>
                    ) : (
                      <MoreButton label={`Afficher ${Math.min(more, PAGE)} de plus`} onPress={() => setShown(shown + PAGE)} />
                    )
                  ) : null}
                </GameWindow>
              );
            })}
        </>
      )}
    </Screen>
  );
}

function GroupRows({
  group,
  results,
  query,
  limit,
  open,
}: {
  group: Group;
  results: Results;
  query: SearchQuery;
  limit: number;
  open: (href: Href) => void;
}) {
  if (group === 'lore') return <LoreRows hits={results.lore.slice(0, limit)} query={query} open={open} />;
  if (group === 'pages' || group === 'hunts') {
    return results[group]
      .slice(0, limit)
      .map((p, i) => (
        <ResultRow
          key={p.key}
          first={i === 0}
          leading={<MenuIcon id={p.icon} size={36} />}
          title={p.title}
          subtitle={p.subtitle}
          query={query}
          onPress={() => open(p.href)}
        />
      ));
  }
  if (group === 'characters') {
    return results.characters.slice(0, limit).map((c, i) => (
      <Pressable
        key={c.id}
        accessibilityRole="button"
        onPress={() => open({ pathname: '/character/[id]', params: { id: String(c.id) } })}
        style={({ pressed }) => [styles.characterRow, pressed && styles.pressed]}>
        {i > 0 ? <Separator /> : null}
        <CharacterTag character={c} />
      </Pressable>
    ));
  }
  if (group === 'items') {
    return results.items
      .slice(0, limit)
      .map((item, i) => (
        <ResultRow
          key={item.id}
          first={i === 0}
          leading={<GameIcon uri={item.icon} size={40} />}
          title={item.name}
          subtitle={[item.category ?? 'Objet', item.itemLevel ? `niv. ${item.itemLevel}` : null].filter(Boolean).join(' · ')}
          query={query}
          badges={<ItemBadges item={item} />}
          onPress={() => open({ pathname: '/item/[id]', params: { id: String(item.id) } })}
        />
      ));
  }
  return results[group].slice(0, limit).map((r, i) => (
    <ResultRow
      key={r.key}
      first={i === 0}
      leading={<GameIcon uri={gameIconUrl(r.icon)} size={36} />}
      title={r.title}
      subtitle={r.subtitle}
      query={query}
      onPress={() =>
        open({
          pathname: '/map',
          params: {
            map: String(r.mapId),
            ...(r.x !== undefined && r.y !== undefined ? { x: String(Math.round(r.x)), y: String(Math.round(r.y)) } : {}),
          },
        })
      }
    />
  ));
}

/** Fiches de la Légende ; celles au-delà de la progression du joueur restent voilées, comme dans la Légende. */
function LoreRows({ hits, query, open }: { hits: LoreHit[]; query: SearchQuery; open: (href: Href) => void }) {
  const progress = useLoreStore((s) => s.progress);
  return hits.map(({ entry, byName, snippet }, i) => {
    const hidden = isSpoiler(entry, progress);
    const kind = `${LORE_TYPES[entry.t].label}${entry.s ? ` · ${entry.s}` : ''}`;
    return (
      <ResultRow
        key={entry.k}
        first={i === 0}
        leading={<GameIcon uri={hidden ? null : loreImage(entry)} size={40} />}
        title={hidden ? `Spoiler · ${EXPANSIONS[entry.v ?? 0]}` : entry.n}
        subtitle={!byName && snippet && !hidden ? snippet : kind}
        query={query}
        onPress={() => open({ pathname: '/lore/entry/[key]', params: { key: entry.k } })}
      />
    );
  });
}

/** D'où vient l'objet : pêche, récolte, marché. */
function ItemBadges({ item }: { item: ItemHit }) {
  const fish = isFish(item.id);
  const gathered = !fish && isGatherable(item.id);
  if (!fish && !gathered && !item.marketable) return null;
  return (
    <View style={styles.badges}>
      {fish ? <Badge label="Pêche" /> : null}
      {gathered ? <Badge label="Récolte" /> : null}
      {item.marketable ? <Badge label="Marché" tone="accent" /> : null}
    </View>
  );
}

function ResultRow({
  leading,
  title,
  subtitle,
  query,
  badges,
  first,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
  query: SearchQuery;
  badges?: ReactNode;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}>
      {!first ? <Separator /> : null}
      <View style={styles.row}>
        {leading}
        <View style={styles.rowText}>
          <Highlighted text={title} query={query} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
          {badges}
        </View>
        <ThemedText themeColor="textSecondary">›</ThemedText>
      </View>
    </Pressable>
  );
}

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.border }]} />;
}

function MoreButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.more, { borderTopColor: theme.border }, pressed && styles.pressed]}>
      <ThemedText type="smallBold" style={{ color: theme.accent }}>
        {label} ›
      </ThemedText>
    </Pressable>
  );
}

/** Avant de taper : les dernières recherches. */
function Idle({ onPick }: { onPick: (text: string) => void }) {
  const recent = useSearchStore((s) => s.recent);
  const forget = useSearchStore((s) => s.forget);
  const clear = useSearchStore((s) => s.clear);
  if (!recent.length) return null;
  return (
    <GameWindow icon={MenuIcons.journal} title="Recherches récentes" right={<Chip label="Effacer" onPress={clear} />}>
      {recent.map((r, i) => (
        <View key={r}>
          {i > 0 ? <Separator /> : null}
          <View style={styles.recentRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Rechercher ${r}`}
              onPress={() => onPick(r)}
              style={({ pressed }) => [styles.rowText, pressed && styles.pressed]}>
              <ThemedText numberOfLines={1}>{r}</ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${r} des recherches récentes`} hitSlop={10} onPress={() => forget(r)}>
              <ThemedText themeColor="textSecondary">✕</ThemedText>
            </Pressable>
          </View>
        </View>
      ))}
    </GameWindow>
  );
}

function NoResult({ text }: { text: string }) {
  return <Empty>Aucun résultat pour « {text} ».</Empty>;
}

const styles = StyleSheet.create({
  filters: { gap: Spacing.one, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two, minHeight: 52 },
  rowText: { flex: 1, minWidth: 0 },
  characterRow: { paddingVertical: Spacing.one },
  separator: { height: StyleSheet.hairlineWidth, marginBottom: Spacing.one },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: 4 },
  more: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, alignItems: 'center' },
  hint: { textAlign: 'center' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  pressed: { opacity: 0.6 },
});
