import { groundHeight } from '../../../shared/src/arena.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { PlayerState, Vec3, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { wallHit } from '../collisions/projectile.js';
import { machineGunAim } from '../../../shared/src/aim.js';
import type { Projectile } from '../../../shared/src/types.js';

type Handler = (world: CombatWorld, player: PlayerState, weapon: WeaponId) => Vec3 | void;
function launch(world: CombatWorld, p: PlayerState, weapon: WeaponId): Vec3 {
  const w = WEAPONS[weapon];
  let muzzle: Vec3 = { x: p.x, y: p.y + 0.85, z: p.z };
  const assisted = weapon === 'machineGun' ? machineGunAim(p, world.players.values(), world.time) : null;
  if (assisted) p.aimTarget = assisted.target?.id ?? null;
  let target: string | null = null;
  if (weapon === 'homing') {
    let best = 36;
    for (const other of world.players.values()) {
      if (other.id === p.id || other.health <= 0) continue;
      const dx = other.x - p.x, dz = other.z - p.z, d = Math.hypot(dx, dz);
      if (d >= best || (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / Math.max(d, 0.1) < -0.15) continue;
      if (wallHit({ x: p.x, y: p.y + 0.7, z: p.z }, { x: other.x, y: other.y + 0.7, z: other.z }) !== null) continue;
      best = d; target = other.id;
    }
  }
  for (const spread of w.spread) {
    const aim = assisted?.direction;
    const yaw = (aim ? Math.atan2(aim.x, aim.z) : p.yaw) + spread + (assisted ? (world.random() * 2 - 1) * w.aimAssist!.spread : 0);
    const pitch = aim ? Math.asin(aim.y) : 0, fx = Math.sin(yaw) * Math.cos(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
    const behind = weapon === 'mine';
    const offset = behind ? -1.8 : 1.35;
    const x = p.x + fx * offset, z = p.z + fz * offset;
    const projectile: Projectile = {
      id: world.nextProjectileId(), kind: w.kind!, owner: p.id, x, z,
      y: behind ? groundHeight(x, z) + w.radius + 0.03 : p.y + 0.85,
      vx: fx * w.speed + (weapon === 'bomb' ? p.vx * 0.45 : 0),
      vz: fz * w.speed + (weapon === 'bomb' ? p.vz * 0.45 : 0),
      vy: weapon === 'bomb' ? 9 : Math.sin(pitch) * w.speed, radius: w.radius, damage: w.damage, blast: w.blast,
      expires: world.time + w.lifetime, armedAt: world.time + (behind ? 0.7 : 0), target,
    };
    if (assisted) {
      projectile.maxRange = w.aimAssist!.range; projectile.travelled = Math.abs(offset);
      projectile.origin = { x: p.x, y: p.y + 0.85, z: p.z };
      projectile.expires = world.time + Math.min(w.lifetime, w.aimAssist!.range / w.speed);
    }
    // Check the muzzle path so an offset cannot shoot through a thin wall.
    const hit = wallHit({ x: p.x, y: p.y + 0.85, z: p.z }, projectile, w.radius);
    if (hit !== null) {
      projectile.x = p.x + (x - p.x) * Math.max(0, hit - 0.01);
      projectile.z = p.z + (z - p.z) * Math.max(0, hit - 0.01);
      if (weapon !== 'mine') projectile.expires = world.time;
    }
    world.projectiles.set(projectile.id, projectile);
    if (spread === w.spread[0]) muzzle = { x: projectile.x, y: projectile.y, z: projectile.z };
  }
  return muzzle;
}
const shield: Handler = (world, p) => {
  p.shieldUntil = world.time + WEAPONS.shield.duration;
  world.emit({ kind: 'shield', player: p.id, x: p.x, y: p.y + 0.7, z: p.z });
};
const boost: Handler = (world, p) => {
  p.boostUntil = world.time + WEAPONS.boost.duration;
  world.emit({ kind: 'boost', player: p.id, x: p.x, y: p.y + 0.7, z: p.z });
};
const handlers: Record<WeaponId, Handler> = { machineGun: launch, rocket: launch, homing: launch, mine: launch, bomb: launch, shield, boost, scatter: launch };

export function activate(world: CombatWorld, player: PlayerState): boolean {
  const weapon = player.weapon;
  if (!weapon || player.health <= 0 || player.ammo <= 0 || world.time + 1e-9 < player.nextFire) return false;
  player.ammo--; player.nextFire = world.time + WEAPONS[weapon].cooldown;
  const muzzle = handlers[weapon](world, player, weapon) ?? { x: player.x, y: player.y + 0.85, z: player.z };
  world.emit({ kind: 'fire', player: player.id, weapon, ...muzzle });
  if (player.ammo <= 0) player.weapon = null;
  return true;
}
