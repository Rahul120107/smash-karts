import { COLORS, CONFIG, DT } from '../../../shared/src/config.js';
import { groundHeight, PICKUP_POSITIONS, SPAWNS } from '../../../shared/src/arena.js';
import { collideKarts, moveKart, NEUTRAL } from '../../../shared/src/movement.js';
import type { GameEvent, Input, Pickup, PlayerState, Projectile, Snapshot } from '../../../shared/src/types.js';
import { AttackSequences } from '../weapons/sequences.js';
import { stepProjectiles } from '../weapons/projectiles.js';
import { collectPickups } from './pickups.js';
import type { CombatWorld } from './world.js';
import { weaponAim } from '../../../shared/src/aim.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import { stepContactAttacks } from '../combat/contact.js';
import { matchWinners } from '../../../shared/src/match.js';
import { stepLavaHazard } from './hazards.js';

interface Controls { queue: Input[]; last: Input; lastReceived: number; highest: number; fireDown: boolean; pressed: boolean; firePress: number }
export class Simulation implements CombatWorld {
  time = 0; tick = 0; phase: Snapshot['phase'] = 'lobby';
  matchId = 0;
  players = new Map<string, PlayerState>(); projectiles = new Map<number, Projectile>();
  pickups: Pickup[] = []; events: GameEvent[] = [];
  readonly attacks = new AttackSequences();
  private winnerIds: string[] = [];
  private colorCursor = 0;
  private projectileId = 0; private eventId = 0; private controls = new Map<string, Controls>();
  constructor(public duration: number = CONFIG.matchDuration, public random: () => number = Math.random) { this.resetPickups(); }
  nextProjectileId() { return ++this.projectileId; }
  emit(event: Omit<GameEvent, 'id' | 'at'>) { const id=++this.eventId; this.events.push({ ...event, id, at: this.time, matchId:this.matchId, matchEventId:`${this.matchId}:${id}` }); }
  private resetPickups() { this.pickups = PICKUP_POSITIONS.map((p, id) => ({ ...p, id, active: true, availableAt: 0 })); }
  addPlayer(id: string, name: string): PlayerState {
    const usedColors = new Set([...this.players.values()].map(player => player.color));
    const orderedColors = [...COLORS.slice(this.colorCursor), ...COLORS.slice(0, this.colorCursor)];
    const color = orderedColors.find(candidate => !usedColors.has(candidate)) ?? COLORS[0];
    this.colorCursor = (COLORS.indexOf(color) + 1) % COLORS.length;
    const p: PlayerState = { id, name, color, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0,
      health: CONFIG.maxHealth, score: 0, deaths: 0, weapon: null, ammo: 0, nextFire: 0, shieldUntil: 0, boostUntil: 0, orbitUntil: 0, invulnerableUntil: 0, respawnAt: 0, ack: 0 };
    this.players.set(id, p); this.controls.set(id, { queue: [], last: { ...NEUTRAL }, lastReceived: 0, highest: 0, fireDown: false, pressed: false, firePress: 0 });
    this.spawn(p, this.phase === 'playing' ? undefined : this.players.size - 1); return p;
  }
  removePlayer(id: string) { const player = this.players.get(id); if (player) this.attacks.cancel(player); this.players.delete(id); this.controls.delete(id); for (const [key, p] of this.projectiles) if (p.owner === id) this.projectiles.delete(key); }
  private spawn(p: PlayerState, preferred?: number) {
    const alive = [...this.players.values()].filter(k => k.id !== p.id && k.health > 0);
    const spawn = preferred !== undefined ? SPAWNS[preferred % SPAWNS.length]! : [...SPAWNS].sort((a, b) => {
      const nearest = (s: typeof a) => alive.length ? Math.min(...alive.map(k => Math.hypot(k.x - s.x, k.z - s.z))) : 100;
      return nearest(b) - nearest(a);
    })[0]!;
    Object.assign(p, spawn, { y: groundHeight(spawn.x, spawn.z), vx: 0, vy: 0, vz: 0, health: CONFIG.maxHealth, respawnAt: 0,
      weapon: null, ammo: 0, nextFire: 0, invulnerableUntil: this.time + CONFIG.spawnProtection, shieldUntil: 0, boostUntil: 0, orbitUntil: 0, aimTarget: null, attacking: false, yawRate: 0 });
    this.attacks.cancel(p);
    const c = this.controls.get(p.id)!; c.queue = []; c.last = { ...NEUTRAL }; c.lastReceived = -1;
  }
  start() {
    this.matchId++;
    this.phase = 'playing'; this.time = 0; this.tick = 0; this.projectiles.clear(); this.attacks.clear(); this.events = []; this.winnerIds = []; this.resetPickups();
    let index = 0;
    for (const p of this.players.values()) {
      p.score = 0; p.deaths = 0; p.ack = 0;
      this.controls.set(p.id, { queue: [], last: { ...NEUTRAL }, lastReceived: 0, highest: 0, fireDown: false, pressed: false, firePress: 0 });
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
    if (this.time + 1e-9 >= this.duration) { this.time = this.duration; this.phase = 'finished'; this.winnerIds = matchWinners(this.players.values()); this.projectiles.clear(); this.attacks.clear(); for (const p of this.players.values()) p.attacking = false; return; }
    for (const p of this.players.values()) {
      const c = this.controls.get(p.id)!;
      const command = c.queue.shift();
      c.pressed = false;
      if (command) {
        // Monotonic press IDs survive taps between ticks and movement queue trimming.
        // Legacy clients still use a held-key edge; neither path bypasses weapon cooldowns.
        c.pressed = command.firePress === undefined ? command.fire && !c.fireDown : command.firePress > c.firePress;
        c.firePress = Math.max(c.firePress, command.firePress ?? c.firePress);
        c.fireDown = command.fire; c.last = command; p.ack = command.seq;
      }
      const input = this.time - c.lastReceived <= CONFIG.inputTimeout ? c.last : NEUTRAL;
      if (p.health <= 0) { this.attacks.cancel(p); if (this.time >= p.respawnAt) { this.spawn(p); this.emit({ kind: 'respawn', player: p.id, x: p.x, y: p.y + 0.3, z: p.z }); } continue; }
      const wallImpact = moveKart(p, input, this.time < p.boostUntil);
      if (wallImpact > 4) this.emit({ kind: 'collision', player: p.id, x: p.x, y: p.y + 0.4, z: p.z, radius: wallImpact });
    }
    const alive = [...this.players.values()].filter(p => p.health > 0);
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i]!, b = alive[j]!, impact = collideKarts(a, b);
      if (pass === 0 && impact > 4) this.emit({ kind: 'collision', player: a.id, target: b.id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.4, z: (a.z + b.z) / 2, radius: impact });
    }
    stepLavaHazard(this);
    // Aim uses every kart's current tick position, after movement/contact resolution.
    for (const p of alive.filter(k => k.health > 0)) {
      p.aimTarget = p.weapon && WEAPONS[p.weapon].aimAssist ? weaponAim(p, alive, this.time, p.weapon).target?.id ?? null : null;
      const c = this.controls.get(p.id)!;
      if (this.time - c.lastReceived <= CONFIG.inputTimeout && c.pressed) this.attacks.begin(this, p);
      if (this.time - c.lastReceived > CONFIG.chargeInputTimeout && p.charging) this.attacks.cancel(p);
      else if (!(c.last.fireHeld ?? c.last.fire)) this.attacks.release(this, p);
      this.attacks.step(this, p);
    }
    stepContactAttacks(this); stepProjectiles(this); collectPickups(this);
    this.events = this.events.filter(e => this.time - e.at < 0.75).slice(-256);
  }
  snapshot(code: string, host: string, capacity: number): Snapshot {
    return { code, host, phase: this.phase, winnerIds: [...this.winnerIds], tick: this.tick, time: this.time, remaining: Math.max(0, this.duration - this.time), duration: this.duration, capacity,
      players: [...this.players.values()].map(p => ({ ...p })), projectiles: [...this.projectiles.values()].map(p => ({ ...p })),
      pickups: this.pickups.map(p => ({ ...p })), events: this.events.map(e => ({ ...e })) };
  }
}
