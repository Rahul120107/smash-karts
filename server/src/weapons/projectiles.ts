import { CONFIG, DT } from '../../../shared/src/config.js';
import { groundHeight } from '../../../shared/src/arena.js';
import { clamp, distance, lerp, segmentSphere } from '../../../shared/src/math.js';
import type { Projectile, Vec3 } from '../../../shared/src/types.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import { damage, explode } from '../combat/damage.js';
import { terrainHit, wallHit, wallContact } from '../collisions/projectile.js';
import type { CombatWorld } from '../simulation/world.js';
import { ballisticPosition } from '../../../shared/src/weapon-physics.js';
import { terrainNormal } from '../../../shared/src/terrain-collision.js';
import { clearShot, interceptTime } from '../../../shared/src/aim.js';

function steerHoming(world: CombatWorld, p: Projectile): void {
  let target = p.target ? world.players.get(p.target) : undefined;
  const visible = (k: NonNullable<typeof target>) => k.id !== p.owner && k.health > 0 && k.invulnerableUntil <= world.time && clearShot(p, { x: k.x, y: k.y + .65, z: k.z }, p.radius);
  if (!target || !visible(target)) {
    target = undefined; let best = 36;
    for (const kart of world.players.values()) {
      const d = distance(p, { x: kart.x, y: kart.y + .65, z: kart.z });
      if (d >= best || (kart.x - p.x) * p.vx + (kart.z - p.z) * p.vz < 0 || !visible(kart)) continue;
      best = d; target = kart;
    }
    p.target = target?.id ?? null;
  }
  if (!target) return;
  const lead = clamp(interceptTime({ x: target.x - p.x, y: target.y + .65 - p.y, z: target.z - p.z }, { x: target.vx, y: target.vy, z: target.vz }, WEAPONS.homing.speed), 0, .35);
  const dx = target.x + target.vx * lead - p.x, dy = target.y + .65 + target.vy * lead - p.y, dz = target.z + target.vz * lead - p.z;
  const length = Math.hypot(dx, dy, dz), speed = Math.hypot(p.vx, p.vy, p.vz);
  if (length < 0.01) return;
  // Tighten the approach near the target so finite turning doesn't create a permanent orbit.
  const turnRate = WEAPONS.homing.turnRate * (1 + 3 / Math.max(1, length));
  const mix = 1 - Math.exp(-turnRate * DT);
  p.vx = lerp(p.vx, dx / length * speed, mix); p.vy = lerp(p.vy, dy / length * speed, mix); p.vz = lerp(p.vz, dz / length * speed, mix);
  const norm = Math.hypot(p.vx, p.vy, p.vz) || 1;
  p.vx *= speed / norm; p.vy *= speed / norm; p.vz *= speed / norm;
}
function stepBomb(world: CombatWorld, p: Projectile): void {
  p.vy -= CONFIG.gravity * DT;
  let remaining = DT;
  for (let bounce = 0; bounce < 3 && remaining > 1e-8; bounce++) {
    const old = { x: p.x, y: p.y, z: p.z };
    const next = { x: p.x + p.vx * remaining, y: p.y + p.vy * remaining, z: p.z + p.vz * remaining };
    let contact = wallContact(old, next, p.radius);
    const terrain = terrainHit(old, next, p.radius);
    if (terrain !== null && (!contact || terrain < contact.time)) {
      const normal = terrainNormal(lerp(old.x, next.x, terrain), lerp(old.z, next.z, terrain));
      if (terrain > 1e-8 || p.vx * normal.x + p.vy * normal.y + p.vz * normal.z < 0) contact = { time: terrain, normal };
    }
    for (const kart of world.players.values()) {
      if (kart.id === p.owner || kart.health <= 0) continue;
      const center = { x: kart.x, y: kart.y + .65, z: kart.z };
      const time = segmentSphere(old, next, center, CONFIG.kartRadius + p.radius);
      if (time === null || contact && time >= contact.time) continue;
      const dx = lerp(old.x, next.x, time) - center.x, dy = lerp(old.y, next.y, time) - center.y, dz = lerp(old.z, next.z, time) - center.z;
      const length = Math.hypot(dx, dy, dz) || 1, normal = { x: dx / length, y: dy / length, z: dz / length };
      if (p.vx * normal.x + p.vy * normal.y + p.vz * normal.z < 0) contact = { time, normal };
    }
    if (!contact) { Object.assign(p, next); break; }
    hitPosition(p, old, next, contact.time);
    const n = contact.normal;
    p.x += n.x * 0.0001; p.y += n.y * 0.0001; p.z += n.z * 0.0001;
    const inward = p.vx * n.x + p.vy * n.y + p.vz * n.z;
    const restitution = n.y > .5 ? Math.abs(inward) > 1.5 ? .42 : 0 : .5;
    if (inward < 0) { p.vx -= (1 + restitution) * inward * n.x; p.vy -= (1 + restitution) * inward * n.y; p.vz -= (1 + restitution) * inward * n.z; }
    if (n.y > .5) { p.vx *= .92; p.vz *= .92; }
    remaining *= 1 - contact.time;
  }
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
      const enemy = [...world.players.values()].find(k => k.id !== p.owner && k.health > 0 && distance(p, { x: k.x, y: k.y + 0.6, z: k.z }) < 2 && clearShot(p, { x: k.x, y: k.y + .6, z: k.z }, 0));
      if (enemy) { explode(world, p); world.projectiles.delete(p.id); }
      continue;
    }
    if (p.kind === 'bomb') { stepBomb(world, p); continue; }
    if (p.kind === 'homing') steerHoming(world, p);
    const old = { x: p.x, y: p.y, z: p.z };
    const next = ballisticPosition(p, DT, p.kind === 'cannonball' ? CONFIG.gravity : 0);
    if (p.kind === 'cannonball') p.vy -= CONFIG.gravity * DT;
    if (p.maxRange !== undefined) {
      const stepLength = distance(old, next), remaining = Math.max(0, p.maxRange - (p.travelled ?? 0));
      const fraction = stepLength > remaining ? remaining / stepLength : 1;
      next.x = lerp(old.x, next.x, fraction); next.y = lerp(old.y, next.y, fraction); next.z = lerp(old.z, next.z, fraction);
      p.travelled = (p.travelled ?? 0) + Math.min(stepLength, remaining);
    }
    let hit = wallHit(old, next, p.radius);
    const terrain = terrainHit(old, next, p.radius);
    if (terrain !== null && (hit === null || terrain < hit)) hit = terrain;
    let victim: string | null = null;
    for (const k of world.players.values()) {
      if (k.id === p.owner || k.health <= 0) continue;
      if (p.origin && p.maxRange !== undefined && distance(p.origin, { x: k.x, y: k.y + 0.65, z: k.z }) > p.maxRange) continue;
      const t = segmentSphere(old, next, { x: k.x, y: k.y + 0.65, z: k.z }, CONFIG.kartRadius + p.radius);
      if (t !== null && (hit === null || t < hit)) { hit = t; victim = k.id; }
    }
    if (hit !== null) {
      hitPosition(p, old, next, clamp(hit - .00001, 0, 1));
      if (p.blast > 0) explode(world, p);
      else {
        if (victim) damage(world, world.players.get(victim)!, p.damage, p.owner);
        world.emit({ kind: 'impact', player: p.owner, weapon: p.weapon, x: p.x, y: p.y, z: p.z });
      }
      world.projectiles.delete(p.id);
    } else {
      Object.assign(p, next);
      if (p.maxRange !== undefined && (p.travelled ?? 0) >= p.maxRange) world.projectiles.delete(p.id);
    }
  }
}
