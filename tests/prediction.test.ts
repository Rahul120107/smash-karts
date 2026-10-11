import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prediction, Interpolation } from '../client/src/networking/prediction.js';
import { DT } from '../shared/src/config.js';
import { moveKart, NEUTRAL } from '../shared/src/movement.js';
import { duel } from './helpers.js';
afterEach(() => vi.restoreAllMocks());
describe('client prediction and reconciliation', () => {
  it('replays only unacknowledged input on authoritative state after a delayed snapshot', () => {
    const { world, a } = duel(), prediction = new Prediction(); const initial = world.snapshot('ABCDE', a.id, 8);
    prediction.reconcile(initial, a.id);
    const expected = { ...a };
    const commands = Array.from({ length: 12 }, (_, i) => ({ ...NEUTRAL, seq: i + 1, throttle: 1 }));
    for (const command of commands) { prediction.step(command, a, 0); moveKart(expected, command); }
    world.enqueue(a.id, commands); for (let i = 0; i < 6; i++) world.step();
    prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
    expect(a.ack).toBe(6); expect(prediction.kart!.z).toBeCloseTo(expected.z, 8); expect(prediction.kart!.vz).toBeCloseTo(expected.vz, 8); expect(prediction.sequence).toBe(12);
  });
  it('removes invalid predicted movement when the server rejects it', () => {
    const { world, a } = duel(), prediction = new Prediction(); prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
    prediction.step({ ...NEUTRAL, seq: 1, throttle: 1 }, a, 0); const predicted = prediction.kart!.z;
    a.ack = 1; prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id); expect(prediction.kart!.z).not.toBe(predicted); expect(prediction.kart!.z).toBe(a.z);
  });
  it('resets old pending controls on session replacement, elimination, respawn, and a replay', () => {
    const { world, a, b } = duel(), prediction = new Prediction(); prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
    prediction.step({ ...NEUTRAL, seq: 1, throttle: 1 }, a, 0);
    prediction.reconcile(world.snapshot('ABCDE', b.id, 8), b.id); expect(prediction.sequence).toBe(0); expect(prediction.kart!.z).toBe(b.z);
    b.health = 0; prediction.reconcile(world.snapshot('ABCDE', b.id, 8), b.id); b.health = 100; b.z = 20;
    prediction.reconcile(world.snapshot('ABCDE', b.id, 8), b.id); expect(prediction.kart!.z).toBe(20);
    world.step(); prediction.reconcile(world.snapshot('ABCDE', b.id, 8), b.id); world.start(); prediction.reconcile(world.snapshot('ABCDE', b.id, 8), b.id); expect(prediction.sequence).toBe(0); expect(prediction.kart!.z).toBe(b.z);
  });
  it('replays temporary boosts using authoritative expiration', () => {
    const { world, a } = duel(), prediction = new Prediction(); a.boostUntil = DT * 2; a.vz = 21;
    prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id); const expected = { ...a };
    for (let i = 0; i < 4; i++) { const command = { ...NEUTRAL, seq: i + 1, throttle: 1 }; prediction.step(command, a, i * DT); moveKart(expected, command, i < 2); }
    prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id); expect(prediction.kart!.vz).toBeCloseTo(expected.vz);
  });
});
describe('remote interpolation', () => {
  it('renders between buffered snapshots rather than snapping to network arrivals', () => {
    const { world, a } = duel(), history = new Interpolation(); vi.spyOn(performance, 'now').mockReturnValue(1000);
    a.z = 0; history.push(world.snapshot('ABCDE', a.id, 8)); vi.spyOn(performance, 'now').mockReturnValue(1100); a.z = 4; history.push(world.snapshot('ABCDE', a.id, 8));
    expect(history.sample(a.id, 1150)!.z).toBeCloseTo(2);
  });
  it('snaps on respawn and discards history from another room', () => {
    const { world, a } = duel(), history = new Interpolation(); vi.spyOn(performance, 'now').mockReturnValue(1000);
    a.z = 0; history.push(world.snapshot('ABCDE', a.id, 8)); vi.spyOn(performance, 'now').mockReturnValue(1100); a.z = 27; history.push(world.snapshot('ABCDE', a.id, 8));
    expect(history.sample(a.id, 1150)!.z).toBe(27); a.z = -20; history.push(world.snapshot('FGHJK', a.id, 8)); expect(history.sample(a.id, 1150)!.z).toBe(-20);
  });
});
