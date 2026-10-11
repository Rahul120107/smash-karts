import { groundHeight } from '../../../shared/src/arena.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { PlayerState, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { wallHit } from '../collisions/projectile.js';

type Handler = (world: CombatWorld, player: PlayerState, weapon: WeaponId) => void;
function launch(world: CombatWorld, p: PlayerState, weapon: WeaponId): void {
  const w = WEAPONS[weapon];
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
    const yaw = p.yaw + spread, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const behind = weapon === 'mine';
    const offset = behind ? -1.8 : 1.35;
    const x = p.x + fx * offset, z = p.z + fz * offset;
    const projectile = {
      id: world.nextProjectileId(), kind: w.kind!, owner: p.id, x, z,
      y: behind ? groundHeight(x, z) + w.radius + 0.03 : p.y + 0.85,
      vx: fx * w.speed + (weapon === 'bomb' ? p.vx * 0.45 : 0),
      vz: fz * w.speed + (weapon === 'bomb' ? p.vz * 0.45 : 0),
      vy: weapon === 'bomb' ? 9 : 0, radius: w.radius, damage: w.damage, blast: w.blast,
      expires: world.time + w.lifetime, armedAt: world.time + (behind ? 0.7 : 0), target,
    };
    // Check the muzzle path so an offset cannot shoot through a thin wall.
    const hit = wallHit({ x: p.x, y: p.y + 0.85, z: p.z }, projectile, w.radius);
    if (hit !== null) {
      projectile.x = p.x + (x - p.x) * Math.max(0, hit - 0.01);
      projectile.z = p.z + (z - p.z) * Math.max(0, hit - 0.01);
      if (weapon !== 'mine') projectile.expires = world.time;
    }
    world.projectiles.set(projectile.id, projectile);
  }
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
  handlers[weapon](world, player, weapon);
  world.emit({ kind: 'fire', player: player.id, weapon, x: player.x + Math.sin(player.yaw) * 1.4, y: player.y + 0.85, z: player.z + Math.cos(player.yaw) * 1.4 });
  if (player.ammo <= 0) player.weapon = null;
  return true;
}
