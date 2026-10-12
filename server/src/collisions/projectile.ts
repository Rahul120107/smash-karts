import { wallsAlong } from '../../../shared/src/arena.js';
export { terrainHit } from '../../../shared/src/terrain-collision.js';
import { wallSegment } from '../../../shared/src/wall-collision.js';
import type { Vec3 } from '../../../shared/src/types.js';

export function wallHit(a: Vec3, b: Vec3, radius = 0): number | null {
  let first: number | null = null;
  for (const w of wallsAlong(a,b,radius)) {
    const t = wallSegment(a, b, w, radius)?.time ?? null;
    if (t !== null && (first === null || t < first)) first = t;
  }
  return first;
}
/** Contact normal is needed for lobbed explosives to bounce off the struck face. */
export function wallContact(a: Vec3, b: Vec3, radius: number): { time: number; normal: Vec3 } | null {
  let first: { time: number; normal: Vec3 } | null = null;
  for (const w of wallsAlong(a,b,radius)) {
    const contact = wallSegment(a, b, w, radius);
    if (!contact || first && contact.time >= first.time) continue;
    const { time, normal } = contact;
    const toward = (b.x - a.x) * normal.x + (b.y - a.y) * normal.y + (b.z - a.z) * normal.z;
    if (time < 1e-8 && toward >= 0) continue;
    first = { time, normal };
  }
  return first;
}
