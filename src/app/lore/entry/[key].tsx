/**
 * Une fiche de la Légende : son image en grand, sa citation, son texte aux liens touchables, puis où elle est citée,
 * d'autres fiches à découvrir et les fiches voisines, pour feuilleter.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LORE_ASPECT, LoreCard, NIGHT } from '@/components/lore/lore-card';
import { LoreText } from '@/components/lore/lore-text';
import { ThemedText } from '@/components/themed-text';
import { Button, Empty, Screen, Section } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLoreStore } from '@/store/lore-store';
import { EXPANSIONS, isSpoiler, LORE_TYPES, loreBacklinks, loreEntry, loreImage, loreNeighbours, lorePick, type LoreEntry } from '@/utils/lore';
import { fromWorld, getMap } from '@/utils/map';

export default function LoreEntryScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const entry = loreEntry(key);
  const theme = useTheme();
  const progress = useLoreStore((s) => s.progress);
  const visited = useLoreStore((s) => s.visited);
  const visit = useLoreStore((s) => s.visit);
  const [revealed, setRevealed] = useState<string | null>(null);

  useEffect(() => {
    if (entry) visit(entry.k);
  }, [entry, visit]);

  const backlinks = useMemo(() => (entry ? loreBacklinks(entry.k) : []), [entry]);
  // D'autres fiches de la même catégorie, différentes selon la fiche (mais stables pour elle).
  const more = useMemo(
    () => (entry ? lorePick(entry.t, 6, hash(entry.k), (e) => e.k !== entry.k && !backlinks.some((b) => b.k === e.k)) : []),
    [entry, backlinks],
  );

  if (!entry) {
    return (
      <Screen>
        <Empty>Fiche introuvable.</Empty>
      </Screen>
    );
  }

  const type = LORE_TYPES[entry.t];
  const hidden = isSpoiler(entry, progress) && revealed !== entry.k;
  const { previous, next } = loreNeighbours(entry);
  const image = loreImage(entry);
  const onMap = entry.m ? mapPoint(entry.m) : null;
  // Pour un lieu, le texte du carnet décrit, l'impression se lit comme une citation ; ailleurs, la réplique cite.
  const quote = entry.t === 'lieu' ? entry.x : entry.e;
  const quoteLinks = entry.t === 'lieu' ? entry.lx : entry.le;
  const body = entry.t === 'lieu' ? entry.e : entry.t === 'perso' ? null : entry.x;
  const bodyLinks = entry.t === 'lieu' ? entry.le : entry.lx;

  return (
    <Screen>
      <Stack.Screen options={{ title: type.label }} />

      <Hero entry={entry} image={image} hidden={hidden} />

      <View style={styles.head}>
        <ThemedText type="small" style={[styles.eyebrow, { color: theme.ornament }]}>
          {[type.label.toUpperCase(), entry.v !== undefined ? EXPANSIONS[entry.v] : null, entry.r ? '★'.repeat(entry.r) : null]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          {hidden ? 'Spoiler' : entry.n}
        </ThemedText>
        {entry.s && !hidden ? (
          <ThemedText type="small" themeColor="textSecondary">
            {entry.s}
          </ThemedText>
        ) : null}
      </View>

      {hidden ? (
        <View style={[styles.veil, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="smallBold">Cette fiche parle de {EXPANSIONS[entry.v ?? 0]}.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Tu as indiqué t’arrêter avant, dans l’accueil de la Légende.
          </ThemedText>
          <Button label="Révéler quand même" variant="secondary" onPress={() => setRevealed(entry.k)} />
        </View>
      ) : (
        <>
          {quote ? (
            <View style={[styles.quote, { borderLeftColor: theme.ornament }]}>
              <LoreText text={quote} links={quoteLinks} style={styles.quoteText} />
            </View>
          ) : null}
          {body ? <LoreText text={body} links={bodyLinks} /> : null}
          {onMap ? (
            <Button
              label="Voir sur la carte"
              variant="secondary"
              onPress={() => router.push({ pathname: '/map', params: { map: String(onMap.map), x: String(onMap.x), y: String(onMap.y) } })}
            />
          ) : null}
        </>
      )}

      {backlinks.length ? (
        <Section title="Cité dans">
          <Shelf entries={backlinks} progress={progress} visited={visited} />
        </Section>
      ) : null}

      {more.length ? (
        <Section title={`D’autres ${type.plural.toLowerCase()}`}>
          <Shelf entries={more} progress={progress} visited={visited} />
        </Section>
      ) : null}

      <View style={styles.pager}>
        <PageButton entry={previous} label="‹ Précédente" align="left" />
        <PageButton entry={next} label="Suivante ›" align="right" />
      </View>
    </Screen>
  );
}

/** Image de la fiche, à la façon de sa catégorie. */
function Hero({ entry, image, hidden }: { entry: LoreEntry; image: string | null; hidden: boolean }) {
  if (!image) return null;
  if (entry.t === 'perso') {
    return (
      <LinearGradient colors={NIGHT} style={styles.cardStage}>
        <Image source={image} style={{ width: 208, aspectRatio: LORE_ASPECT.perso }} contentFit="contain" blurRadius={hidden ? 24 : 0} />
      </LinearGradient>
    );
  }
  if (entry.t === 'monture' || entry.t === 'mascotte') {
    return (
      <LinearGradient colors={NIGHT} style={styles.artStage}>
        <Image source={image} style={styles.art} contentFit="contain" blurRadius={hidden ? 24 : 0} />
      </LinearGradient>
    );
  }
  return (
    <Image
      source={image}
      style={[styles.wide, { aspectRatio: LORE_ASPECT[entry.t] }]}
      contentFit="cover"
      blurRadius={hidden ? 24 : 0}
      transition={200}
    />
  );
}

function Shelf({ entries, progress, visited }: { entries: LoreEntry[]; progress: number; visited: string[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
      {entries.map((e) => (
        <LoreCard key={e.k} entry={e} width={shelfWidth(e)} progress={progress} visited={visited.includes(e.k)} />
      ))}
    </ScrollView>
  );
}

function PageButton({ entry, label, align }: { entry?: LoreEntry; label: string; align: 'left' | 'right' }) {
  const theme = useTheme();
  if (!entry) return <View style={styles.flex} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} : ${entry.n}`}
      onPress={() => router.replace({ pathname: '/lore/entry/[key]', params: { key: entry.k } })}
      style={({ pressed }) => [styles.page, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }, pressed && { opacity: 0.7 }]}>
      <ThemedText type="small" style={{ color: theme.ornament, textAlign: align }}>
        {label}
      </ThemedText>
      <Text numberOfLines={1} style={[styles.pageName, { color: theme.text, textAlign: align }]}>
        {entry.n}
      </Text>
    </Pressable>
  );
}

function shelfWidth(entry: LoreEntry): number {
  return entry.t === 'recit' ? 260 : entry.t === 'lieu' ? 220 : entry.t === 'perso' ? 112 : 130;
}

/** Position d'un lieu sur la carte de l'appli, d'après ses coordonnées dans le monde. */
function mapPoint([map, x, z]: [number, number, number]) {
  const info = getMap(map);
  if (!info) return null;
  const [px, py] = fromWorld(info, x, z);
  return { map, x: Math.round(px), y: Math.round(py) };
}

function hash(text: string): number {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  cardStage: { borderRadius: 18, alignItems: 'center', paddingVertical: Spacing.four },
  artStage: { borderRadius: 18, alignItems: 'center', padding: Spacing.three },
  art: { width: '80%', aspectRatio: 1 },
  wide: { width: '100%', borderRadius: 16 },
  head: { gap: 2 },
  eyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 2, fontWeight: '700' },
  title: { fontSize: 30, lineHeight: 36 },
  quote: { borderLeftWidth: 3, paddingLeft: Spacing.three, paddingVertical: Spacing.one },
  quoteText: { fontStyle: 'italic', fontSize: 18, lineHeight: 28 },
  veil: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  shelf: { gap: Spacing.two, paddingVertical: 2 },
  pager: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  page: { flex: 1, borderWidth: 1, borderRadius: 12, padding: Spacing.two, gap: 2 },
  pageName: { fontSize: 14, fontWeight: '700' },
});
