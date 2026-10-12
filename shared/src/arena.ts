import type { Vec3 } from './types.js';
/** Dimensions are collision dimensions; yaw rotates around +Y, matching Three.js. */
export interface Wall { x: number; z: number; width: number; depth: number; height: number; base?: number; yaw?: number; color?: number; style?: 'barrier' | 'boundary' | 'rail' | 'tunnel' }
export interface Ramp { x: number; z: number; width: number; depth: number; height: number; plateau?: number; endWidth?: number; yaw?: number; color?: number }
export const ARENA_SIZE = 112;
export const CORNER_RADIUS = 12;
export const LAVA = { x: 0, z: 0, width: 16, depth: 16, surface: -.9, bottom: -1.2, curb: 1.2, curbHeight: .12 } as const;
export const BARRIER_COLORS = { purple: 0x8f22d5, yellow: 0xffd82a, red: 0xf34849, blue: 0x3869ef, green: 0x34df49 } as const;
export const QUADRANTS = [
  { sx: -1, sz: -1, color: BARRIER_COLORS.yellow }, { sx: 1, sz: -1, color: BARRIER_COLORS.red },
  { sx: -1, sz: 1, color: BARRIER_COLORS.blue }, { sx: 1, sz: 1, color: BARRIER_COLORS.green },
] as const;
const boundary: Wall[] = [
  ...[-1, 1].flatMap(s => [
    { x: s * 56, z: 0, width: 2, depth: 88, height: 1.8, color: BARRIER_COLORS.purple, style: 'boundary' as const },
    { x: 0, z: s * 56, width: 88, depth: 2, height: 1.8, color: BARRIER_COLORS.purple, style: 'boundary' as const },
  ]),
];
// Six tangent chords per rounded corner. Identical visible and authoritative OBBs.
for (const q of QUADRANTS) for (let i = 0; i < 6; i++) {
  const a = i * Math.PI / 12, b = (i + 1) * Math.PI / 12;
  const x0 = q.sx * (44 + 12 * Math.cos(a)), z0 = q.sz * (44 + 12 * Math.sin(a));
  const x1 = q.sx * (44 + 12 * Math.cos(b)), z1 = q.sz * (44 + 12 * Math.sin(b));
  boundary.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, width: 2, depth: Math.hypot(x1 - x0, z1 - z0) + .12,
    yaw: Math.atan2(x1 - x0, z1 - z0), height: 1.8, color: BARRIER_COLORS.purple, style: 'boundary' });
}
export const RAMPS: Ramp[] = [
  { x: -40, z: 0, width: 10, depth: 48, height: 1.2, plateau: 26, endWidth: 6 },
  { x: 40, z: 0, width: 10, depth: 48, height: 1.2, plateau: 26, endWidth: 6 },
  { x: 0, z: -40, width: 10, depth: 48, height: 1.2, plateau: 26, endWidth: 6, yaw: Math.PI / 2 },
  { x: 0, z: 40, width: 10, depth: 48, height: 1.2, plateau: 26, endWidth: 6, yaw: Math.PI / 2 },
  ...QUADRANTS.map(q => ({ x: q.sx * 40, z: q.sz * 40, width: 8, depth: 12, height: 1.2, plateau: 8, endWidth: 4, color: q.color })),
];
export const PLATFORMS = RAMPS.slice(0, 4);
// Two open portals cover existing elevated routes. The roof is a true overhead
// collider, leaving four meters of driving clearance and every pickup accessible.
export const TUNNELS: Wall[] = [-1, 1].flatMap(side => [
  { x: side * 40, z: 8, width: 9, depth: 10, base: 5.2, height: .6, color: 0x33495c, style: 'tunnel' },
  ...[-1, 1].map(edge => ({ x: side * 40 + edge * 4.3, z: 8, width: .65, depth: 10, base: 1.2, height: 4, color: 0x33495c, style: 'tunnel' as const })),
]);
export const WALLS: Wall[] = [ ...boundary,
  ...TUNNELS,
  ...QUADRANTS.flatMap(q => [
    { x: q.sx * 14, z: q.sz * 22, width: 16, depth: 1.2, height: 1.2, color: q.color, style: 'barrier' as const },
    { x: q.sx * 24, z: q.sz * 13, width: 1.2, depth: 14, height: 1.2, color: q.color, style: 'barrier' as const },
    { x: q.sx * 23, z: q.sz * 21, width: 1.2, depth: Math.SQRT2 * 2, yaw: Math.atan2(q.sx, -q.sz), height: 1.2, color: q.color, style: 'barrier' as const },
  ]),
  ...PLATFORMS.flatMap(r => [-1, 1].map(side => {
    const x = side * (r.width / 2 - .5), c = Math.cos(r.yaw ?? 0), s = Math.sin(r.yaw ?? 0);
    return { x: r.x + x * c, z: r.z - x * s, width: 1, depth: r.plateau!, base: r.height, height: 1.1,
      yaw: r.yaw, color: BARRIER_COLORS.purple, style: 'rail' as const };
  })),
  // Angled shoulders continue the raised routes' purple outline, leaving both mouths open.
  ...PLATFORMS.flatMap(r => [-1, 1].flatMap(side => [-1, 1].map(end => {
    const a = toWorld(side * 4.5, end * 13, r), b = toWorld(side * 2.8, end * 22, r);
    return { x: (a.x+b.x)/2, z: (a.z+b.z)/2, width: .9, depth: Math.hypot(b.x-a.x,b.z-a.z),
      yaw: Math.atan2(b.x-a.x,b.z-a.z), height: 2.3, color: BARRIER_COLORS.purple, style: 'rail' as const };
  }))),
];
export function toLocal(x: number, z: number, object: { x: number; z: number; yaw?: number }) {
  const c = Math.cos(object.yaw ?? 0), s = Math.sin(object.yaw ?? 0), dx = x - object.x, dz = z - object.z;
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}
export function toWorld(x: number, z: number, object: { x: number; z: number; yaw?: number }) {
  const c = Math.cos(object.yaw ?? 0), s = Math.sin(object.yaw ?? 0);
  return { x: object.x + x * c + z * s, z: object.z - x * s + z * c };
}
/** z is world Z for unrotated ramps; for rotated ramps callers pass local Z + r.z. */
export function rampHeight(r: Ramp, z: number): number {
  return r.height * Math.max(0, Math.min(1, (r.depth / 2 - Math.abs(z - r.z)) / (r.depth / 2 - (r.plateau ?? 0) / 2)));
}
export function rampProfile(r: Ramp): [number, number][] {
  return [[r.z - r.depth / 2, 0], [r.z - (r.plateau ?? 0) / 2, r.height],
    [r.z + (r.plateau ?? 0) / 2, r.height], [r.z + r.depth / 2, 0]];
}
export function rampHalfWidth(r: Ramp, localZ: number): number {
  const plateau=(r.plateau??0)/2, run=r.depth/2-plateau;
  const taper=Math.max(0,Math.min(1,(Math.abs(localZ)-plateau)/run));
  return (r.width + ((r.endWidth??r.width)-r.width)*taper)/2;
}
export function insideLava(x: number, z: number): boolean { return Math.abs(x - LAVA.x) < LAVA.width / 2 && Math.abs(z - LAVA.z) < LAVA.depth / 2; }
export function groundHeight(x: number, z: number): number {
  if (insideLava(x, z)) return LAVA.bottom;
  let height = Math.abs(x) < LAVA.width/2 + LAVA.curb && Math.abs(z) < LAVA.depth/2 + LAVA.curb ? LAVA.curbHeight : 0;
  for (const r of RAMPS) {
    const p = toLocal(x, z, r);
    if (Math.abs(p.x) < rampHalfWidth(r,p.z) && Math.abs(p.z) < r.depth / 2) height = Math.max(height, rampHeight(r, p.z + r.z));
  }
  return height;
}
/** Hard arena envelope also contains a kart that jumps above the perimeter walls. */
export function arenaClamp(x: number, z: number, margin: number) {
  const core = ARENA_SIZE / 2 - CORNER_RADIUS, radius = CORNER_RADIUS - margin;
  const cx = Math.max(-core, Math.min(core, x)), cz = Math.max(-core, Math.min(core, z));
  const dx = x - cx, dz = z - cz, length = Math.hypot(dx, dz);
  return length > radius ? { x: cx + dx / length * radius, z: cz + dz / length * radius } : { x, z };
}
export const SPAWNS = [
  { x: -4, z: 27, yaw: -Math.PI / 2 }, { x: 4, z: -27, yaw: Math.PI / 2 },
  { x: -29, z: -22, yaw: 0 }, { x: 29, z: 22, yaw: Math.PI },
  { x: 4, z: 27, yaw: Math.PI / 2 }, { x: -4, z: -27, yaw: -Math.PI / 2 },
  { x: -29, z: 22, yaw: Math.PI }, { x: 29, z: -22, yaw: 0 },
];
export const PICKUP_POSITIONS: Vec3[] = [
  { x: -12, y: 0, z: 27 }, { x: 12, y: 0, z: -27 }, { x: 12, y: 0, z: 27 }, { x: -12, y: 0, z: -27 },
  { x: -16, y: 0, z: 0 }, { x: 16, y: 0, z: 0 }, { x: 0, y: 0, z: -16 }, { x: 0, y: 0, z: 16 },
  ...QUADRANTS.flatMap(q => [{ x: q.sx * 29, y: 0, z: q.sz * 18 }, { x: q.sx * 18, y: 0, z: q.sz * 29 },
    { x: q.sx * 49, y: 0, z: q.sz * 30 }, { x: q.sx * 30, y: 0, z: q.sz * 49 }]),
  ...PLATFORMS.map(r => ({ x: r.x, y: r.height, z: r.z })),
];
export const CROSSINGS = QUADRANTS.flatMap(q => [
  { x: q.sx * 14, z: q.sz * 29, width: 10, depth: 7, yaw: 0 },
  { x: q.sx * 29, z: q.sz * 14, width: 10, depth: 7, yaw: Math.PI / 2 },
]);
