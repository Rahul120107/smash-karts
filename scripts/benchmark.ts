import { performance } from 'node:perf_hooks';
import { Simulation } from '../server/src/simulation/simulation.js';
import { CONFIG } from '../shared/src/config.js';
import { WEAPONS, WEAPON_IDS } from '../shared/src/weapons.js';
import { encodeSnapshot } from '../server/src/networking/serialization.js';
let seed = 12345;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000;
const world = new Simulation(180, random);
for (let i = 0; i < 8; i++) world.addPlayer(String(i), `Load player ${i + 1}`);
world.start();
const samples: number[] = []; let totalBytes = 0, snapshots = 0, peakProjectiles = 0;
let lastEvent = 0;
const started = performance.now();
for (let tick = 0; tick < 180 * CONFIG.tickRate; tick++) {
  const before = performance.now();
  for (const [id, player] of world.players) {
    const index = Number(id);
    if (player.health > 0 && !player.weapon) {
      const weapon = WEAPON_IDS[(index + Math.floor(tick / 180)) % WEAPON_IDS.length]!;
      player.weapon = weapon; player.ammo = WEAPONS[weapon].ammo;
    }
    world.enqueue(id, [{ seq: tick + 1, throttle: 1, steer: Math.sin(tick / 110 + index) * 0.8, fire: true, drift: tick % 240 < 60 }]);
  }
  world.step(); peakProjectiles = Math.max(peakProjectiles, world.projectiles.size);
  if (tick % 3 === 0) {
    const state = world.snapshot('LOAD2', '0', 8); totalBytes += Buffer.byteLength(encodeSnapshot(state, lastEvent)); snapshots++;
    lastEvent = state.events.at(-1)?.id ?? lastEvent;
  }
  samples.push(performance.now() - before);
}
for (const player of world.players.values()) if (![player.x, player.y, player.z, player.vx, player.vy, player.vz].every(Number.isFinite)) throw new Error('Simulation produced non-finite state.');
const elapsed = performance.now() - started; samples.sort((a, b) => a - b);
console.log(JSON.stringify({ simulatedSeconds: world.time, players: world.players.size, wallMilliseconds: Math.round(elapsed),
  tickAndSnapshotP95Milliseconds: Number(samples[Math.floor(samples.length * 0.95)]!.toFixed(3)),
  peakProjectiles, averageSnapshotBytes: Math.round(totalBytes / snapshots),
  estimatedOutboundKBpsPerEightPlayerRoom: Math.round(totalBytes / snapshots * CONFIG.snapshotRate * 8 / 1024),
  totalEliminations: [...world.players.values()].reduce((sum, p) => sum + p.score, 0), phase: world.phase }, null, 2));
