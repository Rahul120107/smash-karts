import type { KartState, Vec3, WeaponId } from './types.js';

// Local mounts also position the client barrels. +Z is the kart's forward direction.
export const GUN_MOUNT = { x: .48, y: .95, z: .55, length: .68 };
export const CANNON_MOUNT = { x: 0, y: .94, z: .35, length: .81 };
export function weaponPivot(kart: KartState, weapon: WeaponId): Vec3 {
  const mount = weapon === 'machineGun' || weapon === 'bullets' ? GUN_MOUNT : weapon === 'cannon' ? CANNON_MOUNT : { x: 0, y: .85, z: 0 };
  const s = Math.sin(kart.yaw), c = Math.cos(kart.yaw);
  return { x: kart.x + mount.x * c + mount.z * s, y: kart.y + mount.y, z: kart.z + mount.z * c - mount.x * s };
}
export function weaponMuzzle(kart: KartState, weapon: WeaponId, direction: Vec3): Vec3 {
  const pivot = weaponPivot(kart, weapon);
  const length = weapon === 'machineGun' || weapon === 'bullets' ? GUN_MOUNT.length : weapon === 'cannon' ? CANNON_MOUNT.length : weapon === 'mine' ? -1.8 : 1.35;
  return { x: pivot.x + direction.x * length, y: pivot.y + direction.y * length, z: pivot.z + direction.z * length };
}

/** Exact constant-gravity position over a fixed tick; shared with visual extrapolation. */
export function ballisticPosition(p: Vec3 & { vx: number; vy: number; vz: number }, seconds: number, gravity: number): Vec3 {
  return { x: p.x + p.vx * seconds, y: p.y + p.vy * seconds - .5 * gravity * seconds * seconds, z: p.z + p.vz * seconds };
}
