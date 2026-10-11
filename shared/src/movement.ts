import { CONFIG, DT } from './config.js';
import { groundHeight, WALLS } from './arena.js';
import { clamp } from './math.js';
import type { Input, KartState } from './types.js';
export const NEUTRAL: Input = { seq: 0, throttle: 0, steer: 0, fire: false, drift: false };

/** Shared arcade dynamics. Circle/wall contacts plus heightfield suspension, no vehicle engine needed. */
export function moveKart(k: KartState, input: Input, boosted = false, dt = DT): void {
  const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
  let forward = k.vx * fx + k.vz * fz;
  let lateral = k.vx * fz - k.vz * fx;
  const acceleration = input.throttle < 0 ? (forward > 0.5 ? CONFIG.braking : CONFIG.reverseAcceleration) : CONFIG.acceleration;
  forward += input.throttle * acceleration * dt;
  forward *= Math.exp(-(input.throttle === 0 ? 1.6 : 0.45) * dt);
  const maximum = CONFIG.maxSpeed * (boosted ? CONFIG.boostMultiplier : 1);
  forward = clamp(forward, -CONFIG.reverseSpeed, maximum);
  lateral *= Math.exp(-(input.drift ? 2.2 : 10) * dt);
  const turn = CONFIG.steering * clamp(Math.abs(forward) / 6, 0, 1) / (1 + Math.abs(forward) / 48);
  k.yaw += input.steer * turn * Math.sign(forward) * dt * (input.drift ? 1.18 : 1);
  k.yaw = Math.atan2(Math.sin(k.yaw), Math.cos(k.yaw));
  // Retain a fraction of world momentum for controlled slides; normal driving grips strongly.
  const nx = Math.sin(k.yaw), nz = Math.cos(k.yaw);
  const targetX = nx * forward + nz * lateral, targetZ = nz * forward - nx * lateral;
  const grip = 1 - Math.exp(-(input.drift ? 4 : 24) * dt);
  k.vx = fx * forward + fz * lateral; k.vz = fz * forward - fx * lateral;
  k.vx += (targetX - k.vx) * grip; k.vz += (targetZ - k.vz) * grip;
  const oldGround = groundHeight(k.x, k.z);
  k.x += k.vx * dt; k.z += k.vz * dt;
  const ground = groundHeight(k.x, k.z);
  const grounded = k.y <= oldGround + 0.08 && k.vy <= 1;
  if (grounded && ground >= oldGround - 0.025) {
    k.y = ground; k.vy = Math.max(0, (ground - oldGround) / dt);
  } else {
    k.vy -= CONFIG.gravity * dt; k.y += k.vy * dt;
    if (k.y <= ground) { k.y = ground; k.vy = 0; }
  }
  resolveWalls(k);
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
    if (into < 0) { k.vx -= dx * into * 1.15; k.vz -= dz * into * 1.15; }
  }
}

export function collideKarts(a: KartState, b: KartState): void {
  if (Math.abs(a.y - b.y) > 1.5) return;
  let dx = b.x - a.x, dz = b.z - a.z;
  const d = Math.hypot(dx, dz), minimum = CONFIG.kartRadius * 2;
  if (d >= minimum) return;
  if (d < 1e-8) { dx = 1; dz = 0; } else { dx /= d; dz /= d; }
  const push = (minimum - d) / 2;
  a.x -= dx * push; a.z -= dz * push; b.x += dx * push; b.z += dz * push;
  const closing = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
  if (closing > 0) { const impulse = closing * 0.65; a.vx -= dx * impulse; a.vz -= dz * impulse; b.vx += dx * impulse; b.vz += dz * impulse; }
  resolveWalls(a); resolveWalls(b);
}
