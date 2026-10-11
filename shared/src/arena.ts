import type { Vec3 } from './types.js';
export interface Wall { x: number; z: number; width: number; depth: number; height: number }
export interface Ramp { x: number; z: number; width: number; depth: number; height: number }
export const ARENA_SIZE = 72;
export const WALLS: Wall[] = [
  { x: -36, z: 0, width: 2, depth: 74, height: 4 }, { x: 36, z: 0, width: 2, depth: 74, height: 4 },
  { x: 0, z: -36, width: 74, depth: 2, height: 4 }, { x: 0, z: 36, width: 74, depth: 2, height: 4 },
  { x: -14, z: -13, width: 8, depth: 4, height: 3 }, { x: 14, z: 13, width: 8, depth: 4, height: 3 },
  { x: -15, z: 16, width: 4, depth: 7, height: 2.8 }, { x: 15, z: -16, width: 4, depth: 7, height: 2.8 },
  { x: 0, z: 0, width: 5, depth: 5, height: 3.8 },
];
// Symmetric triangular ramps are a shared heightfield; slopes launch karts at speed.
export const RAMPS: Ramp[] = [
  { x: -23, z: 0, width: 7, depth: 18, height: 2.6 },
  { x: 23, z: 0, width: 7, depth: 18, height: 2.6 },
];
export function groundHeight(x: number, z: number): number {
  let height = 0;
  for (const r of RAMPS) if (Math.abs(x - r.x) < r.width / 2 && Math.abs(z - r.z) < r.depth / 2) {
    height = Math.max(height, r.height * (1 - Math.abs(z - r.z) / (r.depth / 2)));
  }
  return height;
}
export const SPAWNS = [
  { x: -8, z: 27, yaw: Math.PI }, { x: 8, z: -27, yaw: 0 },
  { x: -27, z: -22, yaw: Math.PI / 2 }, { x: 27, z: 22, yaw: -Math.PI / 2 },
  { x: 8, z: 27, yaw: Math.PI }, { x: -8, z: -27, yaw: 0 },
  { x: -27, z: 22, yaw: Math.PI / 2 }, { x: 27, z: -22, yaw: -Math.PI / 2 },
];
export const PICKUP_POSITIONS: Vec3[] = [
  { x: -8, y: 0, z: 18 }, { x: 8, y: 0, z: -18 }, { x: 8, y: 0, z: 18 }, { x: -8, y: 0, z: -18 },
  { x: -27, y: 0, z: 14 }, { x: 27, y: 0, z: -14 }, { x: -27, y: 0, z: -14 }, { x: 27, y: 0, z: 14 },
  { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: -9 }, { x: 0, y: 0, z: 9 },
  { x: -23, y: 2.6, z: 0 }, { x: 23, y: 2.6, z: 0 },
];
