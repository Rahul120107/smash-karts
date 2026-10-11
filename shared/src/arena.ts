import type { Vec3 } from './types.js';
export interface Wall { x: number; z: number; width: number; depth: number; height: number; style?: 'rock' | 'barrier' }
export interface Ramp { x: number; z: number; width: number; depth: number; height: number; plateau?: number }
export const ARENA_SIZE = 112;
export const WALLS: Wall[] = [
  { x: -56, z: 0, width: 2, depth: 114, height: 4 }, { x: 56, z: 0, width: 2, depth: 114, height: 4 },
  { x: 0, z: -56, width: 114, depth: 2, height: 4 }, { x: 0, z: 56, width: 114, depth: 2, height: 4 },
  { x: -14, z: -13, width: 8, depth: 4, height: 3 }, { x: 14, z: 13, width: 8, depth: 4, height: 3 },
  { x: -15, z: 16, width: 4, depth: 7, height: 2.8 }, { x: 15, z: -16, width: 4, depth: 7, height: 2.8 },
  { x: 0, z: 0, width: 5, depth: 5, height: 3.8 },
  { x: -40, z: -30, width: 6, depth: 5, height: 2.4, style: 'rock' },
  { x: 40, z: 30, width: 6, depth: 5, height: 2.4, style: 'rock' },
  { x: -42, z: 30, width: 5, depth: 4, height: 2, style: 'rock' },
  { x: 42, z: -30, width: 5, depth: 4, height: 2, style: 'rock' },
  { x: -16, z: -39, width: 8, depth: 2, height: 1.5, style: 'barrier' },
  { x: 16, z: 39, width: 8, depth: 2, height: 1.5, style: 'barrier' },
];
// Symmetric triangular ramps are a shared heightfield; slopes launch karts at speed.
export const RAMPS: Ramp[] = [
  { x: -23, z: 0, width: 7, depth: 18, height: 2.6 },
  { x: 23, z: 0, width: 7, depth: 18, height: 2.6 },
  { x: -41, z: 0, width: 8, depth: 24, height: 3 },
  { x: 41, z: 0, width: 8, depth: 24, height: 3 },
  { x: 0, z: 41, width: 14, depth: 22, height: 2.8, plateau: 6 },
];
export function rampHeight(r: Ramp, z: number): number {
  return r.height * Math.max(0, Math.min(1, (r.depth / 2 - Math.abs(z - r.z)) / (r.depth / 2 - (r.plateau ?? 0) / 2)));
}
export function rampProfile(r: Ramp): [number, number][] {
  return [[r.z - r.depth / 2, 0], [r.z - (r.plateau ?? 0) / 2, r.height],
    [r.z + (r.plateau ?? 0) / 2, r.height], [r.z + r.depth / 2, 0]];
}
export function groundHeight(x: number, z: number): number {
  let height = 0;
  for (const r of RAMPS) if (Math.abs(x - r.x) < r.width / 2 && Math.abs(z - r.z) < r.depth / 2) {
    height = Math.max(height, rampHeight(r, z));
  }
  return height;
}
export const SPAWNS = [
  { x: -8, z: 27, yaw: Math.PI }, { x: 8, z: -27, yaw: 0 },
  { x: -27, z: -22, yaw: Math.PI / 2 }, { x: 27, z: 22, yaw: -Math.PI / 2 },
  { x: 8, z: 27, yaw: Math.PI }, { x: -8, z: -27, yaw: 0 },
  { x: -27, z: 22, yaw: Math.PI / 2 }, { x: 27, z: -22, yaw: -Math.PI / 2 },
  { x: -46, z: -44, yaw: Math.PI / 4 }, { x: 46, z: 44, yaw: -3 * Math.PI / 4 },
  { x: -46, z: 44, yaw: 3 * Math.PI / 4 }, { x: 46, z: -44, yaw: -Math.PI / 4 },
];
export const PICKUP_POSITIONS: Vec3[] = [
  { x: -8, y: 0, z: 18 }, { x: 8, y: 0, z: -18 }, { x: 8, y: 0, z: 18 }, { x: -8, y: 0, z: -18 },
  { x: -27, y: 0, z: 14 }, { x: 27, y: 0, z: -14 }, { x: -27, y: 0, z: -14 }, { x: 27, y: 0, z: 14 },
  { x: -10, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 0, y: 0, z: -9 }, { x: 0, y: 0, z: 9 },
  { x: -23, y: 2.6, z: 0 }, { x: 23, y: 2.6, z: 0 },
  { x: -41, y: 3, z: 0 }, { x: 41, y: 3, z: 0 }, { x: 0, y: 2.8, z: 41 },
  { x: -24, y: 0, z: 40 }, { x: 24, y: 0, z: -40 },
  { x: -24, y: 0, z: -40 }, { x: 24, y: 0, z: 40 },
  { x: -45, y: 0, z: 20 }, { x: 45, y: 0, z: -20 },
  { x: -45, y: 0, z: -20 }, { x: 45, y: 0, z: 20 },
  { x: -40, y: 0, z: 44 }, { x: 40, y: 0, z: -44 },
  { x: -40, y: 0, z: -44 }, { x: 40, y: 0, z: 44 },
  { x: 0, y: 0, z: -43 },
];
