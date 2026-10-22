/**
 * État de la caméra de la visionneuse : rotation du personnage, inclinaison, zoom.
 * Indépendant de three.js (testable) ; la scène le lit à chaque image.
 */

const AUTO_SPIN = 0.35; // radians par seconde
const YAW_PER_PIXEL = 0.012;
const PITCH_PER_PIXEL = 0.006;
export const PITCH_RANGE = { min: -0.35, max: 0.75 };
export const ZOOM_RANGE = { min: 0.35, max: 1.6 };
const DEFAULT_PITCH = 0.06;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class OrbitState {
  yaw = 0;
  pitch = DEFAULT_PITCH;
  zoom = 1;
  autoRotate = true;
  private velocity = 0;
  private dragging = false;
  private start = { yaw: 0, pitch: 0, zoom: 1 };

  grab() {
    this.dragging = true;
    this.velocity = 0;
    this.start = { yaw: this.yaw, pitch: this.pitch, zoom: this.zoom };
  }

  /** Glissement d'un doigt : horizontal = tourner, vertical = incliner (déplacement total depuis le début du geste). */
  drag(dx: number, dy: number) {
    this.yaw = this.start.yaw + dx * YAW_PER_PIXEL;
    this.pitch = clamp(this.start.pitch + dy * PITCH_PER_PIXEL, PITCH_RANGE.min, PITCH_RANGE.max);
  }

  /** Pincement : `scale` > 1 quand les doigts s'écartent (on s'approche). */
  pinch(scale: number) {
    if (!Number.isFinite(scale) || scale <= 0) return;
    this.zoom = clamp(this.start.zoom / scale, ZOOM_RANGE.min, ZOOM_RANGE.max);
  }

  /** Molette (web) : delta positif = on s'éloigne. */
  wheel(delta: number) {
    this.zoom = clamp(this.zoom * Math.exp(delta * 0.0015), ZOOM_RANGE.min, ZOOM_RANGE.max);
  }

  /** Fin du geste ; `vx` en pixels par milliseconde, pour l'élan. */
  release(vx = 0) {
    this.dragging = false;
    this.velocity = clamp(vx * 1000 * YAW_PER_PIXEL, -6, 6);
  }

  setAutoRotate(on: boolean) {
    this.autoRotate = on;
  }

  reset() {
    this.pitch = DEFAULT_PITCH;
    this.zoom = 1;
    this.velocity = 0;
  }

  /** Avance d'une image ; renvoie la rotation à appliquer au personnage. */
  tick(delta: number): number {
    if (!this.dragging) {
      if (Math.abs(this.velocity) > 0.01) {
        this.yaw += this.velocity * delta;
        this.velocity *= Math.exp(-delta * 3);
      } else if (this.autoRotate) {
        this.yaw += AUTO_SPIN * delta;
      }
    }
    return this.yaw;
  }
}
