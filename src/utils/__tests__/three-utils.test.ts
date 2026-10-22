import { computeFraming } from '@/utils/framing';
import { decodeUtf8 } from '@/utils/utf8';

describe('decodeUtf8', () => {
  it('décode ASCII, accents, symboles et emoji', () => {
    const text = 'glTF Clavicule — Moogle ♀ 🐉';
    expect(decodeUtf8(new TextEncoder().encode(text))).toBe(text);
  });
});

describe('computeFraming', () => {
  const bounds = { min: [-0.3, 0, -0.2] as [number, number, number], max: [0.3, 1.7, 0.2] as [number, number, number] };

  it('vise le milieu du corps et recule assez pour tout voir', () => {
    const f = computeFraming(bounds, 'body', 30, 0.8);
    expect(f.targetY).toBeCloseTo(0.85);
    // La moitié de la hauteur doit tenir dans la moitié du champ vertical.
    expect(Math.tan((15 * Math.PI) / 180) * (f.distance - 0.2)).toBeGreaterThanOrEqual(0.85);
  });

  it('cadre le buste entre le corps et le visage', () => {
    const body = computeFraming(bounds, 'body', 30, 0.8);
    const bust = computeFraming(bounds, 'bust', 30, 0.8);
    const face = computeFraming(bounds, 'face', 30, 0.8);
    expect(bust.distance).toBeLessThan(body.distance);
    expect(bust.distance).toBeGreaterThan(face.distance);
    expect(bust.targetY).toBeGreaterThan(body.targetY);
  });

  it('cadre le visage plus près et plus haut', () => {
    const body = computeFraming(bounds, 'body', 30, 0.8);
    const face = computeFraming(bounds, 'face', 30, 0.8);
    expect(face.targetY).toBeGreaterThan(1.4);
    expect(face.distance).toBeLessThan(body.distance / 2);
  });

  it('laisse libre le bas de l’image pour le texte', () => {
    const plain = computeFraming(bounds, 'body', 30, 0.8);
    const inset = computeFraming(bounds, 'body', 30, 0.8, 0.25);
    expect(inset.targetY).toBeLessThan(plain.targetY);
    expect(inset.distance).toBeGreaterThan(plain.distance);
    // Le bas du champ descend sous les pieds d'un quart de la zone visible.
    const half = Math.tan((15 * Math.PI) / 180) * (inset.distance - 0.2);
    expect(inset.targetY - half).toBeLessThan(-0.25 * 1.7 * 0.9);
  });

  it('recule davantage sur un écran étroit pour un modèle large', () => {
    const wide = { min: [-1, 0, -0.2] as [number, number, number], max: [1, 1.7, 0.2] as [number, number, number] };
    expect(computeFraming(wide, 'body', 30, 0.5).distance).toBeGreaterThan(computeFraming(wide, 'body', 30, 2).distance);
  });
});
