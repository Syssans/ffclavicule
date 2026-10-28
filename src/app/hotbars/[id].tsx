/**
 * Barres d'actions de chaque job, reconstruites comme en jeu : un aperçu à leur place dans l'ATH (en grand d'un
 * toucher), puis chaque barre dans sa forme. Glisser-déposer ou deux touchers pour échanger, déplacer, vider.
 */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { HotbarJob, HotbarSlotChange } from '@/api/hud';
import { gameIconUrl } from '@/api/xivapi';
import { ChangeList, useHud } from '@/components/hud-changes';
import { HotbarBoard, SLOT_COLORS, type BoardBar } from '@/components/hotbars/hotbar-board';
import { HotbarFullscreen } from '@/components/hotbars/hotbar-fullscreen';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, Empty, ErrorBox, GameIcon, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { landscapeOptions } from '@/hooks/use-landscape';
import { useAppStore } from '@/store/app-store';
import { formatAgo } from '@/utils/format';
import {
  clearSlot,
  countHotbarChanges,
  effectiveBars,
  hotbarChanges,
  mergeHotbarChanges,
  swapSlots,
  type HotbarEdits,
  type SlotRef,
} from '@/utils/hud';

export default function HotbarsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const link = useAppStore((s) => s.privateLinks[id]);
  const { hud, changes, send, cancel } = useHud(id, link?.token);

  const [jobId, setJobId] = useState<number | null>(null);
  const [edits, setEdits] = useState<HotbarEdits>({});
  const [picked, setPicked] = useState<SlotRef | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
  const [full, setFull] = useState(false);
  const [dragging, setDragging] = useState(false);

  const set = hud.data?.hotbars;
  const jobs = useMemo(() => set?.jobs ?? [], [set]);
  const job: HotbarJob | undefined = jobs.find((j) => j.job === (jobId ?? set?.currentJob)) ?? jobs[0];

  // Envoyé mais pas encore relu dans le relevé : montré comme si c'était fait.
  const base = useMemo(() => {
    const updatedAt = hud.data ? Date.parse(hud.data.updatedAt) : 0;
    const sent: { job: number; slots: HotbarSlotChange[] }[] = [];
    for (const c of changes.data ?? []) {
      if (c.change.kind !== 'hotbars') continue;
      const waiting = c.status === 'pending' || ((c.status === 'applied' || c.status === 'partial') && Date.parse(c.doneAt ?? '') > updatedAt);
      if (waiting) sent.push(c.change);
    }
    return mergeHotbarChanges(jobs, sent);
  }, [changes.data, hud.data, jobs]);

  const merged = useMemo(() => ({ ...base, ...edits }), [base, edits]);
  const count = countHotbarChanges(jobs, merged, base);
  const bars = useMemo(() => (job ? effectiveBars(job, merged) : []), [job, merged]);
  const before = useMemo(() => (job ? effectiveBars(job, base) : []), [job, base]);
  // Disposition d'ATH affichée en jeu : forme et place de chaque barre, et lesquelles sont masquées.
  const layoutElements = useMemo(() => hud.data?.layouts.find((l) => l.index === hud.data?.currentLayout)?.elements ?? [], [hud.data]);
  const boardBars: BoardBar[] = useMemo(() => {
    const elements = new Map(layoutElements.filter((e) => e.hotbar !== undefined).map((e) => [e.hotbar!, e]));
    return bars.map((b) => {
      const element = elements.get(b.id);
      return { ...b, shape: element?.shape ?? 1, hidden: element ? !element.visible : false, element: element?.visible ? element : undefined };
    });
  }, [bars, layoutElements]);
  const listBars = boardBars.filter((b) => showEmpty || b.slots.some(Boolean));
  const screenBars = boardBars.filter((b) => b.element);
  const pickedSlot = picked ? bars[picked.bar]?.slots[picked.slot] : null;

  const isChanged = useCallback(
    (at: SlotRef) => {
      const now = bars[at.bar]?.slots[at.slot];
      const was = before[at.bar]?.slots[at.slot];
      return (was?.type ?? 0) !== (now?.type ?? 0) || (was?.id ?? 0) !== (now?.id ?? 0);
    },
    [bars, before],
  );

  const tap = (at: SlotRef | null) => {
    if (!job) return;
    if (!at) {
      setPicked(null);
      return;
    }
    if (!picked) {
      // On ne prend pas une case vide.
      if (bars[at.bar].slots[at.slot]) setPicked(at);
      return;
    }
    if (picked.bar === at.bar && picked.slot === at.slot) {
      setPicked(null);
      return;
    }
    setEdits(swapSlots(job, merged, picked, at));
    setPicked(null);
  };
  const drop = (from: SlotRef, to: SlotRef) => {
    if (!job) return;
    setEdits(swapSlots(job, merged, from, to));
    setPicked(null);
  };

  const submit = () => {
    const bodies = hotbarChanges(jobs, merged, base).map((c) => ({ kind: 'hotbars' as const, job: c.job, slots: c.slots }));
    send.mutate(bodies, { onSuccess: () => setEdits({}) });
  };

  if (!link) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Barres d’actions' }} />
        <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty>
        <Button label="Connecter avec un code" onPress={() => router.replace({ pathname: '/connect', params: { id: String(id) } })} />
      </Screen>
    );
  }

  // Ce qui est en cours : la case choisie, les modifications, l'envoi. Même panneau en plein écran.
  const panel = job ? (
    <>
      {pickedSlot ? (
        <View style={styles.pickedRow}>
          <GameIcon uri={pickedSlot.icon ? gameIconUrl(pickedSlot.icon) : null} size={36} />
          <ThemedText type="smallBold" numberOfLines={2} style={styles.flex}>
            {pickedSlot.name}
          </ThemedText>
          <Chip
            label="Vider"
            onPress={() => {
              setEdits(clearSlot(job, merged, picked!));
              setPicked(null);
            }}
          />
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          {count === 0 ? 'Aucune modification.' : `${count} case${count > 1 ? 's' : ''} modifiée${count > 1 ? 's' : ''}.`}
        </ThemedText>
      )}
      <Button label={send.isPending ? 'Envoi…' : 'Envoyer au jeu'} disabled={count === 0 || send.isPending} onPress={submit} />
      {count > 0 ? (
        <Button
          label="Tout annuler"
          variant="secondary"
          onPress={() => {
            setEdits({});
            setPicked(null);
          }}
        />
      ) : null}
      {send.error ? <ErrorBox error={send.error} /> : null}
    </>
  ) : null;

  return (
    <View style={styles.page}>
      <Screen
        scrollEnabled={!dragging}
        refreshControl={<RefreshControl refreshing={hud.isRefetching} onRefresh={() => void Promise.all([hud.refetch(), changes.refetch()])} />}>
        <Stack.Screen options={{ title: 'Barres d’actions', ...landscapeOptions(full) }} />
        {hud.isPending ? <Loading label="Lecture de tes barres…" /> : null}
        {hud.error ? <ErrorBox error={hud.error} onRetry={() => hud.refetch()} /> : null}
        {hud.data === null || (hud.data && !set) ? (
          <Card>
            <ThemedText>Le plugin n’a pas encore envoyé tes barres d’actions.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Mets à jour le plugin, puis vérifie dans /clavicule que « Modifier l’ATH et les barres d’actions depuis l’appli » est coché.
            </ThemedText>
          </Card>
        ) : null}
        {set && job ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jobs}>
              {jobs.map((j) => (
                <Chip
                  key={j.job}
                  label={`${j.abbr}${j.job === set.currentJob ? ' ●' : ''}`}
                  selected={j.job === job.job}
                  onPress={() => {
                    setJobId(j.job);
                    setPicked(null);
                  }}
                />
              ))}
            </ScrollView>
            <View style={styles.jobHead}>
              <ThemedText type="subtitle" style={styles.jobName}>
                {job.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Relevé {formatAgo(Date.parse(hud.data!.updatedAt))}
              </ThemedText>
            </View>

            {screenBars.length > 0 && hud.data ? (
              // Aperçu : les barres à leur place à l'écran ; un toucher l'ouvre en grand.
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Agrandir les barres comme en jeu"
                onPress={() => setFull(true)}
                style={({ pressed }) => [styles.preview, pressed && { opacity: 0.85 }]}>
                <HotbarBoard
                  bars={screenBars}
                  mode="screen"
                  screen={hud.data.screen}
                  maxHeight={220}
                  picked={picked}
                  isChanged={isChanged}
                  interactive={false}
                />
                <View style={styles.expand}>
                  <ThemedText type="smallBold" style={styles.expandText}>
                    ⤢ Agrandir
                  </ThemedText>
                </View>
              </Pressable>
            ) : null}

            <Card style={styles.sticky}>{panel}</Card>

            <View style={styles.board}>
              <HotbarBoard bars={listBars} mode="list" picked={picked} isChanged={isChanged} onTap={tap} onDrop={drop} onDragChange={setDragging} />
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Appui long sur une action pour la glisser, ou touche deux cases pour les échanger.
            </ThemedText>
            <Chip label={showEmpty ? 'Cacher les barres vides' : 'Montrer les barres vides'} onPress={() => setShowEmpty((v) => !v)} />
            <ChangeList changes={changes.data} kinds={['hotbars']} onCancel={(cid) => cancel.mutate(cid)} />
          </>
        ) : null}
      </Screen>
      {hud.data && job ? (
        <HotbarFullscreen
          visible={full}
          onClose={() => setFull(false)}
          title={job.name}
          bars={screenBars}
          screen={hud.data.screen}
          picked={picked}
          isChanged={isChanged}
          onTap={tap}
          onDrop={drop}
          panel={panel}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  jobs: { gap: Spacing.one, paddingVertical: Spacing.one },
  jobHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  jobName: { textTransform: 'capitalize' },
  preview: { backgroundColor: SLOT_COLORS.panel, borderRadius: 14, padding: Spacing.three },
  expand: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(232,201,135,0.6)',
    backgroundColor: 'rgba(5,8,15,0.7)',
  },
  expandText: { color: SLOT_COLORS.gold, fontSize: 12, lineHeight: 16 },
  board: { backgroundColor: SLOT_COLORS.panel, borderRadius: 14, padding: Spacing.three },
  sticky: { gap: Spacing.two },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
});
