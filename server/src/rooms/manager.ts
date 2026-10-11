import { CONFIG } from '../../../shared/src/config.js';
import { Simulation } from '../simulation/simulation.js';
export interface Room { code: string; host: string; simulation: Simulation; lastActivity: number }
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export class RoomManager {
  rooms = new Map<string, Room>(); memberships = new Map<string, string>();
  constructor(public capacity: number = CONFIG.capacity, private duration: number = CONFIG.matchDuration, private codeRandom: () => number = Math.random) {
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > CONFIG.capacity) throw new Error('Room capacity must be between 2 and 8.');
  }
  create(id: string, name: string): Room {
    if (this.memberships.has(id)) throw new Error('Leave your current room first.');
    let code = '';
    for (let attempt = 0; attempt < 64; attempt++) {
      code = Array.from({ length: 5 }, () => ALPHABET[Math.floor(this.codeRandom() * ALPHABET.length)]).join('');
      if (!this.rooms.has(code)) break;
      code = '';
    }
    if (!code) throw new Error('Could not allocate a unique room. Try again.');
    const room: Room = { code, host: id, simulation: new Simulation(this.duration), lastActivity: Date.now() };
    this.rooms.set(code, room); this.join(id, name, code); return room;
  }
  join(id: string, name: string, code: string): Room {
    if (this.memberships.has(id)) throw new Error('Leave your current room first.');
    const room = this.rooms.get(code);
    if (!room) throw new Error('Room not found. Check the five-character code.');
    if (room.simulation.players.size >= this.capacity) throw new Error('This room is full.');
    room.simulation.addPlayer(id, name); room.lastActivity = Date.now(); this.memberships.set(id, code); return room;
  }
  roomFor(id: string) { const code = this.memberships.get(id); return code ? this.rooms.get(code) : undefined; }
  leave(id: string) {
    const room = this.roomFor(id); this.memberships.delete(id); if (!room) return;
    room.simulation.removePlayer(id); room.lastActivity = Date.now();
    if (room.simulation.players.size === 0) this.rooms.delete(room.code);
    else if (room.host === id) room.host = room.simulation.players.keys().next().value!;
  }
  start(id: string) {
    const room = this.roomFor(id); if (!room) throw new Error('Join a room first.');
    if (room.host !== id) throw new Error('Only the host can start a match.');
    if (room.simulation.phase === 'playing') throw new Error('A match is already running.');
    room.simulation.start(); room.lastActivity = Date.now();
  }
  cleanup(now = Date.now()): string[] {
    const evicted: string[] = [];
    for (const room of this.rooms.values()) {
      if (room.simulation.phase === 'playing' || now - room.lastActivity < CONFIG.roomIdleSeconds * 1000) continue;
      for (const id of room.simulation.players.keys()) { evicted.push(id); this.memberships.delete(id); }
      this.rooms.delete(room.code);
    }
    return evicted;
  }
}
