import { toLocal, type Wall } from './arena.js';
import { lerp, segmentBox } from './math.js';
import type { Vec3 } from './types.js';

/** All ray consumers use the same oriented collision box, never its world AABB. */
export function wallSegment(a: Vec3, b: Vec3, wall: Wall, radius = 0) {
  const start = { ...toLocal(a.x, a.z, wall), y: a.y }, end = { ...toLocal(b.x, b.z, wall), y: b.y };
  const min = { x: -wall.width / 2 - radius, y: (wall.base ?? 0) - radius, z: -wall.depth / 2 - radius };
  const max = { x: wall.width / 2 + radius, y: (wall.base ?? 0) + wall.height + radius, z: wall.depth / 2 + radius };
  const time = segmentBox(start, end, min, max);
  if (time === null) return null;
  const point = { x: lerp(start.x, end.x, time), y: lerp(start.y, end.y, time), z: lerp(start.z, end.z, time) };
  let nearest = Infinity;
  const normal = { x: 0, y: 0, z: 0 };
  for (const axis of ['x', 'y', 'z'] as const) for (const sign of [-1, 1]) {
    const gap = Math.abs(point[axis] - (sign < 0 ? min[axis] : max[axis]));
    if (gap < nearest) { nearest = gap; normal.x = normal.y = normal.z = 0; normal[axis] = sign; }
  }
  const c = Math.cos(wall.yaw ?? 0), s = Math.sin(wall.yaw ?? 0), x = normal.x;
  normal.x = x * c + normal.z * s; normal.z = -x * s + normal.z * c;
  return { time, normal };
}
