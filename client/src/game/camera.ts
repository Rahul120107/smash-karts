import { groundHeight, WALLS } from '../../../shared/src/arena.js';
import { distance, lerp, segmentBox } from '../../../shared/src/math.js';
import type { Vec3 } from '../../../shared/src/types.js';

/** Anchor stays above the kart, outside obstacles, even when the aiming point would enter a wall. */
export function clipCameraRay(anchor: Vec3, desired: Vec3): Vec3 {
  let fraction = 1;
  for (const w of WALLS) {
    const hit = segmentBox(anchor, desired, { x: w.x - w.width / 2 - 0.3, y: (w.base ?? 0) - 0.3, z: w.z - w.depth / 2 - 0.3 },
      { x: w.x + w.width / 2 + 0.3, y: (w.base ?? 0) + w.height + 0.3, z: w.z + w.depth / 2 + 0.3 });
    if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 0.05 / Math.max(0.001, distance(anchor, desired))));
  }
  // Hilltops and bridge approaches also clip the camera, using the authoritative heightfield.
  const length = distance(anchor, desired), steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps; if (t >= fraction) break;
    if (lerp(anchor.y, desired.y, t) <= groundHeight(lerp(anchor.x, desired.x, t), lerp(anchor.z, desired.z, t)) + 0.3) { fraction = Math.max(0, (i - 1) / steps); break; }
  }
  return { x: lerp(anchor.x, desired.x, fraction), y: lerp(anchor.y, desired.y, fraction), z: lerp(anchor.z, desired.z, fraction) };
}
