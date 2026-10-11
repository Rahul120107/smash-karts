import { groundHeight, WALLS } from '../../../shared/src/arena.js';
import { lerp, segmentBox } from '../../../shared/src/math.js';
import type { Vec3 } from '../../../shared/src/types.js';

export function wallHit(a: Vec3, b: Vec3, radius = 0): number | null {
  let first: number | null = null;
  for (const w of WALLS) {
    const t = segmentBox(a, b,
      { x: w.x - w.width / 2 - radius, y: -radius, z: w.z - w.depth / 2 - radius },
      { x: w.x + w.width / 2 + radius, y: w.height + radius, z: w.z + w.depth / 2 + radius });
    if (t !== null && (first === null || t < first)) first = t;
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
