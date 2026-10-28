/**
 * Guide de niveau d'un récolteur (Mineur, Botaniste) : niveau et XP lus sur le Lodestone, mandats de récolte de ton
 * palier, et objets de ton niveau avec où les récolter (la première récolte de chaque objet rapporte un bonus).
 */
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { gatheringLeves } from '@/api/gathering';
import { useMainCharacter } from '@/components/home';
import { ItemRow, useGatheredItems } from '@/components/gathering';
import { GameWindow, MenuIcon } from '@/components/game-ui';
import { ThemedText } from '@/components/themed-text';
import { Chip, Empty, ErrorBox, Loading, ProgressBar, Screen } from '@/components/ui';
import { GameIcons } from '@/constants/game-icons';
import { MenuIcons } from '@/constants/menu-icons';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { getClassJobs } from '@/lodestone/client';
import { useAppStore } from '@/store/app-store';
import { gatherableItems, GATHERER_CLASS, GATHERER_NAME, inGatheringLog, jobOf, type GathererJob } from '@/utils/gathering';
import { formatGil, formatNumber } from '@/utils/format';

const MAX_LEVEL = 100;

export default function GathererGuideScreen() {
  const theme = useTheme();
  const job = (useLocalSearchParams<{ job: string }>().job === 'botanist' ? 'botanist' : 'miner') as GathererJob;
  const classId = GATHERER_CLASS[job];
  const main = useMainCharacter();
  const region = useAppStore((s) => s.region);
  const jobs = useQuery({
    queryKey: ['lodestone', 'classjob', region, main?.id ?? Number.NaN],
    queryFn: () => getClassJobs(region, main!.id),
    enabled: Boolean(main),
  });
  const known = jobs.data?.find((j) => j.job.id === classId);
  const [manual, setManual] = useState<number | null>(null);
  const level = manual ?? known?.level ?? 1;
  const expToGo = manual === null && known?.exp !== null && known?.maxExp ? Math.max(0, known.maxExp - (known.exp ?? 0)) : null;
  const { gathered } = useGatheredItems();

  const leves = useQuery({
    queryKey: ['gathering', 'leves', job, level],
    queryFn: () => gatheringLeves(job === 'miner' ? 2 : 3, Math.max(1, level - 9), level),
    enabled: level < MAX_LEVEL,
    staleTime: 24 * 3600_000,
  });
  const bracket = Math.max(0, ...(leves.data ?? []).map((l) => l.level));
  const shownLeves = (leves.data ?? []).filter((l) => l.level === bracket);
  const items = [...gatherableItems().values()]
    .filter((it) => inGatheringLog(it) && it.nodes.some((n) => jobOf(n) === job) && it.level <= level && it.level >= level - 5)
    .sort((a, b) => b.level - a.level || Number(gathered?.ids.has(a.itemId)) - Number(gathered?.ids.has(b.itemId)))
    .slice(0, 30);

  return (
    <Screen>
      <Stack.Screen options={{ title: GATHERER_NAME[job] }} />
      <GameWindow
        icon={62100 + classId}
        title={GATHERER_NAME[job]}
        subtitle={manual !== null ? `Niveau choisi : ${level}` : known?.level ? `${main?.name} · niveau ${known.level}` : main ? 'Pas encore débloqué (d’après le Lodestone)' : 'Ajoute ton personnage pour suivre ton niveau'}>
        {jobs.isPending && main ? <Loading label="Lecture du Lodestone…" /> : null}
        {level >= MAX_LEVEL ? (
          <ThemedText type="small">Niveau maximum : place aux points légendaires et aux objets collectionnables.</ThemedText>
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
          <Chip label="+1" onPress={() => setManual(Math.min(MAX_LEVEL, level + 1))} />
          <Chip label="+5" onPress={() => setManual(Math.min(MAX_LEVEL, level + 5))} />
          {manual !== null && known?.level ? <Chip label="Mon niveau" onPress={() => setManual(null)} /> : null}
        </View>
      </GameWindow>

      {level < MAX_LEVEL ? (
        <GameWindow icon={GameIcons.leves} title="Mandats" subtitle={bracket ? `Niveau ${bracket}` : null}>
          {leves.isPending ? <Loading label="Lecture des mandats…" /> : null}
          {leves.error ? <ErrorBox error={leves.error} onRetry={() => leves.refetch()} /> : null}
          {leves.data && shownLeves.length === 0 ? <Empty>Pas de mandat de récolte à ce niveau.</Empty> : null}
          {shownLeves.map((l, i) => (
            <View key={l.id} style={[styles.leve, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
              <MenuIcon id={GameIcons.leves} size={28} />
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={2}>
                  {l.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.tiny} numberOfLines={1}>
                  Niv. {l.level}
                  {l.gil ? ` · ${formatGil(l.gil)}` : ''}
                  {l.place ? ` · ${l.place}` : ''}
                </ThemedText>
              </View>
            </View>
          ))}
          {shownLeves.length > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              Chaque mandat coûte une autorisation (3 toutes les 12 h) ; l’XP dépend de ta réussite, le jeu ne la donne pas à l’avance.
            </ThemedText>
          ) : null}
        </GameWindow>
      ) : null}

      <GameWindow icon={MenuIcons.objets} title="Objets de ton niveau">
        {items.length === 0 ? <Empty>Aucun objet à ce niveau.</Empty> : null}
        {items.map((it, i) => (
          <ItemRow key={it.itemId} item={it} gathered={gathered ? gathered.ids.has(it.itemId) : null} first={i === 0} />
        ))}
      </GameWindow>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  tiny: { fontSize: 12, lineHeight: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  leve: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.two },
});
