/**
 * Accueil de la Légende : un panorama du jour, la recherche dans tout le lore, la découverte du jour, la
 * chronologie, puis un rayon par catégorie (personnages, lieux, chroniques, montures, mascottes), renouvelé chaque
 * jour. Le compteur des fiches découvertes et « Au hasard » invitent à explorer.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { gameIconUrl } from '@/api/xivapi';
import { LORE_ASPECT, LoreCard, openLoreEntry } from '@/components/lore/lore-card';
import { Highlighted } from '@/components/search/highlighted';
import { ThemedText } from '@/components/themed-text';
import { Button, Chip, Empty, GameIcon, Input, ProgressBar, Screen, Section } from '@/components/ui';
import { DisplayFont, Spacing } from '@/constants/theme';
import { CHRONICLE } from '@/data/lore-chronicle';
import { useDebounced } from '@/hooks/use-debounced';
import { useTheme } from '@/hooks/use-theme';
import { useLoreStore } from '@/store/lore-store';
import {
  daySeed,
  EXPANSIONS,
  isSpoiler,
  LAST_EXPANSION,
  LORE_ORDER,
  LORE_TYPES,
  loreCount,
  loreEntries,
  loreImage,
  lorePick,
  loreRandom,
  searchLore,
  seededRandom,
  type LoreEntry,
} from '@/utils/lore';
import { parseQuery } from '@/utils/search';

const SHELF_WIDTH = { perso: 112, lieu: 220, recit: 260, monture: 130, mascotte: 130 } as const;

export default function LoreHomeScreen() {
  const progress = useLoreStore((s) => s.progress);
  const visited = useLoreStore((s) => s.visited);
  const [text, setText] = useState('');
  const query = useDebounced(text, 200);
  const searching = query.trim().length >= 2;

  const seed = daySeed();
  const safe = (e: LoreEntry) => !isSpoiler(e, progress);
  // Le panorama et la découverte du jour changent chaque jour (sans rien dévoiler au-delà de la progression).
  const panorama = useMemo(() => lorePick('lieu', 1, seed, safe)[0], [seed, progress]); // eslint-disable-line react-hooks/exhaustive-deps
  const daily = useMemo(() => loreRandom(safe, seededRandom(seed * 7 + 3)), [seed, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen keyboardDismissMode="on-drag">
      <Stack.Screen options={{ title: 'Légende' }} />
      <Hero panorama={panorama} />
      <Input
        value={text}
        onChangeText={setText}
        placeholder="Un nom, un lieu, un mot…"
        returnKeyType="search"
        clearButtonMode="while-editing"
        autoCapitalize="none"
        accessibilityLabel="Chercher dans la Légende"
      />
      {searching ? (
        <Results query={query} progress={progress} />
      ) : (
        <>
          <Discoveries count={visited.length} />
          {daily ? <Daily entry={daily} /> : null}
          <ChronicleBanner />
          {LORE_ORDER.map((type) => {
            const shelf = lorePick(type, 10, seed, safe);
            const all = loreEntries(type);
            return (
              <Section
                key={type}
                title={LORE_TYPES[type].plural}
                right={<SeeAll label={`${all.length} ›`} onPress={() => router.push({ pathname: '/lore/[type]', params: { type } })} />}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
                  {shelf.map((e) => (
                    <LoreCard key={e.k} entry={e} width={SHELF_WIDTH[type]} progress={progress} visited={visited.includes(e.k)} />
                  ))}
                </ScrollView>
              </Section>
            );
          })}
          <Progress />
        </>
      )}
    </Screen>
  );
}

/** Le panorama du jour, avec le titre de la Légende. */
function Hero({ panorama }: { panorama?: LoreEntry }) {
  const image = panorama ? loreImage(panorama) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={panorama ? `Panorama du jour : ${panorama.n}` : 'Légende'}
      disabled={!panorama}
      onPress={() => panorama && openLoreEntry(panorama)}
      style={styles.hero}>
      {image ? <Image source={image} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} /> : null}
      <LinearGradient colors={['rgba(5,8,15,0.15)', 'rgba(5,8,15,0.85)']} style={StyleSheet.absoluteFill} />
      <View style={styles.heroText}>
        <Text style={styles.heroTitle}>Légende</Text>
        <Text style={styles.heroTagline}>Le savoir d’Hydaelyn, de ses héros à ses mystères</Text>
        {panorama ? <Text style={styles.heroCaption}>Panorama du jour : {panorama.n}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Fiches déjà ouvertes, et un tirage au hasard pour se perdre dans le lore. */
function Discoveries({ count }: { count: number }) {
  const theme = useTheme();
  const progress = useLoreStore((s) => s.progress);
  const total = loreCount();
  return (
    <View style={[styles.discoveries, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">
          {count} fiche{count > 1 ? 's' : ''} découverte{count > 1 ? 's' : ''}
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            sur {total}
          </ThemedText>
        </ThemedText>
        <ProgressBar value={count / total} />
      </View>
      <Button label="Au hasard ✦" onPress={() => openLoreEntry(loreRandom((e) => !isSpoiler(e, progress)))} />
    </View>
  );
}

/** La découverte du jour, en grand. */
function Daily({ entry }: { entry: LoreEntry }) {
  const theme = useTheme();
  const image = loreImage(entry);
  const type = LORE_TYPES[entry.t];
  const portrait = entry.t === 'perso' || entry.t === 'monture' || entry.t === 'mascotte';
  const teaser = (entry.t === 'perso' ? entry.e : entry.x) ?? '';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => openLoreEntry(entry)}
      style={({ pressed }) => [
        styles.daily,
        { borderColor: theme.ornament, backgroundColor: theme.backgroundElement },
        pressed && { opacity: 0.85 },
      ]}>
      {image && !portrait ? <Image source={image} style={[styles.dailyWide, { aspectRatio: LORE_ASPECT[entry.t] }]} contentFit="cover" /> : null}
      <View style={styles.dailyBody}>
        {image && portrait ? (
          <LinearGradient colors={['#232B48', '#0B0F1C']} style={styles.dailyThumb}>
            <Image source={image} style={StyleSheet.absoluteFill} contentFit="contain" />
          </LinearGradient>
        ) : null}
        <View style={styles.flex}>
          <ThemedText type="small" style={[styles.eyebrow, { color: theme.ornament }]}>
            DÉCOUVERTE DU JOUR · {type.label.toUpperCase()}
          </ThemedText>
          <ThemedText type="display" numberOfLines={2}>
            {entry.n}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={4}>
            {teaser}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

function ChronicleBanner() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Chronologie d’Hydaelyn"
      onPress={() => router.push('/lore/chronique')}
      style={({ pressed }) => [styles.chronicle, pressed && { opacity: 0.85 }]}>
      <Image source={gameIconUrl(CHRONICLE[2].image)} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={['rgba(5,8,15,0.75)', 'rgba(5,8,15,0.2)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <Text style={styles.chronicleEyebrow}>DES ÈRES À DAWNTRAIL</Text>
      <Text style={styles.chronicleTitle}>Chronologie</Text>
    </Pressable>
  );
}

/** Où en est le joueur dans l'histoire : ce qui vient après est voilé. */
function Progress() {
  const progress = useLoreStore((s) => s.progress);
  const setProgress = useLoreStore((s) => s.setProgress);
  return (
    <Section title="Spoilers">
      <ThemedText type="small" themeColor="textSecondary">
        {progress === LAST_EXPANSION ? 'Tout est visible.' : `Voilé après ${EXPANSIONS[progress]}.`}
      </ThemedText>
      <View style={styles.chips}>
        {EXPANSIONS.map((name, i) => (
          <Chip key={name} label={name} selected={i === progress} onPress={() => setProgress(i)} />
        ))}
      </View>
    </Section>
  );
}

function Results({ query, progress }: { query: string; progress: number }) {
  const theme = useTheme();
  const hits = useMemo(() => searchLore(query), [query]);
  const parsed = useMemo(() => parseQuery(query), [query]);
  if (!hits.length) return <Empty>Rien dans la Légende pour « {query.trim()} ».</Empty>;
  return (
    <View style={[styles.results, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
      {hits.map(({ entry, byName, snippet }, i) => {
        const hidden = isSpoiler(entry, progress);
        return (
          <Pressable
            key={entry.k}
            accessibilityRole="button"
            onPress={() => openLoreEntry(entry)}
            style={({ pressed }) => [
              styles.result,
              i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
              pressed && { opacity: 0.7 },
            ]}>
            <GameIcon uri={hidden ? null : loreImage(entry)} size={44} />
            <View style={styles.flex}>
              {hidden ? <ThemedText>Spoiler · {EXPANSIONS[entry.v ?? 0]}</ThemedText> : <Highlighted text={entry.n} query={parsed} />}
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {LORE_TYPES[entry.t].label}
                {entry.s ? ` · ${entry.s}` : ''}
              </ThemedText>
              {!byName && snippet && !hidden ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={2} style={styles.snippet}>
                  {snippet}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}>
      <ThemedText type="smallBold" style={{ color: theme.ornament }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  hero: { height: 260, borderRadius: 20, overflow: 'hidden', justifyContent: 'flex-end', backgroundColor: '#151B2B' },
  heroText: { padding: Spacing.three, gap: 2 },
  heroTitle: { fontFamily: DisplayFont.bold, fontSize: 40, lineHeight: 46, color: '#F3DC9A' },
  heroTagline: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 20 },
  heroCaption: { color: 'rgba(232,201,135,0.85)', fontSize: 12, lineHeight: 16, marginTop: Spacing.one },
  discoveries: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: 14, padding: Spacing.three },
  daily: { borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  dailyWide: { width: '100%' },
  dailyBody: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three },
  dailyThumb: { width: 96, height: 118, borderRadius: 10, overflow: 'hidden' },
  eyebrow: { fontSize: 11, lineHeight: 14, letterSpacing: 1.5, fontWeight: '700' },
  chronicle: { height: 110, borderRadius: 16, overflow: 'hidden', justifyContent: 'center', padding: Spacing.three, backgroundColor: '#151B2B' },
  chronicleEyebrow: { color: 'rgba(232,201,135,0.9)', fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  chronicleTitle: { fontFamily: DisplayFont.bold, color: '#FFF8E6', fontSize: 28, lineHeight: 34 },
  shelf: { gap: Spacing.two, paddingVertical: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  results: { borderWidth: 1, borderRadius: 14, paddingHorizontal: Spacing.three },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.two },
  snippet: { fontStyle: 'italic' },
});
