import { describe, expect, it } from 'vitest';
import { DT } from '../shared/src/config.js';
import { clearShot, interceptTime, machineGunAim } from '../shared/src/aim.js';
import { WEAPONS } from '../shared/src/weapons.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { parseMessage } from '../server/src/networking/validation.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { advance, duel, equip } from './helpers.js';

describe('server machine-gun aim assistance', () => {
  it('prefers the forward aiming direction over a closer off-axis opponent', () => {
    const { world, a, b } = duel(); Object.assign(b, { x: -5, z: 10 });
    const c = world.addPlayer('c', 'Center'); Object.assign(c, { x: -8, z: 22, invulnerableUntil: 0 });
    expect(machineGunAim(a, world.players.values()).target?.id).toBe(c.id);
  });
  it('rejects dead, protected, behind, out-of-cone and out-of-range candidates', () => {
    const { world, a, b } = duel();
    for (const values of [{ health: 0 }, { health: 100, invulnerableUntil: 2 }, { invulnerableUntil: 0, z: -5 }, { x: 3, z: 8 }, { x: -8, z: 29 }]) {
      Object.assign(b, values); expect(machineGunAim(a, world.players.values()).target).toBeNull();
    }
  });
  it('does not assist through walls or ramp sides', () => {
    const { world, a, b } = duel(); Object.assign(a, { x: 0, z: -8 }); Object.assign(b, { x: 0, z: 8 });
    expect(machineGunAim(a, world.players.values()).target).toBeNull();
    expect(clearShot({ x: -28, y: 0.85, z: 0 }, { x: -18, y: 0.65, z: 0 })).toBe(false);
  });
  it('solves intercept time and leads a moving opponent', () => {
    const t = interceptTime({ x: 0, y: 0, z: 20 }, { x: 10, y: 0, z: 0 }, 76);
    expect(Math.hypot(t * 10, 20)).toBeCloseTo(t * 76);
    const { world, a, b } = duel(); Object.assign(b, { z: 18, vx: 12 });
    const aim = machineGunAim(a, world.players.values()); expect(aim.point!.x).toBeGreaterThan(b.x); expect(aim.direction.x).toBeGreaterThan(0);
    world.random = () => 0.5; equip(a, 'machineGun'); activate(world, a); expect(world.projectiles.values().next().value!.vx).toBeGreaterThan(0);
  });
  it('bounds correction and switches away from an invalid target', () => {
    const { world, a, b } = duel(); Object.assign(b, { x: -8 + Math.sin(0.5) * 14, z: Math.cos(0.5) * 14 });
    const aim = machineGunAim(a, world.players.values()); expect(aim.target?.id).toBe(b.id);
    expect(Math.atan2(aim.direction.x, aim.direction.z)).toBeCloseTo(WEAPONS.machineGun.aimAssist!.maxCorrection);
    a.aimTarget = b.id; b.health = 0; const c = world.addPlayer('c', 'New target'); Object.assign(c, { x: -8, z: 15, invulnerableUntil: 0 });
    expect(machineGunAim(a, world.players.values()).target?.id).toBe(c.id);
  });
  it('does not damage opponents beyond the configured range, even with swept fast bullets', () => {
    const { world, a, b } = duel(); b.z = WEAPONS.machineGun.aimAssist!.range + 0.5;
    equip(a, 'machineGun'); activate(world, a); world.projectiles.values().next().value!.vz = 2000; world.step();
    expect(b.health).toBe(100); expect(world.projectiles.size).toBe(0);
  });
  it('allows a moving opponent to dodge an assisted shot after changing direction', () => {
    const { world, a, b } = duel(); Object.assign(b, { z: 18, vx: 14 }); world.random = () => 0.5;
    equip(a, 'machineGun'); activate(world, a); b.vx = -20;
    for (let i = 0; i < 30; i++) { b.x += b.vx * DT; world.time += DT; stepProjectiles(world); }
    expect(b.health).toBe(100); expect(world.projectiles.size).toBe(0);
  });
  it('retains authoritative damage, ammo and cooldown and publishes target feedback', () => {
    const { world, a, b } = duel(); b.x += 1; equip(a, 'machineGun');
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }]); world.step();
    expect(a.aimTarget).toBe(b.id); expect(a.ammo).toBe(29); expect(activate(world, a)).toBe(false);
    advance(world, 0.12); expect(b.health).toBe(100 - WEAPONS.machineGun.damage);
  });
  it('does not trust client target or damage claims in control packets', () => {
    const message = parseMessage(JSON.stringify({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, fire: true, target: 'victim', damage: 99999 }] }));
    expect(message).toEqual({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, fire: true }] });
  });
});
