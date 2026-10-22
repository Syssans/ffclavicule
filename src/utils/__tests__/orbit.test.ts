import { OrbitState, PITCH_RANGE, ZOOM_RANGE } from '@/utils/orbit';

describe('OrbitState', () => {
  it('tourne seul, sauf pendant un geste', () => {
    const o = new OrbitState();
    o.tick(1);
    expect(o.yaw).toBeCloseTo(0.35);
    o.grab();
    o.tick(1);
    expect(o.yaw).toBeCloseTo(0.35);
  });

  it('suit le doigt et borne l’inclinaison', () => {
    const o = new OrbitState();
    o.grab();
    o.drag(100, 0);
    expect(o.yaw).toBeCloseTo(1.2);
    o.drag(0, 10_000);
    expect(o.pitch).toBe(PITCH_RANGE.max);
    o.drag(0, -10_000);
    expect(o.pitch).toBe(PITCH_RANGE.min);
  });

  it('zoome au pincement et à la molette, dans les limites', () => {
    const o = new OrbitState();
    o.grab();
    o.pinch(2);
    expect(o.zoom).toBeCloseTo(0.5);
    o.pinch(100);
    expect(o.zoom).toBe(ZOOM_RANGE.min);
    o.release();
    o.wheel(100_000);
    expect(o.zoom).toBe(ZOOM_RANGE.max);
    o.reset();
    expect(o.zoom).toBe(1);
  });

  it('garde un élan après un lancer, qui s’amortit', () => {
    const o = new OrbitState();
    o.setAutoRotate(false);
    o.grab();
    o.release(1); // 1 px/ms
    o.tick(0.1);
    const first = o.yaw;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) o.tick(0.1);
    const settled = o.yaw;
    o.tick(1);
    expect(o.yaw).toBeCloseTo(settled, 2);
  });
});
