import { DT } from '../../../shared/src/config.js';
import { collideKarts, drivingTelemetry, moveKart, recoverKart, resolveRampSides, resolveWalls } from '../../../shared/src/movement.js';
import { groundHeight } from '../../../shared/src/arena.js';
import { angleDelta, lerp } from '../../../shared/src/math.js';
import type { Input, KartState, PlayerState, Snapshot } from '../../../shared/src/types.js';

export class Prediction {
  kart: KartState | null = null; sequence = 0; private pending: Input[] = [];
  private phase = ''; private tick = -1; private alive = false; private id = '';
  private others: PlayerState[] = []; private snapshotTime = 0;
  reconcile(state: Snapshot, id: string) {
    const player = state.players.find(p => p.id === id); if (!player) return;
    const reset = id !== this.id || state.phase !== this.phase || state.tick < this.tick;
    if (reset) { this.pending = []; this.sequence = player.ack; }
    this.id = id; this.phase = state.phase; this.tick = state.tick;
    this.others = state.players.filter(p => p.id !== id && p.health > 0).map(p => ({ ...p })); this.snapshotTime = state.time;
    if (!this.alive && player.health > 0) this.pending = [];
    this.alive = player.health > 0;
    this.pending = this.pending.filter(c => c.seq > player.ack);
    const kart = { ...player };
    if (this.alive && state.phase === 'playing') {
      for (let i = 0; i < this.pending.length; i++) { moveKart(kart, this.pending[i]!, state.time + i * DT < player.boostUntil); this.contacts(kart, i * DT); }
    }
    this.kart = kart;
  }
  step(command: Input, player: PlayerState, time: number) {
    this.sequence = command.seq;
    this.pending.push(command); if (this.pending.length > 180) this.pending.shift();
    if (this.kart && player.health > 0) { moveKart(this.kart, command, time < player.boostUntil); this.contacts(this.kart, time - this.snapshotTime); }
  }
  private contacts(kart: KartState, elapsed: number) {
    const t = Math.max(0, Math.min(0.1, elapsed));
    // Remote bodies are disposable ghosts. Prediction never edits authoritative snapshots.
    const ghosts = this.others.map(other => {
      const ghost = { ...other }; ghost.x += ghost.vx * t; ghost.z += ghost.vz * t;
      const grounded = drivingTelemetry(other).grounded;
      if (!grounded) ghost.y += ghost.vy * t;
      resolveWalls(ghost); resolveRampSides(ghost);
      if (grounded) ghost.y = groundHeight(ghost.x, ghost.z);
      recoverKart(ghost); return ghost;
    });
    for (let pass = 0; pass < 3; pass++) for (const other of ghosts) collideKarts(kart, other);
  }
}
interface History { received: number; snapshot: Snapshot }
export class Interpolation {
  private history: History[] = [];
  push(snapshot: Snapshot) {
    const last = this.history.at(-1)?.snapshot;
    if (last && (last.tick > snapshot.tick || last.code !== snapshot.code)) this.history = [];
    this.history.push({ snapshot, received: performance.now() });
    if (this.history.length > 12) this.history.shift();
  }
  sample(id: string, now: number): PlayerState | null {
    if (!this.history.length) return null;
    const target = now - 100;
    let first = this.history[0]!, second = first;
    for (const item of this.history) {
      if (item.received <= target) first = item;
      if (item.received >= target) { second = item; break; }
      second = item;
    }
    const a = first.snapshot.players.find(p => p.id === id), b = second.snapshot.players.find(p => p.id === id);
    if (!a) return b ?? null; if (!b) return a;
    if (a.health <= 0 || b.health <= 0 || Math.hypot(a.x - b.x, a.z - b.z) > 6) return b;
    const t = first === second ? 1 : Math.max(0, Math.min(1, (target - first.received) / (second.received - first.received)));
    return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), yaw: a.yaw + angleDelta(a.yaw, b.yaw) * t };
  }
}
