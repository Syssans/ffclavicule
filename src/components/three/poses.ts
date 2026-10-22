/**
 * Poses du personnage, à partir du squelette du jeu (noms d'os de FFXIV).
 *
 * Les rotations sont exprimées dans le repère du personnage (Y vers le haut, il regarde vers +Z,
 * sa gauche est en +X) : pas besoin de connaître l'orientation propre à chaque os.
 */
import * as THREE from 'three';

export type PoseKey = 'jeu' | 'repos' | 'salut' | 'victoire';

export const POSES: { key: PoseKey; label: string }[] = [
  { key: 'jeu', label: 'En jeu' },
  { key: 'repos', label: 'Repos' },
  { key: 'salut', label: 'Salut' },
  { key: 'victoire', label: 'Victoire' },
];

/** Rotation d'un os autour d'un axe du repère du personnage, en degrés. */
type Turn = [bone: string, axis: [number, number, number], degrees: number];

const X: [number, number, number] = [1, 0, 0];
const Y: [number, number, number] = [0, 1, 0];
const Z: [number, number, number] = [0, 0, 1];

/** Gauche puis droite : les rotations autour de Y et Z s'inversent d'un côté à l'autre. */
function both(bone: string, axis: [number, number, number], degrees: number): Turn[] {
  const mirrored: [number, number, number] = [axis[0], -axis[1], -axis[2]];
  return [
    [`${bone}_l`, axis, degrees],
    [`${bone}_r`, mirrored, degrees],
  ];
}

/** Poses construites à partir de la pose de référence du squelette (bras écartés en A). */
const FROM_REST: Record<Exclude<PoseKey, 'jeu'>, Turn[]> = {
  repos: [...both('j_ude_a', Z, -38), ...both('j_ude_a', X, 6), ...both('j_ude_b', Y, -18)],
  salut: [
    ['j_ude_a_l', Z, -38],
    ['j_ude_b_l', Y, -15],
    ['j_ude_a_r', Z, -100],
    ['j_ude_a_r', X, -15],
    ['j_ude_b_r', Z, -70],
    ['j_kubi', Z, -6],
  ],
  victoire: [...both('j_ude_a', Z, 75), ...both('j_ude_b', Z, 15), ['j_kubi', X, -10]],
};

/** Valeurs locales (rotation) de chaque os pour une pose. */
export type PoseData = Map<THREE.Object3D, THREE.Quaternion>;

export interface PoseRig {
  bones: Map<string, THREE.Object3D>;
  rest: PoseData;
  poses: Partial<Record<PoseKey, PoseData>>;
}

function snapshot(bones: Map<string, THREE.Object3D>): PoseData {
  const out: PoseData = new Map();
  for (const bone of bones.values()) out.set(bone, bone.quaternion.clone());
  return out;
}

function restore(data: PoseData) {
  for (const [bone, q] of data) bone.quaternion.copy(q);
}

/** Applique une rotation exprimée dans le repère du personnage `root` à un os. */
function turn(root: THREE.Object3D, bone: THREE.Object3D, axis: [number, number, number], degrees: number) {
  root.updateMatrixWorld(true);
  const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
  const worldAxis = new THREE.Vector3(...axis).applyQuaternion(rootQ).normalize();
  const delta = new THREE.Quaternion().setFromAxisAngle(worldAxis, THREE.MathUtils.degToRad(degrees));
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.invert().multiply(delta.multiply(boneWorld)));
}

/**
 * Prépare les poses d'un personnage chargé. `gamePose` : l'animation « pose » exportée par le plugin
 * (la position du personnage en jeu au moment de l'envoi), si elle existe.
 */
export function buildRig(root: THREE.Object3D, gamePose: THREE.AnimationClip | undefined): PoseRig | null {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((node) => {
    if (node.name.startsWith('j_') && !bones.has(node.name)) bones.set(node.name, node);
  });
  if (!bones.has('j_kosi')) return null;

  const rest = snapshot(bones);
  const poses: PoseRig['poses'] = {};

  if (gamePose) {
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(gamePose).play();
    mixer.update(0);
    poses.jeu = snapshot(bones);
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    restore(rest);
  }

  for (const [key, turns] of Object.entries(FROM_REST) as [Exclude<PoseKey, 'jeu'>, Turn[]][]) {
    restore(rest);
    for (const [name, axis, degrees] of turns) {
      const bone = bones.get(name);
      if (bone) turn(root, bone, axis, degrees);
    }
    poses[key] = snapshot(bones);
  }
  restore(poses.jeu ?? rest);
  root.updateMatrixWorld(true);
  return { bones, rest, poses };
}

/** Hauteurs utiles au cadrage : cou et taille, dans le repère du personnage. */
export function landmarks(rig: PoseRig | null, root: THREE.Object3D): { neckY?: number; waistY?: number } {
  if (!rig) return {};
  root.updateMatrixWorld(true);
  const y = (name: string) => {
    const bone = rig.bones.get(name);
    return bone ? root.worldToLocal(bone.getWorldPosition(new THREE.Vector3())).y : undefined;
  };
  return { neckY: y('j_kubi'), waistY: y('j_kosi') };
}

const tmp = new THREE.Quaternion();
const breath = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);

/**
 * Avance d'une image : glisse vers la pose voulue et ajoute une légère respiration.
 * `blend` : part du chemin parcourue à cette image (0 à 1).
 */
export function animateRig(rig: PoseRig, key: PoseKey, blend: number, time: number, breathing: boolean) {
  const target = rig.poses[key] ?? rig.poses.jeu ?? rig.rest;
  for (const [bone, q] of target) bone.quaternion.slerp(q, blend);
  if (!breathing) return;
  // Respiration : le buste et la tête oscillent d'un ou deux degrés, sur environ quatre secondes.
  const phase = Math.sin(time * 1.6);
  for (const [name, degrees] of [
    ['j_sebo_b', 0.9],
    ['j_sebo_c', 0.7],
    ['j_kubi', -0.6],
  ] as const) {
    const bone = rig.bones.get(name);
    const base = bone ? target.get(bone) : undefined;
    if (!bone || !base) continue;
    breath.setFromAxisAngle(AXIS_X, THREE.MathUtils.degToRad(degrees * phase));
    tmp.copy(base).multiply(breath);
    bone.quaternion.slerp(tmp, Math.max(blend, 0.5));
  }
}
