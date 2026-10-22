/** Visionneuse 3D plein écran : cadrage, fond, rotation automatique. */
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { loadModel } from '@/api/model-cache';
import { CharacterViewer } from '@/components/character-viewer';
import { ThemedText } from '@/components/themed-text';
import { Button, ErrorBox, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { VIEWER_BACKGROUNDS, viewerBackground } from '@/constants/viewer';
import { useAppStore } from '@/store/app-store';
import type { FramingMode } from '@/utils/framing';
import { OrbitState } from '@/utils/orbit';

const FRAMINGS: { value: FramingMode; label: string }[] = [
  { value: 'body', label: 'Corps' },
  { value: 'bust', label: 'Buste' },
  { value: 'face', label: 'Visage' },
];

/** Part basse de l'écran occupée par le panneau de commandes. */
const PANEL_INSET = 0.28;

export default function ModelScreen() {
  const { id: rawId, name = '' } = useLocalSearchParams<{ id: string; name?: string }>();
  const id = Number(rawId);
  const backgroundKey = useAppStore((s) => s.viewerBackground);
  const setBackground = useAppStore((s) => s.setViewerBackground);
  const background = viewerBackground(backgroundKey);
  const [orbit] = useState(() => new OrbitState());
  const [mode, setMode] = useState<FramingMode>('body');
  const [autoRotate, setAutoRotate] = useState(true);

  const model = useQuery({
    queryKey: ['sync', 'model', id],
    queryFn: () => loadModel(id),
    enabled: Number.isFinite(id),
    staleTime: 60_000,
    gcTime: 60_000,
    structuralSharing: false,
  });

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!reduce) return;
      orbit.setAutoRotate(false);
      setAutoRotate(false);
    });
  }, [orbit]);

  const toggleAuto = () => {
    orbit.setAutoRotate(!autoRotate);
    setAutoRotate(!autoRotate);
  };

  return (
    <View style={[styles.root, { backgroundColor: background.bottom }]}>
      {model.data ? (
        <CharacterViewer
          data={model.data}
          name={name}
          orbit={orbit}
          mode={mode}
          background={background}
          bottomInset={PANEL_INSET}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.status}>
          {model.isPending ? <Loading label="Téléchargement du modèle 3D…" /> : null}
          {model.error ? <ErrorBox error={model.error} onRetry={() => model.refetch()} /> : null}
          {model.data === null ? <ErrorBox error={new Error('Ce personnage n’a pas encore de modèle 3D.')} /> : null}
        </View>
      )}

      <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
        <LinearGradient colors={['rgba(5,8,15,0.55)', 'transparent']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={() => router.back()} style={styles.close} hitSlop={8}>
          <ThemedText style={styles.closeText}>✕</ThemedText>
        </Pressable>
        <ThemedText type="smallBold" style={styles.title} numberOfLines={1}>
          {name}
        </ThemedText>
        <View style={styles.spacer} />
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.panelWrap} pointerEvents="box-none">
        <View style={styles.panel}>
          <View style={styles.row} accessibilityRole="tablist">
            {FRAMINGS.map((f) => {
              const selected = f.value === mode;
              return (
                <Pressable
                  key={f.value}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setMode(f.value)}
                  style={[styles.chip, selected && styles.chipSelected]}>
                  <ThemedText type="smallBold" style={{ color: selected ? '#151B2B' : '#FFFFFF' }}>
                    {f.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.row}>
            {VIEWER_BACKGROUNDS.map((b) => {
              const selected = b.key === background.key;
              return (
                <Pressable
                  key={b.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Fond ${b.label}`}
                  accessibilityState={{ selected }}
                  onPress={() => setBackground(b.key)}
                  style={styles.swatchWrap}>
                  <LinearGradient colors={[b.top, b.bottom]} style={[styles.swatch, selected && styles.swatchSelected]} />
                  <ThemedText type="small" style={styles.swatchLabel} numberOfLines={1}>
                    {b.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.row}>
            <View style={styles.grow}>
              <Button label={autoRotate ? 'Arrêter la rotation' : 'Rotation auto'} variant="secondary" onPress={toggleAuto} />
            </View>
            <View style={styles.grow}>
              <Button label="Recentrer" variant="secondary" onPress={() => orbit.reset()} />
            </View>
          </View>
          <ThemedText type="small" style={styles.hint}>
            Glisse pour tourner ou incliner · pince pour zoomer · touche deux fois pour recentrer
          </ThemedText>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  status: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,8,15,0.45)',
  },
  closeText: { color: '#FFFFFF', fontSize: 18 },
  spacer: { width: 44, height: 44 },
  title: { color: '#FFFFFF', flexShrink: 1, textAlign: 'center' },
  panelWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  panel: {
    margin: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
    borderRadius: 20,
    backgroundColor: 'rgba(8,11,20,0.78)',
  },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  grow: { flex: 1 },
  chip: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipSelected: { backgroundColor: '#E8C987' },
  swatchWrap: { flex: 1, alignItems: 'center', gap: 4 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#E8C987' },
  swatchLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 11 },
  hint: { color: 'rgba(255,255,255,0.55)', fontSize: 12, textAlign: 'center' },
});
