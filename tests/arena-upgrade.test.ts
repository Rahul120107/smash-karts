import { describe, expect, it } from 'vitest';
import { ARENA_SIZE, groundHeight, PICKUP_POSITIONS, rampHeight, rampProfile, RAMPS, SPAWNS, WALLS } from '../shared/src/arena.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { drivingTelemetry, moveKart, NEUTRAL, resolveWalls } from '../shared/src/movement.js';
import { terrainHit, wallHit } from '../server/src/collisions/projectile.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { WEAPONS } from '../shared/src/weapons.js';
import { duel, equip } from './helpers.js';
const kart = (x = -8, z = 0) => ({ x, z, y: groundHeight(x, z), yaw: 0, vx: 0, vy: 0, vz: 0, yawRate: 0 });

describe('expanded collision-aligned arena', () => {
  it('provides between two and three times the old area with distributed pickups and safe spawns', () => {
    expect((ARENA_SIZE / 72) ** 2).toBeGreaterThan(2); expect((ARENA_SIZE / 72) ** 2).toBeLessThan(3);
    expect(PICKUP_POSITIONS).toHaveLength(30); expect(RAMPS).toHaveLength(5);
    for (const spawn of [...SPAWNS, ...PICKUP_POSITIONS]) {
      expect(Math.abs(spawn.x)).toBeLessThan(ARENA_SIZE / 2 - 1); expect(Math.abs(spawn.z)).toBeLessThan(ARENA_SIZE / 2 - 1);
      const k = kart(spawn.x, spawn.z); resolveWalls(k); expect(k.x).toBe(spawn.x); expect(k.z).toBe(spawn.z);
      if ('y' in spawn) expect(spawn.y).toBeCloseTo(groundHeight(spawn.x, spawn.z));
    }
    expect(PICKUP_POSITIONS.filter(p => Math.abs(p.x) > 36 || Math.abs(p.z) > 36).length).toBeGreaterThanOrEqual(12);
  });
  it.each([0, Math.PI / 2, Math.PI, -Math.PI / 2])('retains a boosted kart inside boundary at yaw %s', yaw => {
    const k = { ...kart(), yaw };
    for (let i = 0; i < 600; i++) { moveKart(k, { ...NEUTRAL, throttle: 1 }, true); expect(Math.abs(k.x)).toBeLessThanOrEqual(ARENA_SIZE / 2 - 1 - CONFIG.kartRadius + 1e-8); expect(Math.abs(k.z)).toBeLessThanOrEqual(ARENA_SIZE / 2 - 1 - CONFIG.kartRadius + 1e-8); }
  });
  it('matches rendered ramp profiles, heightfield support, and projectile terrain contacts', () => {
    for (const ramp of RAMPS) {
      const profile = rampProfile(ramp);
      for (let i = 1; i < profile.length; i++) {
        const [za, ya] = profile[i - 1]!, [zb, yb] = profile[i]!; if (za === zb) continue;
        for (let t = 0; t <= 1; t += 0.1) {
          const z = za + (zb - za) * t, height = ya + (yb - ya) * t;
          expect(rampHeight(ramp, z)).toBeCloseTo(height, 8); expect(groundHeight(ramp.x, z)).toBeCloseTo(height, 8);
        }
      }
      expect(terrainHit({ x: ramp.x, y: ramp.height + 1, z: ramp.z }, { x: ramp.x, y: ramp.height - 1, z: ramp.z }, 0.1)).not.toBeNull();
      const k = kart(ramp.x - ramp.width / 2 - 0.8, ramp.z); Object.assign(k, { yaw: Math.PI / 2, vx: 21 });
      for (let i = 0; i < 20; i++) moveKart(k, { ...NEUTRAL, throttle: 1 }); expect(k.y).toBe(0); expect(k.vy).toBe(0);
    }
  });
  it('uses visible obstacle bounds for both kart contacts and weapon occlusion', () => {
    for (const w of WALLS.slice(4)) {
      const k = kart(w.x, w.z); resolveWalls(k);
      expect(Math.abs(k.x - w.x) >= w.width / 2 + CONFIG.kartRadius - 1e-8 || Math.abs(k.z - w.z) >= w.depth / 2 + CONFIG.kartRadius - 1e-8).toBe(true);
      expect(wallHit({ x: w.x - w.width - 2, y: 0.7, z: w.z }, { x: w.x + w.width + 2, y: 0.7, z: w.z })).not.toBeNull();
    }
  });
});
describe('traction, steering inertia and cannon ballistics', () => {
  it.each([[-8, -18], [8, 18], [0, -24], [0, 24], [-34, -20], [34, 20], [0, -46], [26, 46]])('stays grounded while accelerating and braking on flat ground at %s,%s', (x, z) => {
    const k = kart(x, z);
    for (let i = 0; i < 90; i++) {
      moveKart(k, { ...NEUTRAL, throttle: i < 30 ? 1 : i < 60 ? -1 : 0 });
      expect(groundHeight(k.x, k.z)).toBe(0); expect(k.y).toBe(0); expect(k.vy).toBe(0);
    }
  });
  it('smooths steering changes and reduces wheel angle at higher speeds', () => {
    const slow = { ...kart(), vz: 7 }, fast = { ...kart(), vz: 21 };
    moveKart(slow, { ...NEUTRAL, steer: 1 }); moveKart(fast, { ...NEUTRAL, steer: 1 });
    const response = 1 - Math.exp(-CONFIG.steeringResponse * DT);
    expect(fast.yawRate).toBeLessThanOrEqual(CONFIG.maxYawRate * response + 1e-8);
    expect(fast.yawRate / fast.vz).toBeLessThan(slow.yawRate / slow.vz);
    const before = fast.yawRate; moveKart(fast, { ...NEUTRAL, steer: -1 }); expect(fast.yawRate).toBeGreaterThan(-before);
  });
  it('retains controlled drift slip and regains grip smoothly after release', () => {
    const k = { ...kart(), vx: -6, vz: 18 };
    for (let i = 0; i < 20; i++) moveKart(k, { ...NEUTRAL, drift: true, steer: 0.4, throttle: 1 });
    const slip = drivingTelemetry(k).slip; expect(slip).toBeGreaterThan(0.12);
    for (let i = 0; i < 40; i++) moveKart(k, { ...NEUTRAL, throttle: 1 });
    expect(drivingTelemetry(k).slip).toBeLessThan(slip / 2); expect(k.y).toBe(0);
  });
  it('applies little steering or traction in flight without erasing vertical motion', () => {
    const ground = { ...kart(), vz: 15 }, air = { ...ground, y: 2, vy: 2 };
    moveKart(ground, { ...NEUTRAL, steer: 1, throttle: 1 }); moveKart(air, { ...NEUTRAL, steer: 1, throttle: 1 });
    expect(air.yawRate).toBeLessThan(ground.yawRate); expect(air.vy).toBeGreaterThan(0); expect(air.y).toBeGreaterThan(2);
  });
  it('launches substantial cannonballs slower than bullets along a gravity-driven arc', () => {
    const { world, a, b } = duel(); b.z = 40; equip(a, 'cannon'); activate(world, a);
    const balls = [...world.projectiles.values()]; expect(balls).toHaveLength(1);
    for (const ball of balls) { expect(ball.kind).toBe('cannonball'); expect(ball.radius).toBeGreaterThan(0.4); expect(Math.hypot(ball.vx, ball.vz)).toBeLessThan(WEAPONS.machineGun.speed / 2); }
    const ball = balls[0]!, firstY = ball.y, firstVy = ball.vy;
    world.time += DT; stepProjectiles(world); expect(ball.y).toBeGreaterThan(firstY); expect(ball.vy).toBeCloseTo(firstVy - CONFIG.gravity * DT);
    for (let i = 0; i < 90; i++) { world.time += DT; stepProjectiles(world); }
    expect(world.projectiles.size).toBe(0); expect(world.events.some(e => e.kind === 'explosion' && e.weapon === 'cannon')).toBe(true); expect(a.health).toBe(100);
  });
});
