import { groundHeight, WALLS } from './arena.js';
import { angleDelta, clamp, distance, lerp, segmentBox } from './math.js';
import type { PlayerState, Vec3 } from './types.js';
import { WEAPONS } from './weapons.js';

export function clearShot(a: Vec3, b: Vec3, radius = WEAPONS.machineGun.radius): boolean {
  for (const w of WALLS) if (segmentBox(a, b,
    { x: w.x - w.width / 2 - radius, y: -radius, z: w.z - w.depth / 2 - radius },
    { x: w.x + w.width / 2 + radius, y: w.height + radius, z: w.z + w.depth / 2 + radius }) !== null) return false;
  const steps = Math.max(1, Math.ceil(distance(a, b) / 0.5));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (lerp(a.y, b.y, t) - radius <= groundHeight(lerp(a.x, b.x, t), lerp(a.z, b.z, t))) return false;
  }
  return true;
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

export function machineGunAim(shooter: PlayerState, players: Iterable<PlayerState>, now = 0) {
  const settings = WEAPONS.machineGun.aimAssist!;
  const origin = { x: shooter.x, y: shooter.y + 0.85, z: shooter.z };
  let target: PlayerState | null = null, point: Vec3 | null = null, best = Infinity;
  for (const candidate of players) {
    if (candidate.id === shooter.id || candidate.health <= 0 || candidate.invulnerableUntil > now) continue;
    const center = { x: candidate.x, y: candidate.y + 0.65, z: candidate.z }, d = distance(origin, center);
    const angle = Math.abs(angleDelta(shooter.yaw, Math.atan2(center.x - origin.x, center.z - origin.z)));
    if (d > settings.range || angle > settings.cone || !clearShot(origin, center)) continue;
    const t = clamp(interceptTime({ x: center.x - origin.x, y: center.y - origin.y, z: center.z - origin.z },
      { x: candidate.vx, y: candidate.vy, z: candidate.vz }, WEAPONS.machineGun.speed), 0, settings.maxLeadSeconds);
    const lead = { x: center.x + candidate.vx * t, y: center.y + candidate.vy * t, z: center.z + candidate.vz * t };
    if (distance(origin, lead) > settings.range || !clearShot(origin, lead)) continue;
    const score = angle / settings.cone * 0.88 + d / settings.range * 0.12 - (shooter.aimTarget === candidate.id ? 0.025 : 0);
    if (score < best) { best = score; target = candidate; point = lead; }
  }
  const yaw = point ? shooter.yaw + clamp(angleDelta(shooter.yaw, Math.atan2(point.x - origin.x, point.z - origin.z)), -settings.maxCorrection, settings.maxCorrection) : shooter.yaw;
  const pitch = point ? clamp(Math.atan2(point.y - origin.y, Math.hypot(point.x - origin.x, point.z - origin.z)), -0.2, 0.2) : 0;
  return { target, point, direction: { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) } };
}
