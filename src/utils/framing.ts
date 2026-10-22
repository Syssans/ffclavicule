/** Cadrage de la caméra autour d'un personnage (boîte englobante, axe Y vers le haut). */

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface Framing {
  /** Hauteur visée par la caméra. */
  targetY: number;
  /** Distance de la caméra à l'axe de rotation. */
  distance: number;
}

export type FramingMode = 'body' | 'bust' | 'face';

/** Distance pour qu'une zone de `height` x `width` tienne dans le champ (fov vertical en degrés). */
function fit(height: number, width: number, fovDeg: number, aspect: number, margin: number): number {
  const v = Math.tan((fovDeg * Math.PI) / 360);
  const h = v * Math.max(aspect, 0.1);
  return Math.max(height / 2 / v, width / 2 / h) * margin;
}

/**
 * `bottomInset` : part basse de l'image (0 à 0,5) laissée libre pour le texte posé par-dessus.
 */
export function computeFraming(bounds: Bounds, mode: FramingMode, fovDeg: number, aspect: number, bottomInset = 0): Framing {
  const inset = Math.min(Math.max(bottomInset, 0), 0.5);
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  const height = Math.max(maxY - minY, 1e-3);
  const width = Math.max(maxX - minX, maxZ - minZ, 1e-3);
  const depth = (maxZ - minZ) / 2;
  if (mode === 'bust') {
    // Tête et buste : environ les 45 % supérieurs.
    const part = height * 0.45;
    const zone = part / (1 - inset);
    return { targetY: maxY - zone / 2, distance: fit(zone, Math.min(width, part * 1.2), fovDeg, aspect, 1.08) + depth * 0.7 };
  }
  if (mode === 'face') {
    // La tête occupe environ le huitième supérieur d'un personnage debout.
    const head = height * 0.22;
    const zone = head / (1 - inset);
    const center = maxY - height * 0.1 - (zone - head) / 2;
    return { targetY: center, distance: fit(zone, zone, fovDeg, aspect, 1.1) + depth * 0.5 };
  }
  // Zone visée agrandie vers le bas pour que le personnage tienne au-dessus du texte.
  const zone = height / (1 - inset);
  return { targetY: maxY - zone / 2, distance: fit(zone, width, fovDeg, aspect, 1.08) + depth };
}
