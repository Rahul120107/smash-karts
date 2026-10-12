import { CONFIG } from '../../../shared/src/config.js';
import { distance } from '../../../shared/src/math.js';
import type { PlayerState, Projectile, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { clearShot } from '../../../shared/src/aim.js';
import { sanitizeName } from '../../../shared/src/elimination.js';
import { WEAPONS } from '../../../shared/src/weapons.js';

export function damage(world: CombatWorld, target: PlayerState, amount: number, attacker: string, weapon?: WeaponId, attackerName?: string): void {
  // Owner attribution survives delayed fuses and splash; no weapon can hurt its originator.
  if (!Number.isFinite(amount) || amount <= 0 || target.id === attacker || target.health <= 0 || world.time < target.invulnerableUntil) return;
  if (world.time < target.shieldUntil) {
    world.emit({ kind: 'shieldImpact', player: attacker, target: target.id, weapon, x: target.x, y: target.y + 0.7, z: target.z }); return;
  }
  if(weapon!=='shield'&&(target.orbitUntil??0)>world.time)amount*=1-(WEAPONS.orbit.damageReduction??0);
  const remaining = Math.max(0, target.health - amount);
  world.diagnostics?.record(world.time,'damage',{attacker,target:target.id,weapon,amount,healthBefore:target.health,healthAfter:remaining});
  if (remaining > 0) target.health = remaining;
  world.emit({ kind: 'hit', player: attacker, target: target.id, weapon, x: target.x, y: target.y + 0.7, z: target.z });
  if (remaining > 0) return;
  eliminate(world, target, attacker, weapon, attackerName);
}

/** Environmental deaths share respawn bookkeeping, without an invented weapon owner. */
export function eliminate(world: CombatWorld, target: PlayerState, attacker: string, weapon?: WeaponId, attackerName?: string) {
  if (target.health <= 0) return;
  target.health = 0;
  target.deaths++;
  target.respawnAt = world.time + CONFIG.respawnDelay;
  target.weapon = null; target.ammo = 0; target.shieldUntil = 0; target.boostUntil = 0; target.orbitUntil = 0;
  target.attacking = false; target.charging = false; target.aimTarget = null;
  target.weaponPhase='EXPIRED';target.chargeRatio=0;target.chargeStartedAt=undefined;
  target.vx = 0; target.vz = 0; target.vy = 0;
  const killer = world.players.get(attacker);
  if (killer && killer.id !== target.id) killer.score++;
  world.emit({ kind: 'elimination', player: attacker, target: target.id, weapon,
    killerId:attacker, killerName:sanitizeName(attackerName ?? killer?.name ?? (attacker==='environment'?'Water':'Departed player')),
    victimId:target.id, victimName:sanitizeName(target.name), weaponName:weapon==='cannon'?'Cannonball':weapon==='rocket'?'Rocket':weapon?WEAPONS[weapon].label:attacker==='environment'?'Water':'Unknown weapon',
    x: target.x, y: target.y + 0.6, z: target.z });
}

export function explode(world: CombatWorld, projectile: Projectile,directVictim?:string): void {
  world.emit({ kind: 'explosion', player: projectile.owner, weapon: projectile.weapon, x: projectile.x, y: projectile.y, z: projectile.z, radius: projectile.blast });
  for (const target of world.players.values()) {
    const center = { x: target.x, y: target.y + 0.65, z: target.z };
    const d = distance(projectile, center);
    if (target.id === projectile.owner || d > projectile.blast || target.health <= 0) continue;
    // Use the actual impact point. Lifting an embedded explosion onto the top
    // of a platform would incorrectly let splash escape through solid terrain.
    if (!clearShot({ x: projectile.x, y: projectile.y + .001, z: projectile.z }, center, 0)) continue;
    const splash=projectile.weapon?WEAPONS[projectile.weapon].splashDamage??projectile.damage:projectile.damage;
    const amount = target.id===directVictim?projectile.damage:Math.round(splash * (1 - 0.7 * d / projectile.blast));
    damage(world, target, amount, projectile.owner, projectile.weapon, projectile.ownerName);
  }
}
