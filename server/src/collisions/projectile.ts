import { groundHeight, WALLS } from '../../../shared/src/arena.js';
import { lerp } from '../../../shared/src/math.js';
import { wallSegment } from '../../../shared/src/wall-collision.js';
import type { Vec3 } from '../../../shared/src/types.js';

export function wallHit(a: Vec3, b: Vec3, radius = 0): number | null {
  let first: number | null = null;
  for (const w of WALLS) {
    const t = wallSegment(a, b, w, radius)?.time ?? null;
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}
/** Contact normal is needed for lobbed explosives to bounce off the struck face. */
export function wallContact(a: Vec3, b: Vec3, radius: number): { time: number; normal: Vec3 } | null {
  let first: { time: number; normal: Vec3 } | null = null;
  for (const w of WALLS) {
    const contact = wallSegment(a, b, w, radius);
    if (!contact || first && contact.time >= first.time) continue;
    const { time, normal } = contact;
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
    if (y - radius <= groundHeight(x, z)) {
      // Refine the first crossing, including vertical ramp faces. Returning the
      // first coarse sample can put an offset muzzle/explosion inside terrain.
      if (i === 0) return 0;
      let low = (i - 1) / steps, high = t;
      for (let j = 0; j < 12; j++) {
        const mid = (low + high) / 2;
        if (lerp(a.y, b.y, mid) - radius <= groundHeight(lerp(a.x, b.x, mid), lerp(a.z, b.z, mid))) high = mid;
        else low = mid;
      }
      return high;
    }
  }
  return null;
}
