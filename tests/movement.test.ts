import { describe, expect, it } from 'vitest';
import { CONFIG, DT } from '../shared/src/config.js';
import { ARENA_SIZE, groundHeight, RAMPS } from '../shared/src/arena.js';
import { collideKarts, moveKart, NEUTRAL, resolveWalls } from '../shared/src/movement.js';
import { segmentBox, segmentSphere } from '../shared/src/math.js';
const kart = () => ({ x: -12, y: 0, z: -20, yaw: 0, vx: 0, vy: 0, vz: 0 });
describe('shared kart dynamics', () => {
  it('accelerates, respects maximum speed, brakes, reverses, and coasts to rest', () => {
    const k = kart();
    for (let i = 0; i < 90; i++) moveKart(k, { ...NEUTRAL, throttle: 1 });
    expect(k.vz).toBeGreaterThan(18); expect(Math.hypot(k.vx, k.vz)).toBeLessThanOrEqual(CONFIG.maxSpeed);
    for (let i = 0; i < 50; i++) moveKart(k, { ...NEUTRAL, throttle: -1 });
    expect(k.vz).toBeLessThan(0); expect(k.vz).toBeGreaterThanOrEqual(-CONFIG.reverseSpeed);
    for (let i = 0; i < 180; i++) moveKart(k, NEUTRAL);
    expect(Math.hypot(k.vx, k.vz)).toBeLessThan(0.15);
  });
  it('steers only with motion and retains more lateral momentum while drifting', () => {
    const still = kart(); moveKart(still, { ...NEUTRAL, steer: 1 }); expect(still.yaw).toBe(0);
    const normal = { ...kart(), vx: 5, vz: 10 }, sliding = { ...normal };
    for (let i = 0; i < 10; i++) { moveKart(normal, { ...NEUTRAL, steer: 1 }); moveKart(sliding, { ...NEUTRAL, steer: 1, drift: true }); }
    expect(sliding.yaw).toBeGreaterThan(normal.yaw); expect(sliding.x).toBeGreaterThan(normal.x);
  });
  it('prevents wall penetration, including centers inside an obstacle', () => {
    const k = { ...kart(), x: ARENA_SIZE / 2 - 1.2, z: 25, vx: 20 }; resolveWalls(k);
    expect(k.x).toBeLessThanOrEqual(ARENA_SIZE / 2 - 1 - CONFIG.kartRadius + 1e-8);
    expect(k.vx).toBeLessThanOrEqual(0);
    const inside = { ...kart(), x: 15, z: 22 }; resolveWalls(inside);
    expect(Math.abs(inside.z-22)).toBeGreaterThanOrEqual(.6 + CONFIG.kartRadius - 1e-8);
  });
  it('separates karts and exchanges collision momentum', () => {
    const a = { ...kart(), x: -12, vx: 10 }, b = { ...kart(), x: -11, vx: 0 }; collideKarts(a, b);
    expect(b.x - a.x).toBeCloseTo(CONFIG.kartRadius * 2); expect(b.vx).toBeGreaterThan(0); expect(a.vx).toBeLessThan(10);
  });
  it('follows ramps, becomes airborne, and lands without sinking', () => {
    const k = { ...kart(), x: -40, z: 35, y: groundHeight(-40,35), vz: CONFIG.maxSpeed }; let peak = 0, airborne = false;
    for (let i = 0; i < 180; i++) { moveKart(k, { ...NEUTRAL, throttle: 1 }); peak = Math.max(peak, k.y); airborne ||= k.y > groundHeight(k.x, k.z) + 0.1; expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x, k.z) - 0.001); }
    expect(peak).toBeGreaterThan(RAMPS[6]!.height); expect(airborne).toBe(true);
    for (let i = 0; i < 200; i++) moveKart(k, NEUTRAL); expect(k.y).toBeCloseTo(groundHeight(k.x, k.z));
  });
  it('uses identical prediction and authoritative trajectories for identical commands', () => {
    const a = kart(), b = kart();
    for (let i = 0; i < 200; i++) { const c = { ...NEUTRAL, throttle: 1, steer: Math.sin(i * DT) * 0.4 }; moveKart(a, c); moveKart(b, c); }
    expect(a).toEqual(b);
  });
});
describe('swept collision primitives', () => {
  it('finds a target between distant endpoints and rejects off-axis spheres', () => {
    const a = { x: 0, y: 1, z: 0 }, b = { x: 0, y: 1, z: 100 };
    expect(segmentSphere(a, b, { x: 0, y: 1, z: 50 }, 1)).toBeCloseTo(0.49);
    expect(segmentSphere(a, b, { x: 3, y: 1, z: 50 }, 1)).toBeNull();
    expect(segmentSphere(a, a, a, 1)).toBe(0);
  });
  it('handles parallel segments, box intersection, and misses', () => {
    const min = { x: -1, y: 0, z: 5 }, max = { x: 1, y: 2, z: 6 };
    expect(segmentBox({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: 10 }, min, max)).toBeCloseTo(0.5);
    expect(segmentBox({ x: 2, y: 1, z: 0 }, { x: 2, y: 1, z: 10 }, min, max)).toBeNull();
  });
});
