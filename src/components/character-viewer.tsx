/* eslint-disable react/no-unknown-property -- propriétés three.js des éléments react-three-fiber */
/**
 * Visionneuse 3D d'un personnage (.glb envoyé par le plugin Dalamud).
 * Un doigt : tourner (horizontal) et incliner (vertical). Deux doigts ou molette : zoomer. Double toucher : recentrer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  PanResponder,
  Platform,
  StyleSheet,
  View,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ThemedText } from '@/components/themed-text';
import { Canvas, useFrame, useThree } from '@/components/three/fiber';
import { animateRig, buildRig, landmarks, type PoseKey, type PoseRig } from '@/components/three/poses';
import { Spacing } from '@/constants/theme';
import type { ViewerBackground } from '@/constants/viewer';
import { computeFraming, type Bounds, type FramingMode, type Landmarks } from '@/utils/framing';
import type { OrbitState } from '@/utils/orbit';
import { ensureTextDecoder } from '@/utils/utf8';

const FOV = 30;

interface LoadedModel {
  scene: THREE.Group;
  rig: PoseRig | null;
  bounds: Bounds;
  marks: Landmarks;
}

async function parseGlb(data: ArrayBuffer): Promise<LoadedModel> {
  ensureTextDecoder();
  const gltf = await new GLTFLoader().parseAsync(data, '');
  gltf.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    // Les maillages animés (skinning) peuvent sortir de leur boîte : on ne les élimine jamais du rendu.
    mesh.frustumCulled = false;
    // Les « couleurs de sommet » du jeu sont des données pour ses shaders, pas des couleurs :
    // les appliquer teinte la peau en vert-bleu. Les couleurs sont déjà cuites dans les textures.
    if (mesh.geometry.hasAttribute('color')) mesh.geometry.deleteAttribute('color');
    // Les formes (expressions, morphologie) en portent aussi ; sans couleur de base, three.js ne compilerait plus.
    delete mesh.geometry.morphAttributes.color;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material && 'vertexColors' in material) material.vertexColors = false;
    }
  });
  // Pose du personnage en jeu au moment de l'envoi (animation « pose » exportée par le plugin).
  const gamePose = gltf.animations.find((clip) => clip.name === 'pose') ?? gltf.animations[0];
  const rig = buildRig(gltf.scene, gamePose);
  return { scene: gltf.scene, rig, bounds: boundsOf(gltf.scene), marks: landmarks(rig, gltf.scene) };
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

/** Armes (w1234…) et montures : exclues du cadrage, qui vise le personnage lui-même. */
function isCharacterMesh(mesh: THREE.Object3D): boolean {
  return !/^(w|m)\d{4}/.test(mesh.name);
}

function boundsOf(object: THREE.Object3D): Bounds {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  object.traverse((node) => {
    if ((node as THREE.Mesh).isMesh && isCharacterMesh(node)) box.expandByObject(node, true);
  });
  if (box.isEmpty()) box.setFromObject(object, true);
  if (box.isEmpty()) return { min: [-0.5, 0, -0.5], max: [0.5, 1.7, 0.5] };
  return { min: box.min.toArray(), max: box.max.toArray() };
}

/** Dégradé vertical en texture : fonctionne partout, y compris avec expo-gl (pas de canvas 2D). */
function gradientTexture(top: string, bottom: string): THREE.DataTexture {
  const height = 256;
  const data = new Uint8Array(height * 4);
  const a = new THREE.Color(bottom);
  const b = new THREE.Color(top);
  const c = new THREE.Color();
  for (let y = 0; y < height; y++) {
    c.copy(a).lerp(b, y / (height - 1));
    data.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], y * 4);
  }
  const texture = new THREE.DataTexture(data, 1, height, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** Ombre douce et ronde sous les pieds. */
function shadowTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2);
      data[(y * size + x) * 4 + 3] = Math.round((1 - r) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

function Scene({
  model,
  orbit,
  mode,
  pose,
  breathing,
  background,
  bottomInset,
}: {
  model: LoadedModel;
  orbit: OrbitState;
  mode: FramingMode;
  pose: PoseKey;
  breathing: boolean;
  background: ViewerBackground;
  bottomInset: number;
}) {
  const group = useRef<THREE.Group>(null);
  const placed = useRef(false);
  const lookY = useRef(0);
  const size = useThree((s) => s.size);
  const { scene, rig, bounds, marks } = model;
  // Centre le personnage sur l'axe de rotation (X et Z), sans toucher à la hauteur.
  const offset = useMemo<[number, number, number]>(
    () => [-(bounds.min[0] + bounds.max[0]) / 2, 0, -(bounds.min[2] + bounds.max[2]) / 2],
    [bounds],
  );
  const footprint = Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2], 0.4) * 1.3;
  const target = useMemo(
    () => computeFraming(bounds, mode, FOV, size.width / Math.max(size.height, 1), bottomInset, marks),
    [bounds, mode, size, bottomInset, marks],
  );
  const backdrop = useMemo(() => gradientTexture(background.top, background.bottom), [background]);
  const shadow = useMemo(() => shadowTexture(), []);
  useEffect(() => () => backdrop.dispose(), [backdrop]);
  useEffect(() => () => shadow.dispose(), [shadow]);

  useFrame((state, delta) => {
    if (rig) animateRig(rig, pose, 1 - Math.exp(-delta * 6), state.clock.elapsedTime, breathing);
    const yaw = orbit.tick(delta);
    if (group.current) group.current.rotation.y = yaw;
    // Glisse doucement vers le cadrage voulu (instantané à la première image).
    const k = placed.current ? 1 - Math.exp(-delta * 8) : 1;
    placed.current = true;
    lookY.current += (target.targetY - lookY.current) * k;
    const distance = target.distance * orbit.zoom;
    const camera = state.camera;
    camera.position.set(
      camera.position.x * (1 - k),
      camera.position.y + (lookY.current + Math.sin(orbit.pitch) * distance - camera.position.y) * k,
      camera.position.z + (Math.cos(orbit.pitch) * distance - camera.position.z) * k,
    );
    camera.lookAt(0, lookY.current, 0);
  });

  return (
    <>
      <primitive object={backdrop} attach="background" />
      <hemisphereLight args={[background.ambient.sky, background.ambient.ground, background.ambient.intensity]} />
      <directionalLight position={[1.5, 3, 4]} intensity={background.key_.intensity} color={background.key_.color} />
      <directionalLight position={[-3, 2, -3]} intensity={background.rim.intensity} color={background.rim.color} />
      <group ref={group}>
        <primitive object={scene} position={offset} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, bounds.min[1] + 0.002, 0]} renderOrder={-1}>
          <planeGeometry args={[footprint, footprint]} />
          <meshBasicMaterial map={shadow} color="#000000" transparent opacity={background.shadow} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

/** Suivi d'un geste : pincement en cours, double toucher. */
class GestureTracker {
  private pinchStart = 0;
  private lastTap = 0;
  private startedAt = 0;

  begin() {
    this.pinchStart = 0;
    this.startedAt = Date.now();
  }

  /** Rapport d'écartement des deux doigts depuis le début du pincement. */
  pinchScale(touches: { pageX: number; pageY: number }[]): number {
    const [a, b] = touches;
    const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    if (this.pinchStart === 0) this.pinchStart = distance;
    return distance / this.pinchStart;
  }

  isPinching(): boolean {
    return this.pinchStart > 0;
  }

  /** Vrai si ce toucher bref suit de près le précédent. */
  isDoubleTap(moved: number): boolean {
    const now = Date.now();
    const tap = moved < 8 && now - this.startedAt < 250;
    const double = tap && now - this.lastTap < 320;
    this.lastTap = tap && !double ? now : 0;
    return double;
  }
}

export function CharacterViewer({
  data,
  name,
  orbit,
  mode,
  pose = 'jeu',
  breathing = true,
  background,
  bottomInset = 0,
  style,
}: {
  /** Contenu du fichier .glb. */
  data: ArrayBuffer;
  name: string;
  orbit: OrbitState;
  mode: FramingMode;
  pose?: PoseKey;
  /** Légère respiration du personnage. */
  breathing?: boolean;
  background: ViewerBackground;
  /** Part basse de la vue couverte par des commandes (0 à 0,5). */
  bottomInset?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Résultat de la lecture, rattaché au fichier lu : un nouveau fichier repart de zéro.
  const [parsed, setParsed] = useState<{ source: ArrayBuffer; model?: LoadedModel; error?: string } | null>(null);
  const [tracker] = useState(() => new GestureTracker());
  const [pan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        tracker.begin();
        orbit.grab();
      },
      onPanResponderMove: (event: GestureResponderEvent, g) => {
        const touches = event.nativeEvent.touches;
        if (touches.length >= 2) orbit.pinch(tracker.pinchScale(touches));
        else if (!tracker.isPinching()) orbit.drag(g.dx, g.dy);
      },
      onPanResponderRelease: (_, g) => {
        orbit.release(tracker.isPinching() ? 0 : g.vx);
        if (tracker.isDoubleTap(Math.hypot(g.dx, g.dy))) orbit.reset();
      },
      onPanResponderTerminate: () => orbit.release(0),
    }),
  );
  const surface = useRef<View>(null);

  useEffect(() => {
    let alive = true;
    let loaded: THREE.Group | null = null;
    parseGlb(data)
      .then((model) => {
        loaded = model.scene;
        if (alive) setParsed({ source: data, model });
        else dispose(model.scene);
      })
      .catch((e: unknown) => {
        if (alive) setParsed({ source: data, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
      if (loaded) dispose(loaded);
    };
  }, [data]);

  // Molette de la souris (version web).
  useEffect(() => {
    if (Platform.OS !== 'web' || !surface.current) return;
    const node = surface.current as unknown as HTMLElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.wheel(e.deltaY);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [orbit]);

  const current = parsed?.source === data ? parsed : null;
  const model = current?.model ?? null;
  const failed = current?.error ?? null;

  return (
    <View
      ref={surface}
      style={[styles.root, { backgroundColor: background.bottom }, style]}
      accessible
      accessibilityLabel={`Modèle 3D de ${name}. Glisse pour le faire tourner, pince pour zoomer.`}
      {...pan.panHandlers}>
      <Canvas camera={{ fov: FOV, near: 0.01, far: 100, position: [0, 1, 4] }} style={StyleSheet.absoluteFill}>
        {model ? (
          <Scene
            model={model}
            orbit={orbit}
            mode={mode}
            pose={pose}
            breathing={breathing}
            background={background}
            bottomInset={bottomInset}
          />
        ) : null}
      </Canvas>

      {!model ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },
  light: { color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
});
