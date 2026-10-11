import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/src/types.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { startServer } from '../server/src/networking/server.js';
import { equip } from './helpers.js';
class Peer {
  messages: ServerMessage[] = []; private listeners = new Set<() => void>();
  constructor(public ws: WebSocket) { ws.on('message', raw => { this.messages.push(JSON.parse(raw.toString()) as ServerMessage); for (const fn of this.listeners) fn(); }); }
  send(m: ClientMessage | object) { this.ws.send(JSON.stringify(m)); }
  async wait(predicate: (m: ServerMessage) => boolean, timeout = 5000): Promise<ServerMessage> {
    const existing = [...this.messages].reverse().find(predicate); if (existing) return existing;
    return new Promise((ok, fail) => {
      const timer = setTimeout(() => { this.listeners.delete(check); fail(new Error('Timed out waiting for server message')); }, timeout);
      const check = () => { const found = [...this.messages].reverse().find(predicate); if (found) { clearTimeout(timer); this.listeners.delete(check); ok(found); } };
      this.listeners.add(check);
    });
  }
  async state(predicate: (s: Snapshot) => boolean) { const message = await this.wait(m => m.type === 'snapshot' && predicate(m.state)); return (message as Extract<ServerMessage, { type: 'snapshot' }>).state; }
  static async open(port: number) { const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`); const peer = new Peer(ws); await new Promise<void>((ok, fail) => { ws.once('open', ok); ws.once('error', fail); }); return peer; }
}
let server: Awaited<ReturnType<typeof startServer>> | undefined;
const peers: Peer[] = [];
afterEach(async () => { for (const p of peers.splice(0)) p.ws.terminate(); await server?.close(); server = undefined; });
async function setup(duration = 180) {
  server = await startServer({ port: 0, host: '127.0.0.1', duration });
  const a = await Peer.open(server.port), b = await Peer.open(server.port); peers.push(a, b);
  a.send({ type: 'create', name: 'Alpha' }); const welcomeA = await a.wait(m => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
  b.send({ type: 'join', name: 'Bravo', code: welcomeA.code }); const welcomeB = await b.wait(m => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
  return { a, b, idA: welcomeA.id, idB: welcomeB.id, code: welcomeA.code };
}
describe('real WebSocket multiplayer integration', () => {
  it('creates/joins, rejects non-host starts and combat claims, moves from input, and transfers host on disconnect', async () => {
    const { a, b, idA, idB, code } = await setup(); expect((await b.state(s => s.players.length === 2)).code).toBe(code);
    b.send({ type: 'start' }); await b.wait(m => m.type === 'error' && m.message.includes('host'));
    a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    b.send({ type: 'eliminate', target: idA }); await b.wait(m => m.type === 'error' && m.message.includes('Unsupported'));
    a.send({ type: 'input', commands: Array.from({ length: 6 }, (_, i) => ({ ...NEUTRAL, seq: i + 1, throttle: 1 })) });
    const moved = await b.state(s => (s.players.find(p => p.id === idA)?.ack ?? 0) >= 6);
    expect(moved.players.find(p => p.id === idA)!.z).toBeLessThan(27); expect(moved.players.find(p => p.id === idA)!.health).toBe(100);
    a.ws.close(); await b.state(s => s.players.length === 1 && s.host === idB); expect(server!.rooms.memberships.has(idA)).toBe(false);
    b.send({ type: 'leave' }); await b.wait(m => m.type === 'left'); expect(server!.rooms.rooms.size).toBe(0);
  });
  it('synchronizes authoritative combat, ammo, eliminations, final scores, and replay across two peers', async () => {
    const { a, b, idA, idB, code } = await setup(2);
    a.send({ type: 'start' }); await a.state(s => s.phase === 'playing');
    // Fixture access is local to this test; there is no weapon/position cheat in the public protocol.
    const world = server!.rooms.rooms.get(code)!.simulation;
    const shooter = world.players.get(idA)!, victim = world.players.get(idB)!;
    Object.assign(shooter, { x: -8, z: 0, yaw: 0, invulnerableUntil: 0 }); Object.assign(victim, { x: -8, z: 6, invulnerableUntil: 0 }); equip(shooter, 'machineGun');
    let seq = 0;
    const fire = setInterval(() => a.send({ type: 'input', commands: Array.from({ length: 3 }, () => ({ ...NEUTRAL, seq: ++seq, fire: true })) }), 50);
    try {
      const killedA = await a.state(s => s.players.some(p => p.id === idB && p.health === 0));
      const killedB = await b.state(s => s.players.some(p => p.id === idB && p.health === 0));
      expect(killedA.players.find(p => p.id === idA)!.score).toBe(1); expect(killedB.players.find(p => p.id === idA)!.score).toBe(1);
      expect(killedB.players.find(p => p.id === idA)!.ammo).toBeLessThan(30);
      expect(b.messages.some(m => m.type === 'snapshot' && m.state.projectiles.length > 0)).toBe(true);
      const final = await b.state(s => s.phase === 'finished'); expect(final.remaining).toBe(0); expect(final.players.find(p => p.id === idA)!.score).toBe(1);
      clearInterval(fire); a.messages = []; b.messages = []; a.send({ type: 'start' });
      const replay = await b.state(s => s.phase === 'playing'); expect(replay.players.every(p => p.health === 100 && p.score === 0 && p.deaths === 0)).toBe(true);
    } finally { clearInterval(fire); }
  });
  it('serves health, enforces allowed origins, and rejects malformed input without corrupting rooms', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', allowedOrigins: ['http://allowed.example'] });
    const response = await fetch(`http://127.0.0.1:${server.port}/health`); expect(await response.json()).toEqual({ ok: true, rooms: 0, players: 0 });
    const denied = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { origin: 'http://denied.example' });
    await new Promise<void>(ok => denied.on('error', () => ok())); expect(server.rooms.rooms.size).toBe(0);
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`, { origin: 'http://allowed.example' }); const peer = new Peer(ws); peers.push(peer);
    await new Promise<void>(ok => ws.once('open', ok)); ws.send('{'); await peer.wait(m => m.type === 'error');
    peer.send({ type: 'create', name: 'Valid' }); await peer.wait(m => m.type === 'welcome'); expect(server.rooms.rooms.size).toBe(1);
  });
});
