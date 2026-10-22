/** Fonds et éclairages proposés dans la visionneuse 3D. */

export interface ViewerBackground {
  key: string;
  label: string;
  /** Dégradé vertical du fond, du haut vers le bas. */
  top: string;
  bottom: string;
  /** Éclairage assorti. */
  ambient: { sky: string; ground: string; intensity: number };
  key_: { color: string; intensity: number };
  rim: { color: string; intensity: number };
  /** Opacité de l'ombre au sol. */
  shadow: number;
}

export const VIEWER_BACKGROUNDS: ViewerBackground[] = [
  {
    key: 'nuit',
    label: 'Nuit',
    top: '#1B2235',
    bottom: '#070A12',
    ambient: { sky: '#DFE6FF', ground: '#2A2230', intensity: 1.4 },
    key_: { color: '#FFFFFF', intensity: 2.4 },
    rim: { color: '#9FB8FF', intensity: 1.6 },
    shadow: 0.55,
  },
  {
    key: 'studio',
    label: 'Studio',
    top: '#F4F1EA',
    bottom: '#C9C3B6',
    ambient: { sky: '#FFFFFF', ground: '#B8B0A0', intensity: 1.8 },
    key_: { color: '#FFFFFF', intensity: 2.2 },
    rim: { color: '#FFFFFF', intensity: 1.0 },
    shadow: 0.35,
  },
  {
    key: 'crepuscule',
    label: 'Soir',
    top: '#3B2A5C',
    bottom: '#E58A5A',
    ambient: { sky: '#FFD9C2', ground: '#4A2C48', intensity: 1.3 },
    key_: { color: '#FFC79A', intensity: 2.6 },
    rim: { color: '#B49CFF', intensity: 1.8 },
    shadow: 0.5,
  },
  {
    key: 'foret',
    label: 'Forêt',
    top: '#2F4A3A',
    bottom: '#0E1A14',
    ambient: { sky: '#E6F5D8', ground: '#1E2A1A', intensity: 1.4 },
    key_: { color: '#FFF4D6', intensity: 2.3 },
    rim: { color: '#A8E0B0', intensity: 1.4 },
    shadow: 0.55,
  },
  {
    key: 'givre',
    label: 'Givre',
    top: '#CFE3F2',
    bottom: '#6E8CA8',
    ambient: { sky: '#F0F8FF', ground: '#5A7088', intensity: 1.6 },
    key_: { color: '#FFFFFF', intensity: 2.2 },
    rim: { color: '#D8ECFF', intensity: 1.4 },
    shadow: 0.4,
  },
];

export function viewerBackground(key: string | undefined): ViewerBackground {
  return VIEWER_BACKGROUNDS.find((b) => b.key === key) ?? VIEWER_BACKGROUNDS[0];
}
