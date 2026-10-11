import { describe, expect, it } from 'vitest';
import { collectPickups } from '../server/src/simulation/pickups.js';
import { CONFIG } from '../shared/src/config.js';
import { WEAPONS } from '../shared/src/weapons.js';
import { parseMessage } from '../server/src/networking/validation.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { advance, duel } from './helpers.js';
describe('authoritative pickups', () => {
  it('grants a configured random weapon and only one player owns a contested pickup', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z }); Object.assign(b, { x: box.x, y: box.y, z: box.z });
    collectPickups(world); expect(a.weapon).toBe('machineGun'); expect(a.ammo).toBe(WEAPONS.machineGun.ammo); expect(b.weapon).toBeNull(); expect(box.availableAt).toBe(CONFIG.pickupDelay);
    expect(world.events.filter(e => e.kind === 'pickup')).toHaveLength(1);
  });
  it('respawns after its configurable delay and preserves an unused equipped weapon', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z }); collectPickups(world);
    Object.assign(b, { x: box.x, y: box.y, z: box.z }); a.x = -30; advance(world, CONFIG.pickupDelay - 0.1); expect(b.weapon).toBeNull(); advance(world, 0.2); expect(b.weapon).toBe('machineGun');
    const ammo = b.ammo; box.availableAt = 0; collectPickups(world); expect(b.ammo).toBe(ammo); expect(box.availableAt).toBe(0);
  });
  it('does not let dead players collect or players above/below a ramp collect remotely', () => {
    const { world, a, b } = duel(); const box = world.pickups[0]!; Object.assign(a, { x: box.x, y: box.y, z: box.z, health: 0 }); Object.assign(b, { x: box.x, y: 4, z: box.z });
    collectPickups(world); expect(a.weapon).toBeNull(); expect(b.weapon).toBeNull(); expect(box.availableAt).toBe(0);
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
