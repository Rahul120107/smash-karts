import { CONFIG, DT } from '../../../shared/src/config.js';
import { terrainHeight as groundHeight } from '../../../shared/src/arena.js';
import { clamp, distance, lerp, segmentSphere } from '../../../shared/src/math.js';
import type { PlayerState,Projectile, Vec3 } from '../../../shared/src/types.js';
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
  if (speed < 1e-8) return;
  const from = { x:p.vx/speed,y:p.vy/speed,z:p.vz/speed }, to={x:dx/length,y:dy/length,z:dz/length};
  const dot=clamp(from.x*to.x+from.y*to.y+from.z*to.z,-1,1), angle=Math.acos(dot);
  if(angle<1e-8)return;
  const turn=Math.min(angle,WEAPONS.homing.turnRate*DT);
  let tx=to.x-from.x*dot,ty=to.y-from.y*dot,tz=to.z-from.z*dot;
  let tangent=Math.hypot(tx,ty,tz);
  if(tangent<1e-8){
    // An antiparallel target has no unique tangent; choose an orthogonal axis,
    // including steep airborne launches, so turning preserves projectile speed.
    if(Math.abs(from.y)<.9){tx=from.z;ty=0;tz=-from.x;}
    else {tx=0;ty=-from.z;tz=from.y;}
    tangent=Math.hypot(tx,ty,tz);
  }
  p.vx=(from.x*Math.cos(turn)+tx/tangent*Math.sin(turn))*speed;
  p.vy=(from.y*Math.cos(turn)+ty/tangent*Math.sin(turn))*speed;
  p.vz=(from.z*Math.cos(turn)+tz/tangent*Math.sin(turn))*speed;
}
function stepBomb(world: CombatWorld, p: Projectile): void {
  let remaining = DT;
  for (let bounce = 0; bounce < 3 && remaining > 1e-8; bounce++) {
    const old = { x: p.x, y: p.y, z: p.z };
    const next = ballisticPosition(p, remaining, CONFIG.gravity);
    let contact = wallContact(old, next, p.radius);
    let victim:PlayerState|undefined;
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
      contact = { time, normal };victim=kart;
    }
    if (!contact) { Object.assign(p, next); p.vy -= CONFIG.gravity * remaining; break; }
    hitPosition(p, old, next, contact.time);
    if(victim){explode(world,p,victim.id);world.projectiles.delete(p.id);return;}
    p.vy -= CONFIG.gravity * remaining * contact.time;
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
      if(p.blockedAtSpawn)world.emit({kind:'impact',player:p.owner,weapon:p.weapon,x:p.x,y:p.y,z:p.z});
      if (p.blast > 0 && p.kind !== 'mine'&&p.kind!=='fakeBox') explode(world, p);
      world.projectiles.delete(p.id); continue;
    }
    if (p.kind === 'mine'||p.kind==='fakeBox') {
      if (world.time < p.armedAt) continue;
      const trap=WEAPONS[p.weapon??(p.kind==='fakeBox'?'fakeLootBox':'mine')];
      const enemy = [...world.players.values()].find(k => k.id !== p.owner && k.health > 0 && distance(p, { x: k.x, y: k.y + 0.6, z: k.z }) < trap.triggerRadius! && clearShot(p, { x: k.x, y: k.y + .6, z: k.z }, 0));
      if (enemy) { explode(world, p,enemy.id); world.projectiles.delete(p.id); }
      continue;
    }
    if (p.kind === 'bomb') {
      stepBomb(world, p);
      if(world.projectiles.has(p.id)&&world.time>=p.armedAt){const enemy=[...world.players.values()].find(k=>k.id!==p.owner&&k.health>0&&distance(p,{x:k.x,y:k.y+.65,z:k.z})<WEAPONS.bomb.triggerRadius!&&clearShot(p,{x:k.x,y:k.y+.65,z:k.z},0));if(enemy){explode(world,p);world.projectiles.delete(p.id);}}
      continue;
    }
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
      if (p.blast > 0) explode(world, p,victim??undefined);
      else {
        if (victim) {const falloff=p.weapon?WEAPONS[p.weapon].falloff:undefined,d=p.origin?distance(p.origin,p):p.travelled??0,factor=falloff?1-(1-falloff.minimum)*clamp((d-falloff.start)/(falloff.end-falloff.start),0,1):1;damage(world, world.players.get(victim)!, p.damage*factor, p.owner, p.weapon, p.ownerName);}
        world.emit({ kind: 'impact', player: p.owner, weapon: p.weapon, x: p.x, y: p.y, z: p.z });
      }
      world.projectiles.delete(p.id);
    } else {
      Object.assign(p, next);
      if (p.maxRange !== undefined && (p.travelled ?? 0) >= p.maxRange) world.projectiles.delete(p.id);
    }
  }
}
