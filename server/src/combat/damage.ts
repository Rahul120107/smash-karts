import { CONFIG } from '../../../shared/src/config.js';
import { distance } from '../../../shared/src/math.js';
import type { PlayerState, Projectile } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { wallHit } from '../collisions/projectile.js';

export function damage(world: CombatWorld, target: PlayerState, amount: number, attacker: string): void {
  if (target.health <= 0 || world.time < target.invulnerableUntil || world.time < target.shieldUntil) return;
  target.health = Math.max(0, target.health - amount);
  world.emit({ kind: 'hit', player: attacker, target: target.id, x: target.x, y: target.y + 0.7, z: target.z });
  if (target.health > 0) return;
  target.deaths++;
  target.respawnAt = world.time + CONFIG.respawnDelay;
  target.weapon = null; target.ammo = 0; target.shieldUntil = 0; target.boostUntil = 0;
  target.vx = 0; target.vz = 0; target.vy = 0;
  const killer = world.players.get(attacker);
  if (killer && killer.id !== target.id) killer.score++;
  world.emit({ kind: 'elimination', player: attacker, target: target.id, x: target.x, y: target.y + 0.6, z: target.z });
}

export function explode(world: CombatWorld, projectile: Projectile): void {
  world.emit({ kind: 'explosion', player: projectile.owner, x: projectile.x, y: projectile.y, z: projectile.z, radius: projectile.blast });
  for (const target of world.players.values()) {
    const center = { x: target.x, y: target.y + 0.65, z: target.z };
    const d = distance(projectile, center);
    if (d > projectile.blast || target.health <= 0) continue;
    // Tiny upward offset keeps ground-level mines from treating the floor as an occluder.
    const obstruction = wallHit({ x: projectile.x, y: Math.max(projectile.y, 0.3), z: projectile.z }, center);
    if (obstruction !== null && obstruction > 0.01 && obstruction < 0.99) continue;
    const amount = Math.round(projectile.damage * (1 - 0.7 * d / projectile.blast));
    damage(world, target, amount, projectile.owner);
  }
}
