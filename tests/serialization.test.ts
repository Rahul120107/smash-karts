import { describe, expect, it } from 'vitest';
import { encodeSnapshot } from '../server/src/networking/serialization.js';
import type { ServerMessage } from '../shared/src/types.js';
import { duel } from './helpers.js';
describe('snapshot bandwidth reduction', () => {
  it('rounds wire numbers to a millimeter without changing authoritative values', () => {
    const { world, a } = duel(); a.x = -8.12345678;
    const packet = JSON.parse(encodeSnapshot(world.snapshot('ABCDE', a.id, 8))) as Extract<ServerMessage, { type: 'snapshot' }>;
    expect(packet.state.players[0]!.x).toBe(-8.123); expect(a.x).toBe(-8.12345678); expect(Math.abs(packet.state.players[0]!.x - a.x)).toBeLessThan(0.0005);
    expect(packet.state.players[0]!.health).toBe(100); expect(packet.state.players[0]!.id).toBe(a.id);
  });
  it('sends only events newer than the last successfully sent snapshot for each client', () => {
    const { world, a } = duel();
    world.emit({ kind: 'fire', player: a.id, x: 0, y: 1, z: 0 }); world.emit({ kind: 'pickup', player: a.id, x: 1, y: 1, z: 0 });
    const state = world.snapshot('ABCDE', a.id, 8);
    const initial = JSON.parse(encodeSnapshot(state)) as Extract<ServerMessage, { type: 'snapshot' }>;
    const updated = JSON.parse(encodeSnapshot(state, state.events[0]!.id)) as Extract<ServerMessage, { type: 'snapshot' }>;
    expect(initial.state.events).toHaveLength(2); expect(updated.state.events).toHaveLength(1); expect(updated.state.events[0]!.kind).toBe('pickup');
    expect(JSON.parse(encodeSnapshot(state, state.events[1]!.id)).state.events).toEqual([]); expect(state.events).toHaveLength(2);
  });
});
