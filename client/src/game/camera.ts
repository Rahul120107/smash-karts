import { WALLS } from '../../../shared/src/arena.js';
import { distance, lerp, segmentBox } from '../../../shared/src/math.js';
import type { Vec3 } from '../../../shared/src/types.js';

/** Anchor stays above the kart, outside obstacles, even when the aiming point would enter a wall. */
export function clipCameraRay(anchor: Vec3, desired: Vec3): Vec3 {
  let fraction = 1;
  for (const w of WALLS) {
    const hit = segmentBox(anchor, desired, { x: w.x - w.width / 2 - 0.3, y: -1, z: w.z - w.depth / 2 - 0.3 },
      { x: w.x + w.width / 2 + 0.3, y: w.height + 0.3, z: w.z + w.depth / 2 + 0.3 });
    if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 0.05 / Math.max(0.001, distance(anchor, desired))));
  }
  return { x: lerp(anchor.x, desired.x, fraction), y: lerp(anchor.y, desired.y, fraction), z: lerp(anchor.z, desired.z, fraction) };
}
