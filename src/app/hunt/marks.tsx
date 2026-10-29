/** Rangs A et S de chaque zone, extension par extension, avec une recherche par nom. */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameWindow } from '@/components/game-ui';
import { MarkRow, RankBadge } from '@/components/hunt';
import { ThemedText } from '@/components/themed-text';
import { Chip, Input, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useHunt } from '@/hooks/use-hunt';
import { useNow } from '@/hooks/use-now';
import { killKey } from '@/store/hunt-store';
import { EXPANSION_NAMES, findMarks, mainMarks, markName, sRankNote, ssRankNote, zoneName, zonesOf } from '@/utils/hunt';

const SHORT = ['ARR', 'HW', 'SB', 'ShB', 'EW', 'DT'];

export default function HuntMarksScreen() {
  const now = useNow(30_000);
  const { kills, world } = useHunt(now);
  const [expansion, setExpansion] = useState(EXPANSION_NAMES.length - 1);
  const [query, setQuery] = useState('');
  const byKey = new Map(kills.map((k) => [killKey(k), k]));
  const found = query.trim().length >= 2 ? findMarks(query) : null;
  const ss = ssRankNote(expansion);

  return (
    <Screen>
      <Input placeholder="Chercher une marque (Bonnacon, Kèr…)" value={query} onChangeText={setQuery} />
      {found ? (
        <GameWindow title="Résultats" subtitle={found.length === 0 ? 'Aucune marque de ce nom.' : null}>
          {found.slice(0, 30).map(({ zone, mark }) => (
            <View key={`${zone.t}-${mark.n}-${mark.r}`} style={styles.result}>
              <RankBadge rank={mark.r} size={26} />
              <ThemedText
                type="smallBold"
                style={styles.flex}
                onPress={() => router.push({ pathname: '/hunt/zone/[territory]', params: { territory: String(zone.t) } })}>
                {markName(mark.n)}
                <ThemedText type="small" themeColor="textSecondary">
                  {'  '}
                  {zoneName(zone.t)}
                </ThemedText>
              </ThemedText>
            </View>
          ))}
        </GameWindow>
      ) : (
        <>
          <View style={styles.chips}>
            {SHORT.map((label, i) => (
              <Chip key={label} label={label} selected={expansion === i} onPress={() => setExpansion(i)} />
            ))}
          </View>
          <ThemedText type="display" style={styles.expansion}>
            {EXPANSION_NAMES[expansion]}
          </ThemedText>
          {zonesOf(expansion).map((zone) => {
            const marks = mainMarks(zone).filter((m) => m.r === 'S' || m.r === 'A');
            const b = mainMarks(zone).filter((m) => m.r === 'B');
            const note = sRankNote(zone.t);
            const open = () => router.push({ pathname: '/hunt/zone/[territory]', params: { territory: String(zone.t) } });
            return (
              <GameWindow key={zone.t} title={zoneName(zone.t)} right={<ThemedText onPress={open}>›</ThemedText>}>
                {marks.map((m) => (
                  <MarkRow
                    key={`${m.r}-${m.n}`}
                    mark={m}
                    territory={zone.t}
                    kill={byKey.get(killKey({ world, territory: zone.t, mark: m.n }))}
                    world={world}
                    now={now}
                    onPress={open}
                  />
                ))}
                {note ? (
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={3} onPress={open}>
                    Rang S : {note.how}
                  </ThemedText>
                ) : null}
                {b.length ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    Rang B : {b.map((m) => markName(m.n)).join(', ')}
                  </ThemedText>
                ) : null}
              </GameWindow>
            );
          })}
          {ss ? (
            <GameWindow title="Rang SS" glyph={<RankBadge rank="SS" size={36} />}>
              <ThemedText type="small">{ss}</ThemedText>
            </GameWindow>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  expansion: { marginTop: Spacing.one },
  result: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
});
