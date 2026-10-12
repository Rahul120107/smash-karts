import { groundHeight } from '../../../shared/src/arena.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { PlayerState, Vec3, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { terrainHit, wallHit } from '../collisions/projectile.js';
import { clearShot, weaponAim } from '../../../shared/src/aim.js';
import { launchDirection, launchProfile, weaponMuzzle } from '../../../shared/src/weapon-physics.js';
import type { Projectile } from '../../../shared/src/types.js';
import { sanitizeName } from '../../../shared/src/elimination.js';

export interface LaunchOptions { assisted?: ReturnType<typeof weaponAim>; target?: string|null; rear?: boolean }
export function spawnProjectiles(world: CombatWorld, p: PlayerState, weapon: WeaponId,options:LaunchOptions={}): Vec3 | false {
  const w = WEAPONS[weapon];
  let muzzle: Vec3 = { x: p.x, y: p.y + 0.85, z: p.z };
  const assisted = options.assisted;
  if (assisted) p.aimTarget = assisted.target?.id ?? null;
  const target=options.target??null,profile=launchProfile(weapon,p.chargeRatio);
  for (const spread of w.spread) {
    const aim = assisted?.direction;
    const yaw = (aim ? Math.atan2(aim.x, aim.z) : p.yaw) + spread + (assisted ? (world.random() * 2 - 1) * w.aimAssist!.spread : 0);
    const pitch = aim ? Math.asin(aim.y) : profile.elevation;
    const direction = launchDirection(yaw, pitch);
    // Cannon speed is its horizontal launch speed; the barrel reflects its elevation.
    const fx = Math.sin(yaw) * (w.launchVelocityY !== undefined ? 1 : Math.cos(pitch)), fz = Math.cos(yaw) * (w.launchVelocityY !== undefined ? 1 : Math.cos(pitch));
    const behind = !!options.rear;
    // Spread changes velocity, never moves the physical barrel tip between pellets.
    const tip = weaponMuzzle(p, weapon, aim ?? launchDirection(p.yaw, pitch)), { x, z } = tip;
    const projectile: Projectile = {
      id: world.nextProjectileId(), kind: w.kind!, owner: p.id, ownerName:sanitizeName(p.name), weapon, x, z,
      y: behind ? groundHeight(x, z,p.y) + w.radius + 0.03 : tip.y,
      vx: fx * profile.speed + p.vx * (w.inheritedVelocity ?? 0),
      vz: fz * profile.speed + p.vz * (w.inheritedVelocity ?? 0),
      vy: (aim?Math.sin(pitch)*w.speed:profile.vertical) + p.vy * (w.inheritedVelocity ?? 0), radius: w.radius, damage: w.damage, blast: w.blast,
      expires: world.time + w.lifetime, armedAt: world.time + (w.armingDelay??0), target,
    };
    if (assisted) {
      projectile.maxRange = w.aimAssist!.range; projectile.travelled = Math.hypot(x - p.x, tip.y - p.y - .85, z - p.z);
      projectile.origin = { x: p.x, y: p.y + 0.85, z: p.z };
      projectile.expires = world.time + Math.min(w.lifetime, w.aimAssist!.range / w.speed);
    }
    if(w.falloff&&!projectile.origin)projectile.origin={x:p.x,y:p.y+.85,z:p.z};
    // Check the muzzle path so an offset cannot shoot through a thin wall.
    const origin = { x: p.x, y: p.y + 0.85, z: p.z };
    const wall = wallHit(origin, projectile, w.radius), terrain = terrainHit(origin, projectile, w.radius);
    const hit = wall === null ? terrain : terrain === null ? wall : Math.min(wall, terrain);
    if (hit !== null) {
      projectile.x = p.x + (x - p.x) * Math.max(0, hit - 0.01);
      projectile.z = p.z + (z - p.z) * Math.max(0, hit - 0.01);
      projectile.y = origin.y + (projectile.y - origin.y) * Math.max(0, hit - 0.01);
      if (!behind) { projectile.expires = world.time; projectile.blockedAtSpawn = true; }
    }
    if (behind) projectile.y = groundHeight(projectile.x, projectile.z,p.y) + w.radius + 0.03;
    if (weapon==='mine' && [...world.projectiles.values()].some(m => m.kind === 'mine' && Math.hypot(m.x - projectile.x, m.z - projectile.z) < w.mineSpacing!)) return false;
    world.projectiles.set(projectile.id, projectile);
    world.diagnostics?.record(world.time,'projectile',{id:projectile.id,player:p.id,weapon,muzzle:{x:projectile.x,y:projectile.y,z:projectile.z},velocity:{x:projectile.vx,y:projectile.vy,z:projectile.vz},lifetime:projectile.expires-world.time,charge:p.chargeRatio,target:p.aimTarget??target});
    if (spread === w.spread[0]) muzzle = { x: projectile.x, y: projectile.y, z: projectile.z };
  }
  return muzzle;
}
