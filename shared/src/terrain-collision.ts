import { groundHeight } from './arena.js';
import { lerp } from './math.js';
import type { Vec3 } from './types.js';

/** Shared first crossing of the arena heightfield, including steep platform faces. */
export function terrainHit(a: Vec3, b: Vec3, radius: number): number | null {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / .2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (lerp(a.y, b.y, t) - radius > groundHeight(lerp(a.x, b.x, t), lerp(a.z, b.z, t))) continue;
    if (!i) return 0;
    let low = (i - 1) / steps, high = t;
    for (let j = 0; j < 12; j++) {
      const mid = (low + high) / 2;
      if (lerp(a.y, b.y, mid) - radius <= groundHeight(lerp(a.x, b.x, mid), lerp(a.z, b.z, mid))) high = mid;
      else low = mid;
    }
    return high;
  }
  return null;
}

export function terrainNormal(x: number, z: number): Vec3 {
  const epsilon = .025;
  const dx = (groundHeight(x + epsilon, z) - groundHeight(x - epsilon, z)) / (2 * epsilon);
  const dz = (groundHeight(x, z + epsilon) - groundHeight(x, z - epsilon)) / (2 * epsilon);
  const length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}
