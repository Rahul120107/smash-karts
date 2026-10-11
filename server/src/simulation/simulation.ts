import { COLORS, CONFIG, DT } from '../../../shared/src/config.js';
import { groundHeight, PICKUP_POSITIONS, SPAWNS } from '../../../shared/src/arena.js';
import { collideKarts, moveKart, NEUTRAL } from '../../../shared/src/movement.js';
import type { GameEvent, Input, Pickup, PlayerState, Projectile, Snapshot } from '../../../shared/src/types.js';
import { activate } from '../weapons/activate.js';
import { stepProjectiles } from '../weapons/projectiles.js';
import { collectPickups } from './pickups.js';
import type { CombatWorld } from './world.js';

interface Controls { queue: Input[]; last: Input; lastReceived: number; highest: number }
export class Simulation implements CombatWorld {
  time = 0; tick = 0; phase: Snapshot['phase'] = 'lobby';
  players = new Map<string, PlayerState>(); projectiles = new Map<number, Projectile>();
  pickups: Pickup[] = []; events: GameEvent[] = [];
  private projectileId = 0; private eventId = 0; private controls = new Map<string, Controls>();
  constructor(public duration: number = CONFIG.matchDuration, public random: () => number = Math.random) { this.resetPickups(); }
  nextProjectileId() { return ++this.projectileId; }
  emit(event: Omit<GameEvent, 'id' | 'at'>) { this.events.push({ ...event, id: ++this.eventId, at: this.time }); }
  private resetPickups() { this.pickups = PICKUP_POSITIONS.map((p, id) => ({ ...p, id, availableAt: 0 })); }
  addPlayer(id: string, name: string): PlayerState {
    const p: PlayerState = { id, name, color: COLORS[this.players.size % COLORS.length]!, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0,
      health: CONFIG.maxHealth, score: 0, deaths: 0, weapon: null, ammo: 0, nextFire: 0, shieldUntil: 0, boostUntil: 0, invulnerableUntil: 0, respawnAt: 0, ack: 0 };
    this.players.set(id, p); this.controls.set(id, { queue: [], last: { ...NEUTRAL }, lastReceived: 0, highest: 0 });
    this.spawn(p, this.phase === 'playing' ? undefined : this.players.size - 1); return p;
  }
  removePlayer(id: string) { this.players.delete(id); this.controls.delete(id); for (const [key, p] of this.projectiles) if (p.owner === id) this.projectiles.delete(key); }
  private spawn(p: PlayerState, preferred?: number) {
    const alive = [...this.players.values()].filter(k => k.id !== p.id && k.health > 0);
    const spawn = preferred !== undefined ? SPAWNS[preferred % SPAWNS.length]! : [...SPAWNS].sort((a, b) => {
      const nearest = (s: typeof a) => alive.length ? Math.min(...alive.map(k => Math.hypot(k.x - s.x, k.z - s.z))) : 100;
      return nearest(b) - nearest(a);
    })[0]!;
    Object.assign(p, spawn, { y: groundHeight(spawn.x, spawn.z), vx: 0, vy: 0, vz: 0, health: CONFIG.maxHealth, respawnAt: 0,
      weapon: null, ammo: 0, nextFire: 0, invulnerableUntil: this.time + CONFIG.spawnProtection, shieldUntil: 0, boostUntil: 0 });
    const c = this.controls.get(p.id)!; c.queue = []; c.last = { ...NEUTRAL }; c.lastReceived = -1;
  }
  start() {
    this.phase = 'playing'; this.time = 0; this.tick = 0; this.projectiles.clear(); this.events = []; this.resetPickups();
    let index = 0;
    for (const p of this.players.values()) {
      p.score = 0; p.deaths = 0; p.ack = 0;
      this.controls.set(p.id, { queue: [], last: { ...NEUTRAL }, lastReceived: 0, highest: 0 });
      this.spawn(p, index++);
    }
  }
  enqueue(id: string, commands: Input[]) {
    if (this.phase !== 'playing') return;
    const c = this.controls.get(id); if (!c) return;
    c.lastReceived = this.time;
    for (const input of commands) {
      if (input.seq <= c.highest) continue;
      c.highest = input.seq; c.queue.push(input);
    }
    if (c.queue.length > CONFIG.maxQueue) c.queue.splice(0, c.queue.length - CONFIG.maxQueue);
  }
  step() {
    if (this.phase !== 'playing') return;
    this.tick++; this.time = this.tick * DT;
    if (this.time + 1e-9 >= this.duration) { this.time = this.duration; this.phase = 'finished'; this.projectiles.clear(); return; }
    for (const p of this.players.values()) {
      const c = this.controls.get(p.id)!;
      const command = c.queue.shift();
      if (command) { c.last = command; p.ack = command.seq; }
      const input = this.time - c.lastReceived <= CONFIG.inputTimeout ? c.last : NEUTRAL;
      if (p.health <= 0) { if (this.time >= p.respawnAt) this.spawn(p); continue; }
      moveKart(p, input, this.time < p.boostUntil);
      if (input.fire) activate(this, p);
    }
    const alive = [...this.players.values()].filter(p => p.health > 0);
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) collideKarts(alive[i]!, alive[j]!);
    stepProjectiles(this); collectPickups(this);
    this.events = this.events.filter(e => this.time - e.at < 0.75).slice(-256);
  }
  snapshot(code: string, host: string, capacity: number): Snapshot {
    return { code, host, phase: this.phase, tick: this.tick, time: this.time, remaining: Math.max(0, this.duration - this.time), duration: this.duration, capacity,
      players: [...this.players.values()].map(p => ({ ...p })), projectiles: [...this.projectiles.values()].map(p => ({ ...p })),
      pickups: this.pickups.map(p => ({ ...p })), events: this.events.map(e => ({ ...e })) };
  }
}
