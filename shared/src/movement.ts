import { CONFIG, DT } from './config.js';
import { arenaClamp, groundHeight, rampHeight, rampHalfWidth, RAMPS, queryWalls, SPAWNS, toLocal, toWorld } from './arena.js';
import { clamp } from './math.js';
import type { Input, KartState } from './types.js';
export const NEUTRAL: Input = { seq: 0, throttle: 0, steer: 0, fire: false, drift: false };

/** Shared arcade dynamics. Circle/wall contacts plus heightfield suspension, no vehicle engine needed. */
export function moveKart(k: KartState, input: Input, boosted: boolean|number = false, dt = DT): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  const steps = Math.min(12, Math.ceil(dt / DT));
  const step = Math.min(dt, 12 * DT) / steps;
  recoverKart(k);
  let impact = 0;
  for (let i = 0; i < steps; i++) impact = Math.max(impact, integrateKart(k, input, boosted, step));
  return impact;
}

function integrateKart(k: KartState, input: Input, boosted: boolean|number, dt: number): number {
  const multiplier=typeof boosted==='number'?clamp(boosted,1,CONFIG.boostMultiplier):boosted?CONFIG.boostMultiplier:1;
  resolveCeilings(k);
  const oldX = k.x, oldY = k.y, oldZ = k.z, oldGround = groundHeight(k.x, k.z, k.y);
  const grounded = k.y <= oldGround + CONFIG.groundTolerance && k.vy <= CONFIG.groundTolerance;
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  let forward = k.vx * fx + k.vz * fz;
  let lateral = k.vx * fz - k.vz * fx;
  const acceleration = input.throttle < 0 ? (forward > 0.5 ? CONFIG.braking : CONFIG.reverseAcceleration) : CONFIG.acceleration;
  const traction = grounded ? 1 : CONFIG.airControl;
  // Torque tapers toward top speed instead of meeting a hard speed cap abruptly.
  const torque = input.throttle > 0 ? 0.9 + 0.1 * (1 - clamp(Math.abs(forward) / CONFIG.maxSpeed, 0, 1)) ** 2 : 1;
  const wasBraking = input.throttle < 0 && forward > 0.5;
  forward += input.throttle * acceleration * (multiplier>1 ? 1 : torque) * traction * dt;
  if (wasBraking && forward < 0) forward = 0;
  forward *= Math.exp(-(input.throttle === 0 ? 1.6 : 0.45) * dt);
  const maximum = CONFIG.maxSpeed * multiplier;
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
  resolveWalls(k); resolveRampSides(k, { x: oldX, y: oldY, z: oldZ });
  const impact = Math.max(0, contactSpeed - Math.hypot(k.vx, k.vz));
  const ground = groundHeight(k.x, k.z, k.y);
  // Supported motion never stores suspension/slope correction as ballistic velocity.
  // Only a real crest/ledge departure can launch, using a bounded approach slope.
  const previousGround = groundHeight(oldX - k.vx * dt, oldZ - k.vz * dt, oldY);
  const earlierGround = groundHeight(oldX - k.vx * dt * 2, oldZ - k.vz * dt * 2, oldY);
  // A step straddling the triangular crest can average its rise to almost zero.
  // Retain the preceding approach grade so launch strength doesn't depend on tick alignment.
  const previousRise = Math.max(oldGround - previousGround, previousGround - earlierGround);
  // Small painted curbs are traversable steps, never launch ramps.
  const onLaunchRamp=RAMPS.some(r=>{const p=toLocal(oldX,oldZ,r);return Math.abs(p.x)<r.width/2 && Math.abs(p.z)<r.depth/2+.5;});
  const crest = onLaunchRamp && grounded && oldGround > CONFIG.maxStepHeight && previousRise > 0.002 && ground <= oldGround + 1e-9 && Math.hypot(k.vx, k.vz) >= CONFIG.rampJumpSpeed;
  if (crest) {
    k.vy = clamp(previousRise / dt * 0.85, 0, CONFIG.maxJumpVelocity);
    k.y += k.vy * dt;
  } else if (grounded && ground >= oldGround - CONFIG.groundSnapDistance) {
    k.y = ground; k.vy = 0;
  } else {
    k.vy = Math.max(-CONFIG.terminalVelocity, k.vy - CONFIG.gravity * dt); k.y += k.vy * dt;
    if (k.y <= ground) { k.y = ground; k.vy = 0; }
  }
  resolveCeilings(k);
  recoverKart(k);
  return impact;
}

/** Vertical roof contacts cannot turn a jump into an enormous sideways impulse. */
export function resolveCeilings(k: KartState) {
  for (const wall of queryWalls(k.x-1,k.z-1,k.x+1,k.z+1)) {
    const base = wall.base ?? 0;
    if (!base || k.y >= base || k.y + CONFIG.kartHeight <= base) continue;
    if (Math.abs(toLocal(k.x, k.z, wall).x) > wall.width / 2 + CONFIG.kartRadius || Math.abs(toLocal(k.x, k.z, wall).z) > wall.depth / 2 + CONFIG.kartRadius) continue;
    k.y = Math.max(groundHeight(k.x, k.z, k.y), base - CONFIG.kartHeight); k.vy = Math.min(0, k.vy);
  }
}

function limitHorizontalVelocity(k: KartState) {
  const speed = Math.hypot(k.vx, k.vz), maximum = CONFIG.maxSpeed * CONFIG.boostMultiplier;
  if (speed > maximum) { k.vx *= maximum / speed; k.vz *= maximum / speed; }
}

/** Vertical ramp faces are contacts, not instantly climbable heightfield steps. */
export function resolveRampSides(k: KartState, previous?: { x: number; y: number; z: number }) {
  for (const r of RAMPS) {
    const local = toLocal(k.x, k.z, r);
    if (Math.abs(local.z) >= r.depth / 2) continue;
    const height = rampHeight(r, local.z + r.z);
    if (previous) {
      const before=toLocal(previous.x,previous.z,r);
      const supported=Math.abs(before.z)<r.depth/2 && Math.abs(before.x)<rampHalfWidth(r,before.z) && previous.y>=rampHeight(r,before.z+r.z)-CONFIG.groundTolerance;
      const enteredMouth=Math.abs(before.z)>=r.depth/2 && Math.abs(before.x)<(r.endWidth??r.width)/2;
      // Side-contact rejection must not mistake legitimate steep forward ascent for a wall.
      if(supported||enteredMouth)continue;
    }
    const halfWidth=rampHalfWidth(r,local.z), plateau=(r.plateau??0)/2;
    const slope=Math.abs(local.z)>plateau ? ((r.endWidth??r.width)-r.width)/2/(r.depth/2-plateau)*Math.sign(local.z) : 0;
    const length=Math.hypot(1,slope), distance=(Math.abs(local.x)-halfWidth)/length;
    if (k.y + CONFIG.maxStepHeight >= height || distance >= CONFIG.kartRadius) continue;
    const nx=(local.x<0?-1:1)/length,nz=-slope/length,c=Math.cos(r.yaw??0),s=Math.sin(r.yaw??0);
    Object.assign(k,toWorld(local.x+nx*(CONFIG.kartRadius-distance),local.z+nz*(CONFIG.kartRadius-distance),r));
    const worldX=nx*c+nz*s,worldZ=-nx*s+nz*c,into=k.vx*worldX+k.vz*worldZ;
    if(into<0){k.vx-=(1+CONFIG.wallRestitution)*into*worldX;k.vz-=(1+CONFIG.wallRestitution)*into*worldZ;}
  }
}

/** Recover corrupted/stuck states identically on client and server, without freezing real jumps. */
export function recoverKart(k: KartState) {
  if (!Number.isFinite(k.x)) k.x = SPAWNS[0]!.x;
  if (!Number.isFinite(k.z)) k.z = SPAWNS[0]!.z;
  if (!Number.isFinite(k.yaw)) k.yaw = 0;
  k.yawRate = Number.isFinite(k.yawRate) ? clamp(k.yawRate!, -CONFIG.maxYawRate, CONFIG.maxYawRate) : 0;
  const bounded = arenaClamp(k.x, k.z, 1 + CONFIG.kartRadius);
  if (bounded.x !== k.x || bounded.z !== k.z) {
    const dx = k.x - bounded.x, dz = k.z - bounded.z, length = Math.hypot(dx, dz), nx = dx / length, nz = dz / length;
    const outward = k.vx * nx + k.vz * nz;
    if (outward > 0) { k.vx -= outward * nx; k.vz -= outward * nz; }
    k.x = bounded.x; k.z = bounded.z;
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
  const grounded = Math.abs(k.y - groundHeight(k.x, k.z, k.y)) < 0.12 && Math.abs(k.vy) < 0.2;
  return { speed, forward, lateral, slip, grounded, sliding: grounded && speed > 5 && Math.abs(lateral) > 1.1 && slip > 0.12 };
}

export function resolveWalls(k: KartState): void {
  for (const w of queryWalls(k.x-1,k.z-1,k.x+1,k.z+1)) {
    const base = w.base ?? 0;
    if (k.y >= base + w.height - 1e-7 || k.y + CONFIG.kartHeight <= base) continue;
    // The wheel approaches a deck on its continuous road slope before this tick's
    // support snap. Permit the small final step, while keeping the underside solid.
    if(w.style==='deck'&&k.y>=base+w.height-CONFIG.maxStepHeight)continue;
    const local = toLocal(k.x, k.z, w);
    const minX = -w.width / 2, maxX = w.width / 2, minZ = -w.depth / 2, maxZ = w.depth / 2;
    const cx = clamp(local.x, minX, maxX), cz = clamp(local.z, minZ, maxZ);
    let dx = local.x - cx, dz = local.z - cz, d = Math.hypot(dx, dz);
    if (d >= CONFIG.kartRadius) continue;
    if (d < 1e-8) {
      const sides = [{ v: local.x - minX, x: -1, z: 0 }, { v: maxX - local.x, x: 1, z: 0 }, { v: local.z - minZ, x: 0, z: -1 }, { v: maxZ - local.z, x: 0, z: 1 }].sort((a, b) => a.v - b.v);
      const side = sides[0]!; dx = side.x; dz = side.z;
      local.x += dx * (side.v + CONFIG.kartRadius); local.z += dz * (side.v + CONFIG.kartRadius); d = 1;
    } else { dx /= d; dz /= d; local.x += dx * (CONFIG.kartRadius - d); local.z += dz * (CONFIG.kartRadius - d); }
    Object.assign(k, toWorld(local.x, local.z, w));
    const c = Math.cos(w.yaw ?? 0), s = Math.sin(w.yaw ?? 0), localNormalX = dx;
    dx = localNormalX * c + dz * s; dz = -localNormalX * s + dz * c;
    const into = k.vx * dx + k.vz * dz;
    if (into < 0) { k.vx -= dx * into * (1 + CONFIG.wallRestitution); k.vz -= dz * into * (1 + CONFIG.wallRestitution); }
  }
}

export function collideKarts(a: KartState, b: KartState): number {
  if (Math.abs(a.y - b.y) > 1.5) return 0;
  let dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), minimum = CONFIG.kartRadius * 2;
  if (d >= minimum) return 0;
  const groundedA = Math.abs(a.y - groundHeight(a.x, a.z, a.y)) < CONFIG.groundTolerance && a.vy <= 0;
  const groundedB = Math.abs(b.y - groundHeight(b.x, b.z, b.y)) < CONFIG.groundTolerance && b.vy <= 0;
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
    if (grounded && k.y <= groundHeight(k.x, k.z, k.y) + CONFIG.groundSnapDistance) { k.y = groundHeight(k.x, k.z, k.y); k.vy = 0; }
    recoverKart(k);
  }
  return Math.max(0, closing);
}
