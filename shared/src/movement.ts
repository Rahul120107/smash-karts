import { CONFIG, DT } from './config.js';
import { ARENA_SIZE, groundHeight, rampHeight, RAMPS, WALLS } from './arena.js';
import { clamp } from './math.js';
import type { Input, KartState } from './types.js';
export const NEUTRAL: Input = { seq: 0, throttle: 0, steer: 0, fire: false, drift: false };

/** Shared arcade dynamics. Circle/wall contacts plus heightfield suspension, no vehicle engine needed. */
export function moveKart(k: KartState, input: Input, boosted = false, dt = DT): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  const steps = Math.min(12, Math.ceil(dt / DT));
  const step = Math.min(dt, 12 * DT) / steps;
  recoverKart(k);
  let impact = 0;
  for (let i = 0; i < steps; i++) impact = Math.max(impact, integrateKart(k, input, boosted, step));
  return impact;
}

function integrateKart(k: KartState, input: Input, boosted: boolean, dt: number): number {
  const oldX = k.x, oldZ = k.z, oldGround = groundHeight(k.x, k.z);
  const grounded = k.y <= oldGround + CONFIG.groundTolerance && k.vy <= CONFIG.groundTolerance;
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  let forward = k.vx * fx + k.vz * fz;
  let lateral = k.vx * fz - k.vz * fx;
  const acceleration = input.throttle < 0 ? (forward > 0.5 ? CONFIG.braking : CONFIG.reverseAcceleration) : CONFIG.acceleration;
  const traction = grounded ? 1 : CONFIG.airControl;
  forward += input.throttle * acceleration * traction * dt;
  forward *= Math.exp(-(input.throttle === 0 ? 1.6 : 0.45) * dt);
  const maximum = CONFIG.maxSpeed * (boosted ? CONFIG.boostMultiplier : 1);
  forward = clamp(forward, -CONFIG.reverseSpeed, maximum);
  const drifting = input.drift && grounded && Math.abs(forward) > 5;
  lateral *= Math.exp(-(drifting ? CONFIG.driftGrip : CONFIG.roadGrip) * traction * dt);
  // Bicycle-model turn radius shrinks at low speed; steering response/inertia
  // and reduced high-speed wheel angle prevent instant changes in heading.
  const speedMix = clamp(Math.abs(forward) / CONFIG.maxSpeed, 0, 1);
  const wheelAngle = input.steer * (CONFIG.lowSpeedSteerAngle + (CONFIG.highSpeedSteerAngle - CONFIG.lowSpeedSteerAngle) * speedMix);
  const targetYawRate = clamp(forward / CONFIG.wheelbase * Math.tan(wheelAngle) * (drifting ? 1.24 : 1) * traction, -CONFIG.maxYawRate, CONFIG.maxYawRate);
  k.yawRate = (k.yawRate ?? 0) + (targetYawRate - (k.yawRate ?? 0)) * (1 - Math.exp(-CONFIG.steeringResponse * dt));
  k.yaw += k.yawRate * dt;
  k.yaw = Math.atan2(Math.sin(k.yaw), Math.cos(k.yaw));
  // Retain a fraction of world momentum for controlled slides; normal driving grips strongly.
  const nx = Math.sin(k.yaw), nz = Math.cos(k.yaw);
  const targetX = nx * forward + nz * lateral, targetZ = nz * forward - nx * lateral;
  const grip = 1 - Math.exp(-(drifting ? CONFIG.driftTurnGrip : CONFIG.turnGrip) * traction * dt);
  k.vx = fx * forward + fz * lateral; k.vz = fz * forward - fx * lateral;
  k.vx += (targetX - k.vx) * grip; k.vz += (targetZ - k.vz) * grip;
  limitHorizontalVelocity(k);
  k.x += k.vx * dt; k.z += k.vz * dt;
  const contactSpeed = Math.hypot(k.vx, k.vz);
  resolveWalls(k); resolveRampSides(k);
  const impact = Math.max(0, contactSpeed - Math.hypot(k.vx, k.vz));
  const ground = groundHeight(k.x, k.z);
  // Supported motion never stores suspension/slope correction as ballistic velocity.
  // Only a real crest/ledge departure can launch, using a bounded approach slope.
  const previousGround = groundHeight(oldX - k.vx * dt, oldZ - k.vz * dt);
  const earlierGround = groundHeight(oldX - k.vx * dt * 2, oldZ - k.vz * dt * 2);
  // A step straddling the triangular crest can average its rise to almost zero.
  // Retain the preceding approach grade so launch strength doesn't depend on tick alignment.
  const previousRise = Math.max(oldGround - previousGround, previousGround - earlierGround);
  const crest = grounded && oldGround > 0.1 && previousRise > 0.002 && ground < oldGround && Math.hypot(k.vx, k.vz) >= CONFIG.rampJumpSpeed;
  if (crest) {
    k.vy = clamp(previousRise / dt * 0.85, 0, CONFIG.maxJumpVelocity);
    k.y += k.vy * dt;
  } else if (grounded && ground >= oldGround - CONFIG.groundSnapDistance) {
    k.y = ground; k.vy = 0;
  } else {
    k.vy = Math.max(-CONFIG.terminalVelocity, k.vy - CONFIG.gravity * dt); k.y += k.vy * dt;
    if (k.y <= ground) { k.y = ground; k.vy = 0; }
  }
  recoverKart(k);
  return impact;
}

function limitHorizontalVelocity(k: KartState) {
  const speed = Math.hypot(k.vx, k.vz), maximum = CONFIG.maxSpeed * CONFIG.boostMultiplier;
  if (speed > maximum) { k.vx *= maximum / speed; k.vz *= maximum / speed; }
}

/** Vertical ramp faces are contacts, not instantly climbable heightfield steps. */
export function resolveRampSides(k: KartState) {
  for (const r of RAMPS) {
    const dz = Math.abs(k.z - r.z);
    if (dz >= r.depth / 2) continue;
    const height = rampHeight(r, k.z);
    if (k.y + CONFIG.maxStepHeight >= height || Math.abs(k.x - r.x) >= r.width / 2 + CONFIG.kartRadius) continue;
    const normal = k.x < r.x ? -1 : 1;
    k.x = r.x + normal * (r.width / 2 + CONFIG.kartRadius);
    if (k.vx * normal < 0) k.vx -= (1 + CONFIG.wallRestitution) * k.vx;
  }
}

/** Recover corrupted/stuck states identically on client and server, without freezing real jumps. */
export function recoverKart(k: KartState) {
  const boundary = ARENA_SIZE / 2 - 1 - CONFIG.kartRadius;
  if (!Number.isFinite(k.x)) k.x = -8;
  if (!Number.isFinite(k.z)) k.z = 18;
  if (!Number.isFinite(k.yaw)) k.yaw = 0;
  k.yawRate = Number.isFinite(k.yawRate) ? clamp(k.yawRate!, -CONFIG.maxYawRate, CONFIG.maxYawRate) : 0;
  for (const axis of ['x', 'z'] as const) {
    const velocity = axis === 'x' ? 'vx' : 'vz';
    if (Math.abs(k[axis]) > boundary) { k[axis] = clamp(k[axis], -boundary, boundary); if (k[axis] * k[velocity] > 0) k[velocity] = 0; }
  }
  for (const axis of ['vx', 'vy', 'vz'] as const) if (!Number.isFinite(k[axis])) k[axis] = 0;
  if (!Number.isFinite(k.y) || k.y < -2 || k.y > CONFIG.recoveryHeight) { k.y = groundHeight(k.x, k.z); k.vy = 0; }
  k.vy = clamp(k.vy, -CONFIG.terminalVelocity, CONFIG.maxJumpVelocity);
  limitHorizontalVelocity(k);
}

/** Slip drives both tyre effects and audio; pressing Shift while stationary has no slip. */
export function drivingTelemetry(k: KartState) {
  const speed = Math.hypot(k.vx, k.vz), forward = k.vx * Math.sin(k.yaw) + k.vz * Math.cos(k.yaw);
  const lateral = k.vx * Math.cos(k.yaw) - k.vz * Math.sin(k.yaw);
  const slip = Math.abs(Math.atan2(lateral, Math.abs(forward) + 1));
  const grounded = Math.abs(k.y - groundHeight(k.x, k.z)) < 0.12 && Math.abs(k.vy) < 0.2;
  return { speed, forward, lateral, slip, grounded, sliding: grounded && speed > 5 && Math.abs(lateral) > 1.1 && slip > 0.12 };
}

export function resolveWalls(k: KartState): void {
  for (const w of WALLS) {
    if (k.y > w.height) continue;
    const minX = w.x - w.width / 2, maxX = w.x + w.width / 2;
    const minZ = w.z - w.depth / 2, maxZ = w.z + w.depth / 2;
    const cx = clamp(k.x, minX, maxX), cz = clamp(k.z, minZ, maxZ);
    let dx = k.x - cx, dz = k.z - cz, d = Math.hypot(dx, dz);
    if (d >= CONFIG.kartRadius) continue;
    if (d < 1e-8) {
      const sides = [{ v: k.x - minX, x: -1, z: 0 }, { v: maxX - k.x, x: 1, z: 0 }, { v: k.z - minZ, x: 0, z: -1 }, { v: maxZ - k.z, x: 0, z: 1 }].sort((a, b) => a.v - b.v);
      const side = sides[0]!; dx = side.x; dz = side.z;
      k.x += dx * (side.v + CONFIG.kartRadius); k.z += dz * (side.v + CONFIG.kartRadius); d = 1;
    } else { dx /= d; dz /= d; k.x += dx * (CONFIG.kartRadius - d); k.z += dz * (CONFIG.kartRadius - d); }
    const into = k.vx * dx + k.vz * dz;
    if (into < 0) { k.vx -= dx * into * (1 + CONFIG.wallRestitution); k.vz -= dz * into * (1 + CONFIG.wallRestitution); }
  }
}

export function collideKarts(a: KartState, b: KartState): number {
  if (Math.abs(a.y - b.y) > 1.5) return 0;
  let dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), minimum = CONFIG.kartRadius * 2;
  if (d >= minimum) return 0;
  const groundedA = Math.abs(a.y - groundHeight(a.x, a.z)) < CONFIG.groundTolerance && a.vy <= 0;
  const groundedB = Math.abs(b.y - groundHeight(b.x, b.z)) < CONFIG.groundTolerance && b.vy <= 0;
  if (d < 1e-8) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const push = (minimum - d) / 2;
  a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
  const closing = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
  if (closing > 0) {
    const inverseMass = 1 / CONFIG.kartMass;
    const impulse = closing * (1 + CONFIG.kartRestitution) / (2 * inverseMass);
    a.vx -= dx * impulse * inverseMass; a.vz -= dz * impulse * inverseMass;
    b.vx += dx * impulse * inverseMass; b.vz += dz * impulse * inverseMass;
  }
  resolveWalls(a); resolveWalls(b);
  resolveRampSides(a); resolveRampSides(b);
  for (const [k, grounded] of [[a, groundedA], [b, groundedB]] as const) {
    if (grounded && k.y <= groundHeight(k.x, k.z) + CONFIG.groundSnapDistance) { k.y = groundHeight(k.x, k.z); k.vy = 0; }
    recoverKart(k);
  }
  return Math.max(0, closing);
}
