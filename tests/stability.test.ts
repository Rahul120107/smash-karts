import { describe, expect, it } from 'vitest';
import { CONFIG, DT } from '../shared/src/config.js';
import { ARENA_SIZE, groundHeight } from '../shared/src/arena.js';
import { collideKarts, drivingTelemetry, moveKart, NEUTRAL } from '../shared/src/movement.js';
import { Prediction } from '../client/src/networking/prediction.js';
import { duel } from './helpers.js';
const kart = () => ({ x: -12, y: 0, z: -20, yaw: 0, vx: 0, vy: 0, vz: 0 });

describe('arcade stability regressions', () => {
  it('treats a high-speed ramp side as a contact, never a 156-unit/s launch', () => {
    const k = { ...kart(), x: -45.05, z: 0, yaw: Math.PI / 2, vx: 20 };
    for (let i = 0; i < 180; i++) { moveKart(k, { ...NEUTRAL, throttle: 1 }); expect(k.y).toBe(0); expect(k.vy).toBe(0); }
    expect(k.x).toBeLessThanOrEqual(-45-CONFIG.kartRadius);
  });
  it('stays grounded on an ascending ramp, including slow driving and stopping', () => {
    const k = { ...kart(), x: -40, z: 35, y: groundHeight(-40, 35), vz: 3 };
    for (let i = 0; i < 30; i++) { moveKart(k, NEUTRAL); expect(k.y).toBeCloseTo(groundHeight(k.x, k.z), 8); expect(k.vy).toBe(0); }
  });
  it('jumps at a crest, bounds airtime/height, and lands without rebound', () => {
    const k = { ...kart(), x: -40, z: 35, y: groundHeight(-40, 35), vz: 21 }; let airborne = false, peak = 0;
    for (let i = 0; i < 180; i++) { moveKart(k, { ...NEUTRAL, throttle: 1 }); airborne ||= k.y > groundHeight(k.x, k.z) + 0.2; peak = Math.max(peak, k.y); expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity); }
    expect(airborne).toBe(true); expect(peak).toBeGreaterThan(1.2); expect(peak).toBeLessThan(2.3); expect(k.y).toBe(0); expect(k.vy).toBe(0);
  });
  it('holds support when descending slowly and falls predictably after leaving a ramp edge', () => {
    const descending = { ...kart(), x: -40, z: 45, y: groundHeight(-40, 45), vz: 4 };
    for (let i = 0; i < 60; i++) { moveKart(descending, NEUTRAL); expect(descending.y).toBeCloseTo(groundHeight(descending.x, descending.z)); expect(descending.vy).toBe(0); }
    const edge = { ...kart(), x: -42, z: 40, y: 1.2, yaw: Math.PI / 2, vx: 15 }; let peak = 0, fell = false;
    for (let i = 0; i < 40; i++) { moveKart(edge, { ...NEUTRAL, throttle: 1 }); peak = Math.max(peak, edge.y); fell ||= edge.vy < 0; }
    expect(fell).toBe(true); expect(peak).toBeLessThanOrEqual(1.2); expect(edge.y).toBe(0); expect(edge.vy).toBe(0);
  });
  it('produces the same crest impulse for different tick alignments along the ramp', () => {
    for (let phase = 0; phase < 64; phase++) {
      const z = 35 + phase * 21 * DT / 64, k = { ...kart(), x: -40, z, y: groundHeight(-40, z), vz: 21 };
      let launch = 0, peak = 0;
      for (let i = 0; i < 100; i++) { moveKart(k, { ...NEUTRAL, throttle: 1 }); launch = Math.max(launch, k.vy); peak = Math.max(peak, k.y); }
      expect(launch).toBeCloseTo(CONFIG.maxJumpVelocity, 6); expect(peak).toBeGreaterThan(1.2); expect(peak).toBeLessThan(2.3); expect(k.y).toBe(0);
    }
  });
  it('keeps an eight-kart pileup stable across flat lanes and the elevated platform', () => {
    const { world, a } = duel();
    for (let i = 2; i < 8; i++) world.addPlayer(String(i), 'Racer ' + i);
    const participants = [...world.players.values()];
    participants.forEach((p, i) => Object.assign(p, { x: -12 + (i % 2) * 0.2, y: 0, z: 0 + Math.floor(i / 2) * 0.2, vx: 0, vy: 0, vz: 20, yaw: i % 2 ? Math.PI : 0 }));
    for (let tick = 0; tick < 360; tick++) {
      for (const p of participants) world.enqueue(p.id, [{ ...NEUTRAL, seq: tick + 1, throttle: 1 }]);
      world.step();
      for (const p of participants) {
        if (tick < 60) { expect(p.y).toBe(0); expect(p.vy).toBe(0); }
        expect(p.y).toBeGreaterThanOrEqual(groundHeight(p.x, p.z) - 1e-8); expect(p.y).toBeLessThan(5);
        expect(p.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity); expect(Math.hypot(p.vx, p.vz)).toBeLessThanOrEqual(CONFIG.maxSpeed * CONFIG.boostMultiplier + 1e-8);
      }
    }
    expect(a.health).toBe(100);
  });
  it('never creates vertical velocity or energy in repeated flat kart collisions', () => {
    const a = { ...kart(), vx: 21 }, b = { ...kart(), x: -11, vx: -21 };
    const before = a.vx ** 2 + b.vx ** 2;
    for (let i = 0; i < 100; i++) { collideKarts(a, b); expect(a.y).toBe(0); expect(b.y).toBe(0); expect(a.vy).toBe(0); expect(b.vy).toBe(0); }
    expect(a.vx ** 2 + b.vx ** 2).toBeLessThanOrEqual(before); expect(b.x - a.x).toBeCloseTo(2 * CONFIG.kartRadius);
  });
  it('bounds height, speed and yaw under 10,000 high-speed steering steps across the arena', () => {
    const k = { ...kart(), x: 8, z: -20, vz: 30 };
    for (let i = 0; i < 10000; i++) {
      const yaw = k.yaw; moveKart(k, { ...NEUTRAL, throttle: 1, steer: Math.sin(i / 40), drift: i % 180 < 40 }, true);
      const delta = Math.atan2(Math.sin(k.yaw - yaw), Math.cos(k.yaw - yaw)); expect(Math.abs(delta)).toBeLessThanOrEqual(CONFIG.maxYawRate * DT + 1e-8);
      expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x, k.z) - 1e-8); expect(k.y).toBeLessThan(5);
      expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity); expect(Math.hypot(k.vx, k.vz)).toBeLessThanOrEqual(CONFIG.maxSpeed * CONFIG.boostMultiplier + 1e-8);
    }
  });
  it('recovers corrupt/out-of-bounds state and separates a kart stuck in a wall', () => {
    const k = { ...kart(), x: Infinity, z: 90, y: 260, vx: NaN, vy: 156, yaw: NaN }; moveKart(k, NEUTRAL);
    expect(Object.values(k).every(Number.isFinite)).toBe(true); expect(k.y).toBe(0); expect(Math.abs(k.z)).toBeLessThan(ARENA_SIZE / 2 - 1);
    k.x = 15; k.z = 22; k.y=0; moveKart(k, NEUTRAL); expect(Math.abs(k.z-22)).toBeGreaterThanOrEqual(.6 + CONFIG.kartRadius - 1e-8);
  });
  it('uses physical slip for drifting; parked, straight-driving and airborne karts are silent', () => {
    expect(drivingTelemetry(kart()).sliding).toBe(false); expect(drivingTelemetry({ ...kart(), vz: 20 }).sliding).toBe(false);
    expect(drivingTelemetry({ ...kart(), vx: 6, vz: 18 }).sliding).toBe(true); expect(drivingTelemetry({ ...kart(), y: 2, vx: 6, vz: 18 }).sliding).toBe(false);
  });
  it('uses identical fixed substeps for a longer frame and server ticks', () => {
    const a = kart(), b = kart(); const input = { ...NEUTRAL, throttle: 1, steer: 0.4 };
    moveKart(a, input, false, DT * 3); for (let i = 0; i < 3; i++) moveKart(b, input); expect(a).toEqual(b);
  });
  it('reconciles ramp traversal without retaining the original unstable vertical velocity', () => {
    const { world, a } = duel(); Object.assign(a, { x: -40, z: 35, y: groundHeight(-40, 35), vz: 18 });
    const prediction = new Prediction(); prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
    for (let i = 0; i < 120; i++) {
      const input = { ...NEUTRAL, seq: i + 1, throttle: 1 }; prediction.step(input, a, world.time); world.enqueue(a.id, [input]); world.step();
      if (i % 3 === 0) prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
      expect(prediction.kart!.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity); expect(prediction.kart!.y).toBeCloseTo(a.y, 6);
    }
  });
});
