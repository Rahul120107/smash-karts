import type { Vec3 } from './types.js';
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
export const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
/** Earliest segment/sphere time, including initial overlap, to prevent tunneling. */
export function segmentSphere(a: Vec3, b: Vec3, c: Vec3, radius: number): number | null {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const ox = a.x - c.x, oy = a.y - c.y, oz = a.z - c.z;
  const qa = dx * dx + dy * dy + dz * dz;
  const qc = ox * ox + oy * oy + oz * oz - radius * radius;
  if (qc <= 0) return 0;
  if (qa < 1e-12) return null;
  const qb = 2 * (ox * dx + oy * dy + oz * dz), disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const t = (-qb - Math.sqrt(disc)) / (2 * qa);
  return t >= 0 && t <= 1 ? t : null;
}
export function segmentBox(a: Vec3, b: Vec3, min: Vec3, max: Vec3): number | null {
  let near = 0, far = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-10) { if (a[axis] < min[axis] || a[axis] > max[axis]) return null; }
    else {
      const t1 = (min[axis] - a[axis]) / d, t2 = (max[axis] - a[axis]) / d;
      near = Math.max(near, Math.min(t1, t2)); far = Math.min(far, Math.max(t1, t2));
      if (near > far) return null;
    }
  }
  return near;
}
