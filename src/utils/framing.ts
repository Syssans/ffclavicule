/** Cadrage de la caméra autour d'un personnage (boîte englobante, axe Y vers le haut). */

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface Framing {
  /** Hauteur visée par la caméra (centre de l'écran). */
  targetY: number;
  /** Distance de la caméra à l'axe de rotation. */
  distance: number;
}

export type FramingMode = 'body' | 'bust' | 'face';

/** Repères du squelette (hauteurs), quand le modèle en a un : cadrage juste quelles que soient les proportions. */
export interface Landmarks {
  /** Hauteur du cou (os j_kubi). */
  neckY?: number;
  /** Hauteur de la taille (os j_kosi). */
  waistY?: number;
}

/** Zone à montrer : centre vertical, hauteur, largeur, et marge relative. */
interface Region {
  centerY: number;
  height: number;
  width: number;
  margin: number;
}

function region(bounds: Bounds, mode: FramingMode, marks: Landmarks): Region {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const height = Math.max(maxY - minY, 1e-3);
  const width = Math.max(maxX - minX, maxZ - minZ, 1e-3);

  if (mode === 'face') {
    // La tête : du cou au sommet du crâne, ou environ le cinquième supérieur d'un personnage debout.
    const fromNeck = marks.neckY !== undefined && marks.neckY < maxY;
    const head = fromNeck ? (maxY - marks.neckY!) * 1.1 : height * 0.22;
    const top = fromNeck ? maxY : maxY - height * 0.02;
    return { centerY: top - head / 2, height: head, width: head, margin: 1.12 };
  }
  if (mode === 'bust') {
    // Tête et buste : de la taille au sommet du crâne, ou environ les 45 % supérieurs.
    const part = marks.waistY !== undefined && marks.waistY < maxY ? (maxY - marks.waistY) * 1.05 : height * 0.45;
    return { centerY: maxY - part / 2, height: part, width: Math.min(width, part * 1.2), margin: 1.08 };
  }
  return { centerY: minY + height / 2, height, width, margin: 1.08 };
}

/**
 * Place la caméra pour que la zone voulue tienne, centrée, dans la partie visible de l'écran.
 * `bottomInset` : part basse de l'écran (0 à 0,5) couverte par des commandes.
 */
export function computeFraming(
  bounds: Bounds,
  mode: FramingMode,
  fovDeg: number,
  aspect: number,
  bottomInset = 0,
  marks: Landmarks = {},
): Framing {
  const inset = Math.min(Math.max(bottomInset, 0), 0.5);
  const r = region(bounds, mode, marks);
  const tanV = Math.tan((fovDeg * Math.PI) / 360);
  const tanH = tanV * Math.max(aspect, 0.1);
  // Distance pour que la zone tienne dans la partie libre (verticalement) et dans la largeur de l'écran.
  const fit = Math.max(r.height / 2 / (1 - inset) / tanV, r.width / 2 / tanH) * r.margin;
  const depth = (bounds.max[2] - bounds.min[2]) / 2;
  const distance = fit + depth * (mode === 'body' ? 1 : 0.5);
  // Le centre de la partie libre est au-dessus du centre de l'écran : on vise d'autant plus bas.
  const halfHeight = distance * tanV;
  return { targetY: r.centerY - inset * halfHeight, distance };
}
