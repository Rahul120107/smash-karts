import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage, Snapshot } from '../shared/src/types.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { startServer } from '../server/src/networking/server.js';
import { equip } from './helpers.js';
import { WEAPONS } from '../shared/src/weapons.js';
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
  async state(predicate: (s: Snapshot) => boolean, timeout = 5000) { const message = await this.wait(m => m.type === 'snapshot' && predicate(m.state), timeout); return (message as Extract<ServerMessage, { type: 'snapshot' }>).state; }
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
  it('synchronizes a lava death, late-join state and normal respawn without awarding a kill', async () => {
    const { a, b, idA, code } = await setup(12); a.send({ type: 'start' }); await b.state(s=>s.phase==='playing');
    const world=server!.rooms.rooms.get(code)!.simulation, victim=world.players.get(idA)!;
    Object.assign(victim,{x:0,z:0,y:-.7,vx:0,vy:0,vz:0});
    const dead=await a.state(s=>s.players.some(p=>p.id===idA&&p.health===0));
    const mirrored=await b.state(s=>s.players.some(p=>p.id===idA&&p.health===0));
    expect(dead.players.every(p=>p.score===0)).toBe(true);expect(mirrored.players.find(p=>p.id===idA)!.deaths).toBe(1);
    const late=await Peer.open(server!.port);peers.push(late);late.send({type:'join',code,name:'Late lava witness'});
    const state=await late.state(s=>s.players.some(p=>p.id===idA&&p.health===0));expect(state.pickups).toEqual(mirrored.pickups);
    const respawn=await late.state(s=>s.time>dead.time&&s.players.some(p=>p.id===idA&&p.health===100));
    const player=respawn.players.find(p=>p.id===idA)!;expect(player.respawnAt).toBe(0);expect(player.deaths).toBe(1);expect(player.score).toBe(0);
  });
  it.each(['bullets', 'blastMissile', 'orbit', 'shield'] as const)('synchronizes server-owned %s activation, damage and remaining inventory', async weapon => {
    const { a, b, idA, idB, code } = await setup(12); a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    const world = server!.rooms.rooms.get(code)!.simulation, shooter = world.players.get(idA)!, target = world.players.get(idB)!;
    Object.assign(shooter, { x: 60, y: 0, z: 0, yaw: 0, invulnerableUntil: 0 });
    Object.assign(target, { x: 60, y: 0, z: weapon === 'orbit' || weapon === 'shield' ? 1.8 : 6, invulnerableUntil: 0 });
    equip(shooter, weapon); const since = world.time;
    a.send({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2 }] });
    const hit = (s: Snapshot) => s.time > since && s.events.some(e => e.kind === 'hit' && e.player === idA && e.target === idB);
    const states = await Promise.all([a.state(hit), b.state(hit)]);
    expect(states[0]!.tick).toBe(states[1]!.tick);
    for (const [index, state] of states.entries()) {
      const owner = state.players.find(p => p.id === idA)!;
      expect(owner.health).toBe(100); expect(owner.ammo).toBe(WEAPONS[weapon].ammo - (WEAPONS[weapon].projectilesPerUse??1));
      expect(owner.weapon).toBe(WEAPONS[weapon].ammo === 1 ? null : weapon);
      expect(state.players.find(p => p.id === idB)!.health).toBeLessThan(100);
      // Events are deltas: the launch was delivered in an earlier snapshot than impact.
      expect([a, b][index]!.messages.some(m => m.type === 'snapshot' && m.state.events.some(e => e.kind === 'fire' && e.weapon === weapon && e.player === idA))).toBe(true);
      if (weapon === 'orbit') expect(owner.orbitUntil).toBeGreaterThan(state.time);
    }
    b.send({ type: 'contact', target: idA, orbitUntil: 999 });
    await b.wait(m => m.type === 'error' && m.message.includes('Unsupported')); expect(shooter.health).toBe(100);
  });
  it('synchronizes all three rockets after one press, ignoring held keys and duplicate presses', async()=>{
    const {a,b,idA,idB,code}=await setup(12);a.send({type:'start'});await b.state(s=>s.phase==='playing');
    const world=server!.rooms.rooms.get(code)!.simulation,shooter=world.players.get(idA)!,target=world.players.get(idB)!;
    Object.assign(shooter,{x:60,z:0,yaw:0,invulnerableUntil:0});Object.assign(target,{x:30,z:45});equip(shooter,'rocket');const since=world.time;
    a.send({type:'input',commands:[{...NEUTRAL,seq:1,fire:true,firePress:1}]});
    const states=await Promise.all([a.state(s=>s.time>since+1.5),b.state(s=>s.time>since+1.5)]);
    for(const state of states)expect(state.players.find(p=>p.id===idA)).toMatchObject({weapon:null,ammo:0,attacking:false});
    for(const peer of [a,b])expect(new Set(peer.messages.flatMap(m=>m.type==='snapshot'?m.state.events.filter(e=>e.kind==='fire'&&e.weapon==='rocket').map(e=>e.id):[])).size).toBe(3);
    equip(shooter,'boost');a.send({type:'input',commands:[{...NEUTRAL,seq:2,fire:true,firePress:1}]});await b.state(s=>s.players.find(p=>p.id===idA)?.ack===2);expect(shooter.boostUntil).toBe(0);
  });
  it('synchronizes a full assisted machine-gun attack after one press and immediate release', async () => {
    const { a, b, idA, idB, code } = await setup(12); a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    const world = server!.rooms.rooms.get(code)!.simulation, shooter = world.players.get(idA)!, target = world.players.get(idB)!;
    Object.assign(shooter, { x: -23, z: 0, yaw: 0, invulnerableUntil: 0 }); Object.assign(target, { x: -22, z: 8, invulnerableUntil: 0 });
    world.random = () => 0.5; equip(shooter, 'machineGun');
    a.send({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2 }] });
    await b.state(s => s.players.find(p => p.id === idA)?.attacking === true);
    const finished = (s: Snapshot) => s.tick > 210 && s.players.find(p => p.id === idA)?.ammo === 0;
    const states = await Promise.all([a.state(finished,9000), b.state(finished,9000)]);
    for (const state of states) expect(state.players.find(p => p.id === idA)).toMatchObject({ health: 100, score: 1, weapon: null, ammo: 0, attacking: false });
    for (const peer of [a, b]) {
      const fireIds = new Set(peer.messages.flatMap(m => m.type === 'snapshot' ? m.state.events.filter(e => e.kind === 'fire' && e.player === idA).map(e => e.id) : []));
      expect(fireIds.size).toBe(WEAPONS.machineGun.ammo);
    }
  });
  it('synchronizes atomic pickup collection, ten-second respawn, and late-join states', async () => {
    const { a, b, idA, idB, code } = await setup(); a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    const world = server!.rooms.rooms.get(code)!.simulation, box = world.pickups[0]!;
    const collector = world.players.get(idA)!, contender = world.players.get(idB)!;
    world.random = () => 0;
    Object.assign(collector, { x: box.x - 0.3, y: box.y, z: box.z, vx: 0, vy: 0, vz: 0 });
    Object.assign(contender, { x: box.x + 0.3, y: box.y, z: box.z, vx: 0, vy: 0, vz: 0 });
    const collected = (s: Snapshot) => s.pickups[0]!.active === false;
    const [stateA, stateB] = await Promise.all([a.state(collected), b.state(collected)]);
    expect(stateA.tick).toBe(stateB.tick); expect(stateA.pickups).toEqual(stateB.pickups);
    expect(stateA.players.find(p => p.id === idA)).toMatchObject({ weapon: 'machineGun', ammo: WEAPONS.machineGun.ammo });
    expect(stateB.players.find(p => p.id === idB)!.weapon).toBeNull();
    const collection = stateB.events.find(e => e.kind === 'pickup' && e.pickupId === box.id)!;
    expect(stateA.events.filter(e => e.kind === 'pickup')).toEqual([collection]);
    expect(box.availableAt - collection.at).toBeCloseTo(10, 3);
    Object.assign(collector, { x: -30, z: 30 }); Object.assign(contender, { x: 30, z: -30 });
    const late = await Peer.open(server!.port); peers.push(late); late.send({ type: 'join', name: 'Late', code });
    const lateInactive = await late.state(s => s.phase === 'playing' && s.players.length === 3);
    expect(lateInactive.pickups).toEqual(stateB.pickups);
    late.send({ type: 'pickup', pickupId: box.id, weapon: 'rocket' });
    await late.wait(m => m.type === 'error' && m.message.includes('Unsupported'));
    expect([...world.players.values()].find(p => p.name === 'Late')!.weapon).toBeNull();
    const spawned = (s: Snapshot) => s.events.some(e => e.kind === 'pickupSpawn' && e.pickupId === box.id);
    const states = await Promise.all([a.state(spawned, 15000), b.state(spawned, 15000), late.state(spawned, 15000)]);
    expect(new Set(states.map(s => s.tick)).size).toBe(1);
    for (const state of states) {
      expect(state.pickups[0]).toMatchObject({ id: box.id, active: true }); expect(state.pickups[0]!.x).toBeCloseTo(box.x,3); expect(state.pickups[0]!.y).toBeCloseTo(box.y,3); expect(state.pickups[0]!.z).toBeCloseTo(box.z,3);
      expect(state.events.find(e => e.kind === 'pickupSpawn' && e.pickupId === box.id)!.at - collection.at).toBeCloseTo(10, 3);
    }
    const after = await Peer.open(server!.port); peers.push(after); after.send({ type: 'join', name: 'After respawn', code });
    const lateActive = await after.state(s => s.players.length === 4); expect(lateActive.pickups).toEqual(states[0]!.pickups);
    const priorDeadline = box.availableAt;
    Object.assign(contender, { x: box.x, y: box.y, z: box.z });
    const again = await a.state(s => !s.pickups[0]!.active && s.pickups[0]!.availableAt > priorDeadline + 9);
    expect(again.players.find(p => p.id === idB)).toMatchObject({ weapon: 'machineGun', ammo: WEAPONS.machineGun.ammo });
  }, 20000);
  it('broadcasts server-selected machine-gun assistance and rejects client damage/target claims', async () => {
    const { a, b, idA, idB, code } = await setup(); a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    const world = server!.rooms.rooms.get(code)!.simulation, shooter = world.players.get(idA)!, victim = world.players.get(idB)!;
    world.random = () => 0.5;
    Object.assign(shooter, { x: -23, z: 0, yaw: 0, invulnerableUntil: 0 }); Object.assign(victim, { x: -21.4, z: 8, invulnerableUntil: 0 }); equip(shooter, 'machineGun');
    const lock = await b.state(s => s.players.find(p => p.id === idA)?.aimTarget === idB); expect(lock.players.find(p => p.id === idB)!.health).toBe(100);
    a.send({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, fire: true, target: 'forged', damage: 10000 }] });
    const hit = (s: Snapshot) => (s.players.find(p => p.id === idB)?.health ?? 100) < 100;
    const [stateA, stateB] = await Promise.all([a.state(hit), b.state(hit)]);
    expect(stateA.players.find(p => p.id === idB)!.health).toBeLessThan(100); expect(stateB.players.find(p => p.id === idB)!.health).toBe(stateA.players.find(p=>p.id===idB)!.health);
    a.send({ type: 'input', commands: [{ ...NEUTRAL, seq: 2 }] });
    expect(stateB.players.find(p => p.id === idA)!.ammo).toBeLessThan(WEAPONS.machineGun.ammo);
    b.send({ type: 'eliminate', target: idA }); await b.wait(m => m.type === 'error' && m.message.includes('Unsupported'));
    expect(shooter.health).toBe(100);
  });
  it('sends a restart notice, clears membership, and shuts down idempotently', async () => {
    const { a, b } = await setup();
    const closed = [a, b].map(p => new Promise<number>(ok => p.ws.once('close', code => ok(code))));
    const first = server!.close(); expect(server!.close()).toBe(first); await first;
    expect(await Promise.all(closed)).toEqual([1012, 1012]); expect(server!.rooms.memberships.size).toBe(0); expect(server!.rooms.rooms.size).toBe(0);
  });
  it('rejoins an existing match after disconnect using a new temporary identity', async () => {
    const { a, b, idA, idB, code } = await setup(); a.send({ type: 'start' }); await b.state(s => s.phase === 'playing'); a.ws.terminate();
    await b.state(s => s.players.length === 1 && s.host === idB);
    const replacement = await Peer.open(server!.port); peers.push(replacement); replacement.send({ type: 'join', name: 'Alpha', code });
    const welcome = await replacement.wait(m => m.type === 'welcome') as Extract<ServerMessage, { type: 'welcome' }>;
    expect(welcome.id).not.toBe(idA); const state = await replacement.state(s => s.players.length === 2 && s.phase === 'playing');
    expect(state.players.find(p => p.id === welcome.id)).toMatchObject({ health: 100, score: 0 });
  });
  it('supports separate frontend origins, CORS health checks, and backend-only hosting', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1', serveClient: false, allowedOrigins: ['https://game.example'] });
    const base = `http://127.0.0.1:${server.port}`;
    expect((await fetch(base)).status).toBe(404);
    expect((await fetch(`${base}/%E0%A4`)).status).toBe(400);
    const health = await fetch(`${base}/health`, { headers: { Origin: 'https://game.example' } });
    expect(health.status).toBe(200); expect(health.headers.get('access-control-allow-origin')).toBe('https://game.example');
    expect((await fetch(`${base}/health`, { headers: { Origin: 'https://denied.example' } })).status).toBe(403);
    expect((await fetch(`${base}/health`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/health`, { method: 'OPTIONS', headers: { Origin: 'https://game.example' } })).status).toBe(204);
    const denied = new WebSocket(`${base.replace('http:', 'ws:')}/ws`);
    const status = await new Promise<string>(ok => denied.once('error', error => ok(error.message))); expect(status).toContain('403');
  });
  it('fails cleanly if its port is in use and can bind the port again after shutdown', async () => {
    server = await startServer({ port: 0, host: '127.0.0.1' }); const port = server.port;
    await expect(startServer({ port, host: '127.0.0.1' })).rejects.toMatchObject({ code: 'EADDRINUSE' });
    await server.close(); server = await startServer({ port, host: '127.0.0.1' }); expect(server.port).toBe(port);
  });
  it('disconnects a message flood and preserves other room members', async () => {
    const { a, b, idB } = await setup();
    const closed = new Promise<number>(ok => a.ws.once('close', code => ok(code)));
    for (let i = 0; i < 120; i++) a.send({ type: 'ping', at: i });
    expect(await closed).toBe(1008); const state = await b.state(s => s.players.length === 1 && s.host === idB);
    expect(state.players[0]!.health).toBe(100);
  });
  it('runs eight simultaneous input streams and refuses a ninth player at capacity', async () => {
    const { a, b, code } = await setup(); const participants = [a, b];
    for (let i = 2; i < 8; i++) {
      const peer = await Peer.open(server!.port); peers.push(peer); participants.push(peer);
      peer.send({ type: 'join', name: `Player ${i + 1}`, code }); await peer.wait(m => m.type === 'welcome');
    }
    const extra = await Peer.open(server!.port); peers.push(extra); extra.send({ type: 'join', name: 'Ninth', code }); await extra.wait(m => m.type === 'error' && m.message.includes('full'));
    a.send({ type: 'start' }); await a.state(s => s.phase === 'playing');
    const sequence = participants.map(() => 0);
    const stream = setInterval(() => participants.forEach((peer, index) => peer.send({ type: 'input', commands: Array.from({ length: 3 }, () => ({ ...NEUTRAL, seq: ++sequence[index]!, throttle: 1, steer: index % 2 ? 0.25 : -0.25 })) })), 50);
    try {
      const states = await Promise.all(participants.map(peer => peer.state(s => s.tick >= 45 && s.players.every(p => p.ack >= 30))));
      for (const state of states) { expect(state.players).toHaveLength(8); expect(state.players.every(p => Number.isFinite(p.x) && Number.isFinite(p.z) && p.health === 100)).toBe(true); }
      expect(new Set(states.map(s => s.tick)).size).toBe(1);
    } finally { clearInterval(stream); }
  });
  it('creates/joins, rejects non-host starts and combat claims, moves from input, and transfers host on disconnect', async () => {
    const { a, b, idA, idB, code } = await setup(); expect((await b.state(s => s.players.length === 2)).code).toBe(code);
    b.send({ type: 'start' }); await b.wait(m => m.type === 'error' && m.message.includes('host'));
    a.send({ type: 'start' }); await b.state(s => s.phase === 'playing');
    b.send({ type: 'eliminate', target: idA }); await b.wait(m => m.type === 'error' && m.message.includes('Unsupported'));
    a.send({ type: 'input', commands: Array.from({ length: 6 }, (_, i) => ({ ...NEUTRAL, seq: i + 1, throttle: 1 })) });
    const moved = await b.state(s => (s.players.find(p => p.id === idA)?.ack ?? 0) >= 6);
    expect(moved.players.find(p => p.id === idA)!.x).toBeLessThan(-4); expect(moved.players.find(p => p.id === idA)!.health).toBe(100);
    a.ws.close(); await b.state(s => s.players.length === 1 && s.host === idB); expect(server!.rooms.memberships.has(idA)).toBe(false);
    b.send({ type: 'leave' }); await b.wait(m => m.type === 'left'); expect(server!.rooms.rooms.size).toBe(0);
  });
  it('synchronizes authoritative combat, ammo, eliminations, final scores, and replay across two peers', async () => {
    const { a, b, idA, idB, code } = await setup(5);
    a.send({ type: 'start' }); await a.state(s => s.phase === 'playing');
    // Fixture access is local to this test; there is no weapon/position cheat in the public protocol.
    const world = server!.rooms.rooms.get(code)!.simulation;
    const shooter = world.players.get(idA)!, victim = world.players.get(idB)!;
    Object.assign(shooter, { x: 60, z: 0, yaw: 0, invulnerableUntil: 0 }); Object.assign(victim, { x: 60, z: 6, invulnerableUntil: 0 }); equip(shooter, 'machineGun');
    let seq = 0;
    const fire = setInterval(() => a.send({ type: 'input', commands: Array.from({ length: 3 }, () => ({ ...NEUTRAL, seq: ++seq, fire: true })) }), 50);
    try {
      const killedA = await a.state(s => s.players.some(p => p.id === idB && p.health === 0));
      const killedB = await b.state(s => s.players.some(p => p.id === idB && p.health === 0));
      expect(killedA.players.find(p => p.id === idA)!.score).toBe(1); expect(killedB.players.find(p => p.id === idA)!.score).toBe(1);
      expect(killedB.players.find(p => p.id === idA)!.ammo).toBeLessThan(WEAPONS.machineGun.ammo);
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
