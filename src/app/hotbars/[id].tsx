/** Barres d'actions de chaque job : voir leur contenu et le réorganiser (échanger, déplacer, vider des cases). */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { HotbarJob, HotbarSlotChange } from '@/api/hud';
import { gameIconUrl } from '@/api/xivapi';
import { ChangeList, useHud } from '@/components/hud-changes';
import { HudMiniature } from '@/components/hud-miniature';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Chip, Empty, ErrorBox, GameIcon, Loading, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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

const COLUMNS = 6;

export default function HotbarsScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const link = useAppStore((s) => s.privateLinks[id]);
  const { hud, changes, send, cancel } = useHud(id, link?.token);
  const theme = useTheme();

  const [jobId, setJobId] = useState<number | null>(null);
  const [edits, setEdits] = useState<HotbarEdits>({});
  const [picked, setPicked] = useState<SlotRef | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);

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
  const bars = job ? effectiveBars(job, merged) : [];
  // Disposition d'ATH affichée en jeu : où sont les barres, et lesquelles sont masquées.
  const layoutElements = hud.data?.layouts.find((l) => l.index === hud.data?.currentLayout)?.elements ?? [];
  const hiddenBars = new Set(layoutElements.filter((e) => e.hotbar !== undefined && !e.visible).map((e) => e.hotbar!));
  const before = job ? effectiveBars(job, base) : [];
  const pickedSlot = picked ? bars[picked.bar]?.slots[picked.slot] : null;

  const tap = (at: SlotRef) => {
    if (!job) return;
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

  return (
    <Screen refreshControl={<RefreshControl refreshing={hud.isRefetching} onRefresh={() => void Promise.all([hud.refetch(), changes.refetch()])} />}>
      <Stack.Screen options={{ title: 'Barres d’actions' }} />
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
          <ThemedText type="small" themeColor="textSecondary">
            Relevé {formatAgo(Date.parse(hud.data!.updatedAt))}. Touche une case, puis une autre pour les échanger (ou la déplacer vers une case vide).
          </ThemedText>
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
          <ThemedText type="subtitle" style={styles.jobName}>
            {job.name}
          </ThemedText>

          {layoutElements.length > 0 ? (
            <View style={styles.miniature}>
              <HudMiniature elements={layoutElements} screen={hud.data!.screen} highlight={picked?.bar ?? null} />
              <ThemedText type="small" themeColor="textSecondary">
                Emplacement des barres dans ta disposition d’ATH actuelle{picked ? ` : barre ${picked.bar + 1} en doré` : ''}.
              </ThemedText>
            </View>
          ) : null}

          <Card style={styles.sticky}>
            {pickedSlot ? (
              <View style={styles.pickedRow}>
                <GameIcon uri={pickedSlot.icon ? gameIconUrl(pickedSlot.icon) : null} size={36} />
                <View style={styles.flex}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {pickedSlot.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Touche la case de destination.
                  </ThemedText>
                </View>
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
                {count === 0 ? 'Aucune modification en cours.' : `${count} case(s) modifiée(s).`}
              </ThemedText>
            )}
            <View style={styles.actions}>
              <View style={styles.flex}>
                <Button label={send.isPending ? 'Envoi…' : 'Envoyer au jeu'} disabled={count === 0 || send.isPending} onPress={submit} />
              </View>
              {count > 0 ? (
                <View style={styles.flex}>
                  <Button
                    label="Tout annuler"
                    variant="secondary"
                    onPress={() => {
                      setEdits({});
                      setPicked(null);
                    }}
                  />
                </View>
              ) : null}
            </View>
            {send.error ? <ErrorBox error={send.error} /> : null}
          </Card>
          <ChangeList changes={changes.data} kinds={['hotbars']} onCancel={(cid) => cancel.mutate(cid)} />

          {bars
            .filter((bar) => showEmpty || bar.slots.some(Boolean) || (picked !== null && picked.bar !== bar.id))
            .map((bar) => (
              <View key={bar.id} style={styles.bar}>
                <View style={styles.barHead}>
                  <ThemedText type="smallBold">Barre {bar.id + 1}</ThemedText>
                  {bar.shared ? <Badge label="Commune à tous les jobs" /> : null}
                  {hiddenBars.has(bar.id) ? <Badge label="Masquée en jeu" tone="down" /> : null}
                  {layoutElements.length > 0 && !hiddenBars.has(bar.id) ? (
                    <View style={styles.barMap}>
                      <HudMiniature elements={layoutElements} screen={hud.data!.screen} highlight={bar.id} compact />
                    </View>
                  ) : null}
                </View>
                <View style={styles.grid}>
                  {bar.slots.map((slot, index) => {
                    const isPicked = picked?.bar === bar.id && picked.slot === index;
                    const was = before[bar.id]?.slots[index];
                    const changed = (was?.type ?? 0) !== (slot?.type ?? 0) || (was?.id ?? 0) !== (slot?.id ?? 0);
                    return (
                      <Pressable
                        key={index}
                        accessibilityRole="button"
                        accessibilityLabel={`Barre ${bar.id + 1}, case ${index + 1} : ${slot?.name ?? 'vide'}`}
                        onPress={() => tap({ bar: bar.id, slot: index })}
                        style={[
                          styles.cell,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: isPicked ? theme.accent : changed ? theme.textSecondary : 'transparent',
                            borderStyle: changed && !isPicked ? 'dashed' : 'solid',
                          },
                        ]}>
                        {slot ? (
                          slot.icon ? (
                            <GameIcon uri={gameIconUrl(slot.icon)} size={40} dimmed={picked !== null && !isPicked} />
                          ) : (
                            <ThemedText type="small" numberOfLines={2} style={styles.cellText}>
                              {slot.name}
                            </ThemedText>
                          )
                        ) : (
                          <ThemedText type="small" themeColor="textSecondary">
                            {index + 1}
                          </ThemedText>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          <Chip label={showEmpty ? 'Cacher les barres vides' : 'Montrer les barres vides'} onPress={() => setShowEmpty((v) => !v)} />
          <ThemedText type="small" themeColor="textSecondary">
            Pour ta sécurité, l’appli ne peut que réorganiser ce qui est déjà dans tes barres : pour ajouter une action, fais-le en jeu.
          </ThemedText>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  jobs: { gap: Spacing.one, paddingVertical: Spacing.one },
  jobName: { textTransform: 'capitalize' },
  miniature: { gap: Spacing.one },
  barMap: { marginLeft: 'auto' },
  sticky: { gap: Spacing.two },
  pickedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1, minWidth: 0 },
  bar: { gap: Spacing.one },
  barHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    width: `${100 / COLUMNS - 1.6}%`,
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellText: { fontSize: 9, lineHeight: 11, textAlign: 'center', paddingHorizontal: 2 },
});
