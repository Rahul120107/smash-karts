import { CONFIG, DT } from '../../../shared/src/config.js';
import { groundHeight } from '../../../shared/src/arena.js';
import { clamp, distance, lerp, segmentSphere } from '../../../shared/src/math.js';
import type { Projectile, Vec3 } from '../../../shared/src/types.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import { damage, explode } from '../combat/damage.js';
import { terrainHit, wallHit } from '../collisions/projectile.js';
import type { CombatWorld } from '../simulation/world.js';

function steerHoming(world: CombatWorld, p: Projectile): void {
  const target = p.target ? world.players.get(p.target) : undefined;
  if (!target || target.health <= 0) { p.target = null; return; }
  const dx = target.x - p.x, dy = target.y + 0.65 - p.y, dz = target.z - p.z;
  const length = Math.hypot(dx, dy, dz), speed = Math.hypot(p.vx, p.vy, p.vz);
  if (length < 0.01) return;
  // Tighten the approach near the target so finite turning doesn't create a permanent orbit.
  const turnRate = WEAPONS.homing.turnRate * (1 + 3 / Math.max(1, length));
  const mix = 1 - Math.exp(-turnRate * DT);
  p.vx = lerp(p.vx, dx / length * speed, mix); p.vy = lerp(p.vy, dy / length * speed, mix); p.vz = lerp(p.vz, dz / length * speed, mix);
  const norm = Math.hypot(p.vx, p.vy, p.vz) || 1;
  p.vx *= speed / norm; p.vy *= speed / norm; p.vz *= speed / norm;
}
function stepBomb(p: Projectile): void {
  const old = { x: p.x, y: p.y, z: p.z };
  p.vy -= CONFIG.gravity * DT;
  const next = { x: p.x + p.vx * DT, y: p.y + p.vy * DT, z: p.z + p.vz * DT };
  const hit = wallHit(old, next, p.radius);
  if (hit !== null) { p.vx *= -0.5; p.vz *= -0.5; } else { p.x = next.x; p.z = next.z; }
  p.y = next.y;
  const floor = groundHeight(p.x, p.z) + p.radius;
  if (p.y <= floor) { p.y = floor; p.vy = Math.abs(p.vy) > 1.5 ? Math.abs(p.vy) * 0.42 : 0; p.vx *= 0.92; p.vz *= 0.92; }
}
function hitPosition(p: Projectile, old: Vec3, next: Vec3, t: number): void {
  p.x = lerp(old.x, next.x, t); p.y = lerp(old.y, next.y, t); p.z = lerp(old.z, next.z, t);
}

export function stepProjectiles(world: CombatWorld): void {
  for (const p of world.projectiles.values()) {
    if (world.time >= p.expires) {
      if (p.blast > 0 && p.kind !== 'mine') explode(world, p);
      world.projectiles.delete(p.id); continue;
    }
    if (p.kind === 'mine') {
      if (world.time < p.armedAt) continue;
      const enemy = [...world.players.values()].find(k => k.id !== p.owner && k.health > 0 && distance(p, { x: k.x, y: k.y + 0.6, z: k.z }) < 2);
      if (enemy) { explode(world, p); world.projectiles.delete(p.id); }
      continue;
    }
    if (p.kind === 'bomb') { stepBomb(p); continue; }
    if (p.kind === 'homing') steerHoming(world, p);
    const old = { x: p.x, y: p.y, z: p.z };
    const next = { x: p.x + p.vx * DT, y: p.y + p.vy * DT, z: p.z + p.vz * DT };
    let hit = wallHit(old, next, p.radius);
    const terrain = terrainHit(old, next, p.radius);
    if (terrain !== null && (hit === null || terrain < hit)) hit = terrain;
    let victim: string | null = null;
    for (const k of world.players.values()) {
      if (k.id === p.owner || k.health <= 0) continue;
      const t = segmentSphere(old, next, { x: k.x, y: k.y + 0.65, z: k.z }, CONFIG.kartRadius + p.radius);
      if (t !== null && (hit === null || t < hit)) { hit = t; victim = k.id; }
    }
    if (hit !== null) {
      hitPosition(p, old, next, clamp(hit, 0, 1));
      if (p.blast > 0) explode(world, p);
      else {
        if (victim) damage(world, world.players.get(victim)!, p.damage, p.owner);
        world.emit({ kind: 'impact', player: p.owner, x: p.x, y: p.y, z: p.z });
      }
      world.projectiles.delete(p.id);
    } else Object.assign(p, next);
  }
}
