import { groundHeight, WALLS } from '../../../shared/src/arena.js';
import { lerp, segmentBox } from '../../../shared/src/math.js';
import type { Vec3 } from '../../../shared/src/types.js';

export function wallHit(a: Vec3, b: Vec3, radius = 0): number | null {
  let first: number | null = null;
  for (const w of WALLS) {
    const t = segmentBox(a, b,
      { x: w.x - w.width / 2 - radius, y: (w.base ?? 0) - radius, z: w.z - w.depth / 2 - radius },
      { x: w.x + w.width / 2 + radius, y: (w.base ?? 0) + w.height + radius, z: w.z + w.depth / 2 + radius });
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}
/** Contact normal is needed for lobbed explosives to bounce off the struck face. */
export function wallContact(a: Vec3, b: Vec3, radius: number): { time: number; normal: Vec3 } | null {
  let first: { time: number; normal: Vec3 } | null = null;
  for (const w of WALLS) {
    const min = { x: w.x - w.width / 2 - radius, y: (w.base ?? 0) - radius, z: w.z - w.depth / 2 - radius };
    const max = { x: w.x + w.width / 2 + radius, y: (w.base ?? 0) + w.height + radius, z: w.z + w.depth / 2 + radius };
    const time = segmentBox(a, b, min, max);
    if (time === null || first && time >= first.time) continue;
    const point = { x: lerp(a.x, b.x, time), y: lerp(a.y, b.y, time), z: lerp(a.z, b.z, time) };
    let nearest = Infinity;
    const normal = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
      const gap = Math.abs(point[axis] - (sign === -1 ? min[axis] : max[axis]));
      if (gap < nearest) { nearest = gap; normal.x = normal.y = normal.z = 0; normal[axis] = sign; }
    }
    const toward = (b.x - a.x) * normal.x + (b.y - a.y) * normal.y + (b.z - a.z) * normal.z;
    if (time < 1e-8 && toward >= 0) continue;
    first = { time, normal };
  }
  return first;
}
export function terrainHit(a: Vec3, b: Vec3, radius: number): number | null {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), z = lerp(a.z, b.z, t);
    if (y - radius <= groundHeight(x, z)) return t;
  }
  return null;
}
