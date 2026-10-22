/* eslint-disable react/no-unknown-property -- propriétés three.js des éléments react-three-fiber */
/**
 * Visionneuse 3D d'un personnage (.glb exporté par le plugin Dalamud).
 * Glisser horizontalement pour tourner, « Corps » / « Visage » pour cadrer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, PanResponder, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ThemedText } from '@/components/themed-text';
import { Canvas, useFrame, useThree } from '@/components/three/fiber';
import { Spacing } from '@/constants/theme';
import { computeFraming, type Bounds, type FramingMode } from '@/utils/framing';
import { ensureTextDecoder } from '@/utils/utf8';

const FOV = 30;
const AUTO_SPIN = 0.35; // radians par seconde, jusqu'au premier geste
/** Bas de la vue laissé au nom du personnage, affiché par-dessus. */
const BOTTOM_INSET = 0.3;

/** Rotation du modèle : tourne seul jusqu'au premier geste, puis suit le doigt. */
class SpinControl {
  yaw = 0;
  private spinning = true;
  private start = 0;

  stop() {
    this.spinning = false;
  }
  grab() {
    this.spinning = false;
    this.start = this.yaw;
  }
  drag(dx: number) {
    this.yaw = this.start + dx * 0.012;
  }
  tick(delta: number): number {
    if (this.spinning) this.yaw += AUTO_SPIN * delta;
    return this.yaw;
  }
}

async function parseGlb(data: ArrayBuffer): Promise<THREE.Group> {
  ensureTextDecoder();
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.traverse((node) => {
    // Les maillages animés (skinning) peuvent sortir de leur boîte : on ne les élimine jamais du rendu.
    if ((node as THREE.Mesh).isMesh) node.frustumCulled = false;
  });
  return gltf.scene;
}

function dispose(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function boundsOf(object: THREE.Object3D): Bounds {
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return { min: [-0.5, 0, -0.5], max: [0.5, 1.7, 0.5] };
  return { min: box.min.toArray(), max: box.max.toArray() };
}

function Model({ scene, control, mode }: { scene: THREE.Group; control: SpinControl; mode: FramingMode }) {
  const group = useRef<THREE.Group>(null);
  const placed = useRef(false);
  const size = useThree((s) => s.size);
  const bounds = useMemo(() => boundsOf(scene), [scene]);
  // Centre le personnage sur l'axe de rotation (X et Z), sans toucher à la hauteur.
  const offset = useMemo<[number, number, number]>(
    () => [-(bounds.min[0] + bounds.max[0]) / 2, 0, -(bounds.min[2] + bounds.max[2]) / 2],
    [bounds],
  );
  const target = useMemo(() => computeFraming(bounds, mode, FOV, size.width / Math.max(size.height, 1), BOTTOM_INSET), [bounds, mode, size]);

  useFrame((state, delta) => {
    const yaw = control.tick(delta);
    if (group.current) group.current.rotation.y = yaw;
    // Glisse doucement vers le cadrage voulu (instantané à la première image).
    const k = placed.current ? 1 - Math.exp(-delta * 6) : 1;
    placed.current = true;
    const camera = state.camera;
    camera.position.set(
      camera.position.x * (1 - k),
      camera.position.y + (target.targetY - camera.position.y) * k,
      camera.position.z + (target.distance - camera.position.z) * k,
    );
    camera.lookAt(0, camera.position.y, 0);
  });

  return (
    <group ref={group}>
      <primitive object={scene} position={offset} />
    </group>
  );
}

export function CharacterViewer({
  data,
  name,
  style,
}: {
  /** Contenu du fichier .glb. */
  data: ArrayBuffer;
  name: string;
  style?: StyleProp<ViewStyle>;
}) {
  // Résultat de la lecture, rattaché au fichier lu : un nouveau fichier repart de zéro.
  const [parsed, setParsed] = useState<{ source: ArrayBuffer; scene?: THREE.Group; error?: string } | null>(null);
  const [mode, setMode] = useState<FramingMode>('body');
  const [control] = useState(() => new SpinControl());
  const [pan] = useState(() =>
    PanResponder.create({
      // Seuls les glissements horizontaux font tourner : le défilement vertical de la page reste libre.
      onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderGrant: () => control.grab(),
      onPanResponderMove: (_, g) => control.drag(g.dx),
      onPanResponderTerminationRequest: () => false,
    }),
  );

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Group | null = null;
    parseGlb(data)
      .then((group) => {
        loaded = group;
        if (alive) setParsed({ source: data, scene: group });
        else dispose(group);
      })
      .catch((e: unknown) => {
        if (alive) setParsed({ source: data, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
      if (loaded) dispose(loaded);
    };
  }, [data]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) control.stop();
    });
  }, [control]);

  const current = parsed?.source === data ? parsed : null;
  const scene = current?.scene ?? null;
  const failed = current?.error ?? null;

  return (
    <View
      style={[styles.root, style]}
      accessible
      accessibilityLabel={`Modèle 3D de ${name}. Glisse horizontalement pour le faire tourner.`}
      {...pan.panHandlers}>
      <Canvas camera={{ fov: FOV, near: 0.01, far: 100, position: [0, 1, 4] }} style={StyleSheet.absoluteFill}>
        <hemisphereLight args={['#dfe6ff', '#2a2230', 1.4]} />
        <directionalLight position={[1.5, 3, 4]} intensity={2.4} />
        <directionalLight position={[-3, 2, -3]} intensity={1.6} color="#9fb8ff" />
        {scene ? <Model scene={scene} control={control} mode={mode} /> : null}
      </Canvas>

      {!scene ? (
        <View style={styles.center} pointerEvents="none">
          {failed ? (
            <ThemedText type="small" style={styles.light}>
              Modèle 3D illisible : {failed}
            </ThemedText>
          ) : (
            <>
              <ActivityIndicator color="#E8C987" />
              <ThemedText type="small" style={styles.light}>
                Préparation du modèle 3D…
              </ThemedText>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.modes}>
        {(
          [
            { value: 'body', label: 'Corps' },
            { value: 'face', label: 'Visage' },
          ] as const
        ).map((option) => {
          const selected = option.value === mode;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setMode(option.value)}
              style={[styles.mode, selected && styles.modeSelected]}>
              <ThemedText type="smallBold" style={{ color: selected ? '#151B2B' : '#FFFFFF', fontSize: 13 }}>
                {option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
  light: { color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  modes: { position: 'absolute', top: Spacing.two, left: Spacing.two, flexDirection: 'row', gap: Spacing.one },
  mode: { minHeight: 32, paddingHorizontal: Spacing.two, borderRadius: 16, justifyContent: 'center', backgroundColor: 'rgba(5,8,15,0.55)' },
  modeSelected: { backgroundColor: '#E8C987' },
});
