import { describe, expect, it } from 'vitest';
import { collectPickups } from '../server/src/simulation/pickups.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { WEAPONS, WEAPON_IDS } from '../shared/src/weapons.js';
import { PICKUP_POSITIONS } from '../shared/src/arena.js';
import { parseMessage } from '../server/src/networking/validation.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { advance, duel } from './helpers.js';
describe('authoritative pickups', () => {
  it('grants a configured random weapon and only one player owns a contested pickup', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z }); Object.assign(b, { x: box.x, y: box.y, z: box.z });
    collectPickups(world); expect(a.weapon).toBe('machineGun'); expect(a.ammo).toBe(WEAPONS.machineGun.ammo); expect(b.weapon).toBeNull(); expect(box.availableAt).toBe(CONFIG.pickupDelay);
    expect(box.active).toBe(false); expect(world.snapshot('ABCDE', a.id, 8).pickups[0]!.active).toBe(false);
    expect(world.events.filter(e => e.kind === 'pickup')).toHaveLength(1);
  });
  it('respawns after its configurable delay and preserves an unused equipped weapon', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z }); collectPickups(world);
    Object.assign(b, { x: box.x, y: box.y, z: box.z }); a.x = -30; advance(world, CONFIG.pickupDelay - 0.1); expect(b.weapon).toBeNull(); advance(world, 0.2); expect(b.weapon).toBe('machineGun');
    const ammo = b.ammo; box.availableAt = 0; box.active = true; collectPickups(world); expect(b.ammo).toBe(ammo); expect(box.availableAt).toBe(0);
  });
  it('does not let dead players collect or players above/below a ramp collect remotely', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z, health: 0 }); Object.assign(b, { x: box.x, y: 4, z: box.z });
    collectPickups(world); expect(a.weapon).toBeNull(); expect(b.weapon).toBeNull(); expect(box.availableAt).toBe(0);
  });
  it('collects on kart contact during the authoritative movement tick', () => {
    const { world, a } = duel(), box = world.pickups[0]!;
    Object.assign(a, { x: box.x, y: box.y, z: box.z + 1.65, vz: -8 });
    expect(box.active).toBe(true); world.step();
    expect(box.active).toBe(false); expect(a.weapon).toBe('machineGun');
    expect(box.availableAt - world.time).toBe(10);
    expect(world.events.find(e => e.kind === 'pickup')).toMatchObject({ pickupId: box.id, player: a.id, at: world.time });
  });
  it.each(WEAPON_IDS)('preserves random assignment and configured ammo for %s', id => {
    const { world, a } = duel(), box = world.pickups[0]!;
    world.random = () => (WEAPON_IDS.indexOf(id) + 0.5) / WEAPON_IDS.length;
    Object.assign(a, { x: box.x, y: box.y, z: box.z }); collectPickups(world);
    expect(a.weapon).toBe(id); expect(a.ammo).toBe(WEAPONS[id].ammo); expect(box.active).toBe(false);
  });
  it.each([0, 1, 7, 13, 59, 61, 137, 599])('respawns exactly 600 ticks after collection at tick %i', tick => {
    const { world, a, b } = duel(); advance(world, tick * DT); const box = world.pickups[0]!;
    const original = { x: box.x, y: box.y, z: box.z };
    Object.assign(a, original); collectPickups(world); const collectedAt = world.time;
    Object.assign(a, { x: -30, z: 30 }); Object.assign(b, { x: 30, z: -30 });
    for (let i = 0; i < 599; i++) world.step();
    expect(box.active).toBe(false); expect(world.events.some(e => e.kind === 'pickupSpawn')).toBe(false);
    world.step(); expect(box.active).toBe(true); expect(box).toMatchObject(original);
    expect(world.time - collectedAt).toBeCloseTo(10, 12);
    expect(world.events.filter(e => e.kind === 'pickupSpawn')).toHaveLength(1);
    expect(world.events.find(e => e.kind === 'pickupSpawn')).toMatchObject({ pickupId: box.id, at: world.time });
    // It can be collected again immediately, then remains non-collidable during cooldown.
    Object.assign(b, original); collectPickups(world); expect(b.weapon).toBe('machineGun'); expect(box.active).toBe(false);
    Object.assign(a, original, { weapon: null }); collectPickups(world); expect(a.weapon).toBeNull();
  });
  it('runs independent deadlines and never destroys or moves the spawn locations', () => {
    const { world, a } = duel(), first = world.pickups[0]!, second = world.pickups[1]!;
    Object.assign(a, PICKUP_POSITIONS[0]); collectPickups(world);
    Object.assign(a, { x: -30, z: 30 }); advance(world, 1);
    Object.assign(a, PICKUP_POSITIONS[1], { weapon: null }); collectPickups(world);
    expect(first.availableAt).toBe(10); expect(second.availableAt).toBe(11);
    Object.assign(a, { x: -30, z: 30 }); advance(world, 9);
    expect(first.active).toBe(true); expect(second.active).toBe(false);
    advance(world, 1); expect(second.active).toBe(true); expect(world.pickups).toHaveLength(PICKUP_POSITIONS.length);
    world.pickups.forEach((box, i) => expect(box).toMatchObject(PICKUP_POSITIONS[i]!));
  });
  it('does not award weapons during cooldown even while a kart remains on a box', () => {
    const { world, a } = duel(), box = world.pickups[0]!;
    Object.assign(a, PICKUP_POSITIONS[0]); collectPickups(world); a.weapon = null; a.ammo = 0;
    for (let i = 0; i < 599; i++) world.step();
    expect(a.weapon).toBeNull(); expect(a.ammo).toBe(0); expect(box.active).toBe(false);
    world.step(); expect(a.weapon).toBe('machineGun'); expect(box.active).toBe(false);
    expect(world.events.filter(e => e.kind === 'pickupSpawn')).toHaveLength(1);
    expect(box.availableAt).toBe(20);
  });
  it('resets every pickup and old timer/event when a new match begins', () => {
    const { world, a } = duel(); Object.assign(a, PICKUP_POSITIONS[0]); collectPickups(world);
    world.start(); expect(world.time).toBe(0); expect(world.events).toEqual([]);
    expect(world.pickups.every(box => box.active && box.availableAt === 0)).toBe(true);
    Object.assign(a, PICKUP_POSITIONS[0]); world.step(); expect(a.weapon).toBe('machineGun'); expect(world.pickups[0]!.active).toBe(false);
  });
});
describe('network message validation and tick limits', () => {
  it('normalizes names/codes and rejects invalid room codes, unsupported combat claims, and oversized input', () => {
    expect(parseMessage(JSON.stringify({ type: 'join', name: ' Alpha ', code: ' abcd2 ' }))).toEqual({ type: 'join', name: 'Alpha', code: 'ABCD2' });
    for (const m of [{ type: 'join', name: 'a', code: '11111' }, { type: 'create', name: '' }, { type: 'eliminate', target: 'b' }, { type: 'input', commands: Array(7).fill({ ...NEUTRAL, seq: 1 }) }, { type: 'input', commands: [{ ...NEUTRAL, seq: 1, throttle: 5 }] }, { type: 'input', commands: [{ ...NEUTRAL, seq: 1.5 }] }]) expect(() => parseMessage(JSON.stringify(m))).toThrow();
    expect(() => parseMessage('{')).toThrow('format');
  });
  it('processes at most one command per fixed tick and ignores duplicate sequences', () => {
    const { world, a } = duel(); const commands = Array.from({ length: 6 }, (_, i) => ({ ...NEUTRAL, seq: i + 1, throttle: 1 }));
    world.enqueue(a.id, commands); world.enqueue(a.id, commands); world.step(); expect(a.ack).toBe(1);
    advance(world, 5 / 60); expect(a.ack).toBe(6); expect(Math.hypot(a.vx, a.vz)).toBeLessThan(4);
  });
  it('neutralizes stale controls when a player stops sending inputs', () => {
    const { world, a } = duel(); world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, throttle: 1 }]); advance(world, 0.25); const speed = a.vz;
    advance(world, 0.2); expect(a.vz).toBeLessThan(speed);
  });
});
