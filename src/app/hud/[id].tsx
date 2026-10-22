/** Éditeur de l'ATH : déplacer, redimensionner, masquer les éléments des 4 dispositions du jeu. */
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import type { HudElement, HudElementChange } from '@/api/hud';
import { HudCanvas } from '@/components/hud-canvas';
import { ChangeList, useHud } from '@/components/hud-changes';
import { ThemedText } from '@/components/themed-text';
import { Badge, Button, Card, Chip, Empty, ErrorBox, Loading, Screen, Section, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppStore } from '@/store/app-store';
import { formatAgo } from '@/utils/format';
import {
  elementChanges,
  elementRect,
  mergeElementChanges,
  OPACITIES,
  positionFor,
  SCALES,
  SHAPES,
  withEdit,
  type ElementEdit,
} from '@/utils/hud';

type Filter = 'hotbar' | 'main' | 'gauge' | 'content' | 'pvp';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'hotbar', label: 'Barres' },
  { value: 'main', label: 'Général' },
  { value: 'gauge', label: 'Jauges' },
  { value: 'content', label: 'Contenus' },
  { value: 'pvp', label: 'JcJ' },
];

const GROUP_LABELS: Record<Filter, string> = {
  hotbar: 'Barre',
  main: 'Général',
  gauge: 'Jauge',
  content: 'Contenu',
  pvp: 'JcJ',
};

export default function HudScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = Number(rawId);
  const link = useAppStore((s) => s.privateLinks[id]);
  const { hud, changes, send, cancel } = useHud(id, link?.token);
  const theme = useTheme();

  const [layoutIndex, setLayoutIndex] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, Record<number, ElementEdit>>>({});
  const [selected, setSelected] = useState<number | null>(null);
  const [filters, setFilters] = useState<Set<Filter>>(new Set(['hotbar', 'main', 'gauge']));
  const [showHidden, setShowHidden] = useState(false);
  const [step, setStep] = useState(1);

  const snapshot = hud.data;
  const layout = layoutIndex ?? snapshot?.currentLayout ?? 0;
  const currentJob = snapshot?.hotbars?.jobs.find((j) => j.job === snapshot.hotbars?.currentJob)?.abbr;

  // Ce qui a été envoyé mais pas encore relu dans le relevé : montré comme si c'était fait.
  const sent = useMemo(() => {
    const updatedAt = snapshot ? Date.parse(snapshot.updatedAt) : 0;
    const lists: HudElementChange[][] = [];
    for (const c of changes.data ?? []) {
      if (c.change.kind !== 'layout' || c.change.layout !== layout) continue;
      const waiting = c.status === 'pending' || ((c.status === 'applied' || c.status === 'partial') && Date.parse(c.doneAt ?? '') > updatedAt);
      if (waiting) lists.push(c.change.elements);
    }
    return mergeElementChanges(lists);
  }, [changes.data, snapshot, layout]);

  const base = useMemo(
    () => (snapshot?.layouts.find((l) => l.index === layout)?.elements ?? []).map((e) => withEdit(e, sent[e.hash])),
    [snapshot, layout, sent],
  );
  const layoutEdits = useMemo(() => edits[layout] ?? {}, [edits, layout]);
  const elements = useMemo(() => base.map((e) => withEdit(e, layoutEdits[e.hash])), [base, layoutEdits]);
  const pendingChanges = useMemo(() => elementChanges(base, layoutEdits), [base, layoutEdits]);
  const modified = useMemo(() => new Set(pendingChanges.map((c) => c.hash)), [pendingChanges]);

  const shown = elements.filter(
    (e) => filters.has(e.group) && (e.group !== 'gauge' || !currentJob || e.job === currentJob) && (showHidden || e.visible || e.hash === selected),
  );
  const listed = elements.filter((e) => filters.has(e.group) && (e.group !== 'gauge' || !currentJob || e.job === currentJob));
  const element = elements.find((e) => e.hash === selected) ?? null;

  const edit = (hash: number, change: ElementEdit) =>
    setEdits((all) => ({ ...all, [layout]: { ...all[layout], [hash]: { ...all[layout]?.[hash], ...change } } }));
  const reset = (hash: number) =>
    setEdits((all) => {
      const next = { ...all[layout] };
      delete next[hash];
      return { ...all, [layout]: next };
    });
  const nudge = (dx: number, dy: number) => {
    if (!element || !snapshot) return;
    const rect = elementRect(element, snapshot.screen);
    edit(element.hash, positionFor(element, snapshot.screen, rect.x + dx, rect.y + dy));
  };
  const toggleFilter = (f: Filter) =>
    setFilters((all) => {
      const next = new Set(all);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const submit = () =>
    send.mutate([{ kind: 'layout', layout, elements: pendingChanges }], {
      onSuccess: () => setEdits((all) => ({ ...all, [layout]: {} })),
    });

  if (!link) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'ATH du jeu' }} />
        <Empty>Ce téléphone n’est pas connecté à ce personnage.</Empty>
        <Button label="Connecter avec un code" onPress={() => router.replace({ pathname: '/connect', params: { id: String(id) } })} />
      </Screen>
    );
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={hud.isRefetching} onRefresh={() => (hud.refetch(), changes.refetch())} />}>
      <Stack.Screen options={{ title: 'ATH du jeu' }} />
      {hud.isPending ? <Loading label="Lecture de ton ATH…" /> : null}
      {hud.error ? <ErrorBox error={hud.error} onRetry={() => hud.refetch()} /> : null}
      {snapshot === null ? (
        <Card>
          <ThemedText>Le plugin n’a pas encore envoyé ton ATH.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Mets à jour le plugin, puis vérifie dans /clavicule que « Modifier l’ATH et les barres d’actions depuis l’appli » est coché.
          </ThemedText>
        </Card>
      ) : null}
      {snapshot ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Relevé {formatAgo(Date.parse(snapshot.updatedAt))} · écran {snapshot.screen.width}×{snapshot.screen.height}
          </ThemedText>
          <Segmented
            options={snapshot.layouts.map((l) => ({ value: String(l.index), label: `${l.index + 1}${l.index === snapshot.currentLayout ? ' ●' : ''}` }))}
            value={String(layout)}
            onChange={(v) => {
              setLayoutIndex(Number(v));
              setSelected(null);
            }}
          />
          {layout !== snapshot.currentLayout ? (
            <Button
              label={`Utiliser la disposition ${layout + 1} en jeu`}
              variant="secondary"
              disabled={send.isPending}
              onPress={() => send.mutate([{ kind: 'activate', layout }])}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              ● Disposition affichée en jeu.
            </ThemedText>
          )}

          <View style={styles.chips}>
            {FILTERS.map((f) => (
              <Chip key={f.value} label={f.label} selected={filters.has(f.value)} onPress={() => toggleFilter(f.value)} />
            ))}
            <Chip label="Masqués" selected={showHidden} onPress={() => setShowHidden((v) => !v)} />
          </View>

          <HudCanvas
            elements={shown}
            screen={snapshot.screen}
            selected={selected}
            modified={modified}
            onSelect={setSelected}
            onMove={(hash, position) => edit(hash, position)}
          />
          <ThemedText type="small" themeColor="textSecondary">
            Fais glisser un cadre pour le déplacer (il s’aimante au centre et aux bords), touche-le pour le régler.
          </ThemedText>

          {element ? (
            <ElementPanel
              element={element}
              modified={modified.has(element.hash) || layoutEdits[element.hash] !== undefined}
              step={step}
              onStep={setStep}
              onEdit={(change) => edit(element.hash, change)}
              onNudge={nudge}
              onReset={() => reset(element.hash)}
              screenSize={snapshot.screen}
            />
          ) : null}

          <Card>
            <ThemedText type="smallBold">
              {pendingChanges.length === 0
                ? 'Aucune modification en cours.'
                : `${pendingChanges.length} élément(s) modifié(s) dans la disposition ${layout + 1}.`}
            </ThemedText>
            <Button
              label={send.isPending ? 'Envoi…' : 'Envoyer au jeu'}
              disabled={pendingChanges.length === 0 || send.isPending}
              onPress={submit}
            />
            {pendingChanges.length > 0 ? (
              <Button label="Tout annuler" variant="secondary" onPress={() => setEdits((all) => ({ ...all, [layout]: {} }))} />
            ) : null}
            {send.error ? <ErrorBox error={send.error} /> : null}
          </Card>
          <ChangeList changes={changes.data} kinds={['layout', 'activate']} onCancel={(cid) => cancel.mutate(cid)} />

          <Section title={`Éléments (${listed.length})`}>
            {listed.map((e) => (
              <Pressable
                key={e.hash}
                onPress={() => setSelected(e.hash)}
                style={[styles.row, { backgroundColor: e.hash === selected ? theme.backgroundSelected : theme.backgroundElement }]}>
                <View style={styles.rowText}>
                  <ThemedText numberOfLines={1} style={!e.visible ? { color: theme.textSecondary } : undefined}>
                    {modified.has(e.hash) ? '• ' : ''}
                    {e.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {GROUP_LABELS[e.group]} · {Math.round(e.scale * 100)} %{e.visible ? '' : ' · masqué'}
                  </ThemedText>
                </View>
                <Chip label={e.visible ? 'Affiché' : 'Masqué'} selected={e.visible} onPress={() => edit(e.hash, { visible: !e.visible })} />
              </Pressable>
            ))}
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

function ElementPanel({
  element,
  modified,
  step,
  onStep,
  onEdit,
  onNudge,
  onReset,
  screenSize,
}: {
  element: HudElement;
  modified: boolean;
  step: number;
  onStep: (step: number) => void;
  onEdit: (change: ElementEdit) => void;
  onNudge: (dx: number, dy: number) => void;
  onReset: () => void;
  screenSize: { width: number; height: number; uiScale: number };
}) {
  const rect = elementRect(element, screenSize);
  return (
    <Card>
      <View style={styles.panelHead}>
        <ThemedText type="smallBold" style={styles.rowText} numberOfLines={2}>
          {element.name}
        </ThemedText>
        {modified ? <Badge label="Modifié" tone="accent" /> : null}
      </View>
      <View style={styles.chips}>
        <Chip label="Affiché" selected={element.visible} onPress={() => onEdit({ visible: true })} />
        <Chip label="Masqué" selected={!element.visible} onPress={() => onEdit({ visible: false })} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        Taille
      </ThemedText>
      <View style={styles.chips}>
        {SCALES.map((s) => (
          <Chip key={s} label={`${Math.round(s * 100)}`} selected={Math.abs(s - element.scale) < 0.001} onPress={() => onEdit({ scale: s })} />
        ))}
      </View>

      {element.hotbar !== undefined ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Forme
          </ThemedText>
          <View style={styles.chips}>
            {SHAPES.map((s) => (
              <Chip key={s.value} label={s.label} selected={element.shape === s.value} onPress={() => onEdit({ shape: s.value })} />
            ))}
          </View>
        </>
      ) : null}

      {element.group !== 'gauge' ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            Opacité
          </ThemedText>
          <View style={styles.chips}>
            {OPACITIES.map((o) => (
              <Chip
                key={o.value}
                label={o.label}
                selected={Math.abs(o.value - element.opacity) < 20}
                onPress={() => onEdit({ opacity: o.value })}
              />
            ))}
          </View>
        </>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        Position : {Math.round(rect.x)} × {Math.round(rect.y)} px
      </ThemedText>
      <View style={styles.nudge}>
        <Chip label="←" onPress={() => onNudge(-step, 0)} />
        <Chip label="↑" onPress={() => onNudge(0, -step)} />
        <Chip label="↓" onPress={() => onNudge(0, step)} />
        <Chip label="→" onPress={() => onNudge(step, 0)} />
        <View style={styles.spacer} />
        <Chip label="1 px" selected={step === 1} onPress={() => onStep(1)} />
        <Chip label="10 px" selected={step === 10} onPress={() => onStep(10)} />
      </View>
      {modified ? <Button label="Rétablir cet élément" variant="secondary" onPress={onReset} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  nudge: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, alignItems: 'center' },
  spacer: { flex: 1 },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: 12 },
  rowText: { flex: 1, minWidth: 0 },
});
