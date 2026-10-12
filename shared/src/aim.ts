import { WALLS } from './arena.js';
import { angleDelta, clamp, distance } from './math.js';
import type { PlayerState, Vec3, WeaponId } from './types.js';
import { wallSegment } from './wall-collision.js';
import { WEAPONS } from './weapons.js';
import { terrainHit } from './terrain-collision.js';
import { weaponMuzzle, weaponPivot } from './weapon-physics.js';

export function clearShot(a: Vec3, b: Vec3, radius = WEAPONS.machineGun.radius): boolean {
  for (const w of WALLS) if (wallSegment(a, b, w, radius)) return false;
  return terrainHit(a, b, radius) === null;
}

/** Constant-velocity intercept; finite travel and bounded lead still allow opponents to dodge. */
export function interceptTime(relative: Vec3, velocity: Vec3, speed: number): number {
  const a = velocity.x ** 2 + velocity.y ** 2 + velocity.z ** 2 - speed ** 2;
  const b = 2 * (relative.x * velocity.x + relative.y * velocity.y + relative.z * velocity.z);
  const c = relative.x ** 2 + relative.y ** 2 + relative.z ** 2;
  if (Math.abs(a) < 1e-8) return b < -1e-8 ? -c / b : 0;
  const discriminant = b * b - 4 * a * c; if (discriminant < 0) return 0;
  const root = Math.sqrt(discriminant), t1 = (-b - root) / (2 * a), t2 = (-b + root) / (2 * a);
  const times = [t1, t2].filter(t => t > 0); return times.length ? Math.min(...times) : 0;
}

export function weaponAim(shooter: PlayerState, players: Iterable<PlayerState>, now = 0, weapon: WeaponId = 'machineGun') {
  const definition = WEAPONS[weapon], settings = definition.aimAssist!;
  const origin = weaponPivot(shooter, weapon);
  let target: PlayerState | null = null, point: Vec3 | null = null, best = Infinity;
  for (const candidate of players) {
    if (candidate.id === shooter.id || candidate.health <= 0 || candidate.invulnerableUntil > now) continue;
    const center = { x: candidate.x, y: candidate.y + 0.65, z: candidate.z }, d = distance(origin, center);
    const angle = Math.abs(angleDelta(shooter.yaw, Math.atan2(center.x - origin.x, center.z - origin.z)));
    if (distance({ x: shooter.x, y: shooter.y + .85, z: shooter.z }, center) > settings.range || angle > settings.cone || !clearShot(origin, center, definition.radius)) continue;
    let muzzle = origin, lead = center;
    // Re-solve from the barrel tip rather than the kart center. This matters at
    // close range and for elevated opponents, especially with the side-mounted gun.
    for (let iteration = 0; iteration < 3; iteration++) {
      const t = clamp(interceptTime({ x: center.x - muzzle.x, y: center.y - muzzle.y, z: center.z - muzzle.z },
        { x: candidate.vx, y: candidate.vy, z: candidate.vz }, definition.speed), 0, settings.maxLeadSeconds);
      lead = { x: center.x + candidate.vx * t, y: center.y + candidate.vy * t, z: center.z + candidate.vz * t };
      const length = distance(origin, lead) || 1;
      muzzle = weaponMuzzle(shooter, weapon, { x: (lead.x - origin.x) / length, y: (lead.y - origin.y) / length, z: (lead.z - origin.z) / length });
    }
    if (distance(origin, lead) > settings.range || Math.abs(angleDelta(shooter.yaw, Math.atan2(lead.x - origin.x, lead.z - origin.z))) > settings.maxCorrection || !clearShot(origin, lead, definition.radius)) continue;
    const score = angle / settings.cone * 0.88 + d / settings.range * 0.12 - (shooter.aimTarget === candidate.id ? 0.025 : 0);
    if (score < best) { best = score; target = candidate; point = lead; }
  }
  const yaw = point ? shooter.yaw + clamp(angleDelta(shooter.yaw, Math.atan2(point.x - origin.x, point.z - origin.z)), -settings.maxCorrection, settings.maxCorrection) : shooter.yaw;
  const pitch = point ? clamp(Math.atan2(point.y - origin.y, Math.hypot(point.x - origin.x, point.z - origin.z)), -.45, .45) : 0;
  return { target, point, direction: { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) } };
}

export const machineGunAim = (shooter: PlayerState, players: Iterable<PlayerState>, now = 0) => weaponAim(shooter, players, now, 'machineGun');
