import type { GameEvent, KartState, Vec3, WeaponId } from './types.js';
import { WEAPONS } from './weapons.js';

// Local mounts also position the client barrels. +Z is the kart's forward direction.
export const GUN_MOUNT = { x: .48, y: .95, z: 1, length: .68 };
export const CANNON_MOUNT = { x: 0, y: .94, z: .95, length: .81 };
export const ROCKET_MOUNT = { x: -.42, y: 1.05, z: .65, length: 1.25 };
export const WEAPON_MOUNTS: Record<WeaponId, typeof GUN_MOUNT> = {
  machineGun: GUN_MOUNT, bullets: GUN_MOUNT, cannon: CANNON_MOUNT,
  rocket: ROCKET_MOUNT, homing: ROCKET_MOUNT, blastMissile: ROCKET_MOUNT,
  scatter: GUN_MOUNT, bomb: { x: 0, y: 1.35, z: .9, length: .75 },
  mine: { x: 0, y: .6, z: -1.8, length: 0 },
  fakeLootBox: { x:0,y:.6,z:-1.8,length:0 },
  shield: { x: 0, y: .85, z: 0, length: 0 }, boost: { x: 0, y: .85, z: 0, length: 0 }, orbit: { x: 0, y: .85, z: 0, length: 0 },
};
export function weaponPivot(kart: KartState, weapon: WeaponId): Vec3 {
  const mount = WEAPON_MOUNTS[weapon];
  const s = Math.sin(kart.yaw), c = Math.cos(kart.yaw);
  return { x: kart.x + mount.x * c + mount.z * s, y: kart.y + mount.y, z: kart.z + mount.z * c - mount.x * s };
}
export function weaponMuzzle(kart: KartState, weapon: WeaponId, direction: Vec3): Vec3 {
  const pivot = weaponPivot(kart, weapon);
  const length = WEAPON_MOUNTS[weapon].length;
  return { x: pivot.x + direction.x * length, y: pivot.y + direction.y * length, z: pivot.z + direction.z * length };
}

export function launchDirection(yaw: number, elevation = 0): Vec3 {
  return { x: Math.sin(yaw) * Math.cos(elevation), y: Math.sin(elevation), z: Math.cos(yaw) * Math.cos(elevation) };
}

/** All previews and authoritative lobbers use the same server-normalized charge. */
export function launchProfile(weapon:WeaponId,charge=0) {
  const w=WEAPONS[weapon],ratio=Math.max(0,Math.min(1,Number.isFinite(charge)?charge:0));
  const speed=w.charge?w.charge.minSpeed+(w.charge.maxSpeed-w.charge.minSpeed)*ratio:w.speed;
  const elevation=w.charge?.elevation??w.elevation??Math.atan2(w.launchVelocityY??0,speed||1);
  return {speed,elevation,vertical:w.charge?Math.tan(elevation)*speed:w.launchVelocityY??Math.sin(elevation)*speed};
}

/** Rebase only the flash attachment, never an authoritative projectile or hit. */
export function presentedMuzzle(event: GameEvent, authoritative: KartState, rendered: KartState): Vec3 {
  const yaw = rendered.yaw - authoritative.yaw, s = Math.sin(yaw), c = Math.cos(yaw);
  const x = event.x - authoritative.x, z = event.z - authoritative.z;
  return { x: rendered.x + x * c + z * s, y: rendered.y + event.y - authoritative.y, z: rendered.z + z * c - x * s };
}

/** Exact constant-gravity position over a fixed tick; shared with visual extrapolation. */
export function ballisticPosition(p: Vec3 & { vx: number; vy: number; vz: number }, seconds: number, gravity: number): Vec3 {
  return { x: p.x + p.vx * seconds, y: p.y + p.vy * seconds - .5 * gravity * seconds * seconds, z: p.z + p.vz * seconds };
}
