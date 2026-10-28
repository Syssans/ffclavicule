/** Chronologie d'Hydaelyn : la trame principale, ère par ère, le long d'un fil doré. */
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LoreCard } from '@/components/lore/lore-card';
import { LoreText } from '@/components/lore/lore-text';
import { ThemedText } from '@/components/themed-text';
import { Button, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { CHRONICLE, type ChronicleChapter } from '@/data/lore-chronicle';
import { gameIconUrl } from '@/api/xivapi';
import { useTheme } from '@/hooks/use-theme';
import { useLoreStore } from '@/store/lore-store';
import { EXPANSIONS, linkify, loreEntries } from '@/utils/lore';
import { mapData } from '@/utils/map';

export default function ChronicleScreen() {
  const theme = useTheme();
  const progress = useLoreStore((s) => s.progress);
  const visited = useLoreStore((s) => s.visited);
  const zones = useMemo(
    () =>
      Object.entries(mapData().maps)
        .filter(([, m]) => m.k === 'zone' || m.k === 'city' || m.k === 'region')
        .map(([id, m]) => ({ id: Number(id), name: m.n.split(' - ')[0] })),
    [],
  );

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Chronologie' }} />
      {CHRONICLE.map((chapter, i) => (
        <View key={chapter.title} style={styles.row}>
          {/* Le fil doré et son jalon. */}
          <View style={styles.rail}>
            <View style={[styles.node, { borderColor: theme.ornament, backgroundColor: theme.background }]} />
            {i < CHRONICLE.length - 1 ? <View style={[styles.line, { backgroundColor: theme.frame }]} /> : null}
          </View>
          <Chapter chapter={chapter} progress={progress} visited={visited} zones={zones} />
        </View>
      ))}
    </Screen>
  );
}

function Chapter({
  chapter,
  progress,
  visited,
  zones,
}: {
  chapter: ChronicleChapter;
  progress: number;
  visited: string[];
  zones: { id: number; name: string }[];
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const hidden = chapter.v > progress && !revealed;
  const duties = useMemo(
    () =>
      chapter.v >= 0
        ? loreEntries('recit')
            .filter((e) => e.v === chapter.v)
            .slice(0, 10)
        : [],
    [chapter.v],
  );

  return (
    <View style={styles.chapter}>
      <ThemedText type="small" style={[styles.era, { color: theme.ornament }]}>
        {chapter.era.toUpperCase()}
      </ThemedText>
      <ThemedText type="title" style={styles.title}>
        {chapter.title}
      </ThemedText>
      <Image source={gameIconUrl(chapter.image)} style={styles.banner} contentFit="cover" blurRadius={hidden ? 24 : 0} transition={200} />
      {hidden ? (
        <View style={[styles.veil, { borderColor: theme.frame, backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Chapitre de {EXPANSIONS[chapter.v]} : au-delà de ta progression.
          </ThemedText>
          <Button label="Révéler" variant="secondary" onPress={() => setRevealed(true)} />
        </View>
      ) : (
        <>
          {chapter.paragraphs.map((p) => (
            <LoreText key={p.slice(0, 24)} text={p} links={linkify(p, zones)} />
          ))}
          {duties.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf}>
              {duties.map((d) => (
                <LoreCard key={d.k} entry={d} width={220} progress={progress} visited={visited.includes(d.k)} />
              ))}
            </ScrollView>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  rail: { width: 16, alignItems: 'center' },
  node: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, marginTop: 4 },
  line: { flex: 1, width: 2, marginTop: 4 },
  chapter: { flex: 1, minWidth: 0, gap: Spacing.two, paddingBottom: Spacing.five },
  era: { fontSize: 12, lineHeight: 16, letterSpacing: 2, fontWeight: '700' },
  title: { fontSize: 28, lineHeight: 34, marginTop: -4 },
  banner: { width: '100%', aspectRatio: 1128 / 360, borderRadius: 12 },
  veil: { borderWidth: 1, borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  shelf: { gap: Spacing.two, paddingVertical: 2 },
});
