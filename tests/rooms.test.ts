import { describe, expect, it } from 'vitest';
import { RoomManager } from '../server/src/rooms/manager.js';
import { COLORS, CONFIG } from '../shared/src/config.js';
describe('room lifecycle', () => {
  it('keeps eight liveries distinct through player turnover, respawn, snapshots and replay', () => {
    const manager = new RoomManager(8, .05), room = manager.create('p0', 'Driver 0');
    for (let i = 1; i < 8; i++) manager.join(`p${i}`, `Driver ${i}`, room.code);
    const colors = () => [...room.simulation.players.values()].map(p => p.color);
    expect(new Set(colors()).size).toBe(8);
    const original = new Map([...room.simulation.players].map(([id,p]) => [id,p.color]));
    manager.leave('p2'); manager.join('replacement', 'Replacement', room.code);
    expect(new Set(colors()).size).toBe(8); expect(room.simulation.players.get('replacement')!.color).toBe(COLORS[8]);
    const stable = colors(); manager.start('p0'); expect(colors()).toEqual(stable);
    const player = room.simulation.players.get('p4')!; player.health=0; player.respawnAt=0;
    room.simulation.step(); expect(player.health).toBe(CONFIG.maxHealth); expect(player.color).toBe(original.get('p4'));
    for (let i = 0; i < 4; i++) room.simulation.step(); manager.start('p0'); expect(colors()).toEqual(stable);
    for (let i = 0; i < 20; i++) {
      manager.leave('replacement'); manager.join('replacement', 'Replacement', room.code);
      expect(new Set(colors()).size).toBe(8);
      for (const [id,p] of room.simulation.players) if (id !== 'replacement') expect(p.color).toBe(original.get(id));
      expect(room.simulation.snapshot(room.code,room.host,8).players.map(p=>p.color)).toEqual(colors());
    }
  });
  it('creates a private room, joins, and isolates room memberships', () => {
    const manager = new RoomManager(); const room = manager.create('a', 'Alpha');
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/); expect(room.host).toBe('a');
    manager.join('b', 'Bravo', room.code); expect(room.simulation.players.size).toBe(2);
    const separate = manager.create('c', 'Charlie'); expect(separate.code).not.toBe(room.code);
    expect(separate.simulation.players.has('b')).toBe(false);
  });
  it('rejects missing rooms, duplicate membership, capacity overflow, and non-host starts', () => {
    const manager = new RoomManager(2); const room = manager.create('a', 'Alpha');
    expect(() => manager.join('b', 'Bravo', 'ZZZZZ')).toThrow('not found');
    expect(() => manager.create('a', 'Again')).toThrow('Leave');
    manager.join('b', 'Bravo', room.code);
    expect(() => manager.join('c', 'Charlie', room.code)).toThrow('full');
    expect(() => manager.start('b')).toThrow('host');
    manager.start('a'); expect(room.simulation.phase).toBe('playing');
    expect(() => manager.start('a')).toThrow('already running');
  });
  it('never overwrites a room when the room code generator repeatedly collides', () => {
    const manager = new RoomManager(8, 180, () => 0); const room = manager.create('a', 'Alpha');
    expect(() => manager.create('b', 'Bravo')).toThrow('unique');
    expect(manager.rooms.size).toBe(1); expect(manager.rooms.get(room.code)?.host).toBe('a'); expect(manager.memberships.has('b')).toBe(false);
  });
  it('transfers host on disconnect, deletes owned projectiles, and removes abandoned rooms', () => {
    const manager = new RoomManager(); const room = manager.create('a', 'Alpha'); manager.join('b', 'Bravo', room.code);
    manager.leave('a'); expect(room.host).toBe('b'); expect(room.simulation.players.has('a')).toBe(false);
    manager.leave('b'); expect(manager.rooms.size).toBe(0); expect(manager.memberships.size).toBe(0);
  });
  it('evicts idle lobbies but retains active matches', () => {
    const manager = new RoomManager(); const room = manager.create('a', 'Alpha');
    expect(manager.cleanup(room.lastActivity + CONFIG.roomIdleSeconds * 1000 + 1)).toEqual(['a']); expect(manager.rooms.size).toBe(0);
    const active = manager.create('b', 'Bravo'); manager.start('b');
    expect(manager.cleanup(active.lastActivity + 1e9)).toEqual([]); expect(manager.rooms.size).toBe(1);
  });
  it('evicts an inactive completed match and removes all its memberships', () => {
    const manager = new RoomManager(8, 0.02); const room = manager.create('a', 'Alpha'); manager.join('b', 'Bravo', room.code); manager.start('a');
    room.simulation.step(); room.simulation.step(); expect(room.simulation.phase).toBe('finished');
    expect(manager.cleanup(room.lastActivity + CONFIG.roomIdleSeconds * 1000 + 1)).toEqual(['a', 'b']);
    expect(manager.rooms.size).toBe(0); expect(manager.memberships.size).toBe(0);
  });
});
