import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';

// Runs the compiled entry point with production configuration, not test-only state access.
for (const invalid of [{ NODE_ENV: 'production', ALLOWED_ORIGINS: '' }, { NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://game.example', PORT: 'invalid' }]) {
  const result = spawnSync(process.execPath, ['dist/server/src/index.js'], { env: { ...process.env, ...invalid }, encoding: 'utf8', windowsHide: true });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /ALLOWED_ORIGINS|PORT must/);
}
const invalidBuild = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'client/vite.config.ts'],
  { env: { ...process.env, RENDER: 'true', VITE_SERVER_URL: '', VITE_WS_URL: '' }, encoding: 'utf8', windowsHide: true });
assert.notEqual(invalidBuild.status, 0); assert.match(invalidBuild.stderr, /Set VITE_SERVER_URL/);
const allocator = createServer(); await new Promise(ok => allocator.listen(0, '127.0.0.1', ok));
const port = allocator.address().port; await new Promise(ok => allocator.close(ok));
const origin = 'https://frontend.example';
const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), HOST: 'localhost', SERVE_CLIENT: 'false',
  ALLOWED_ORIGINS: origin, ROOM_CAPACITY: '8', MATCH_SECONDS: '5' };
// Windows cannot deliver POSIX SIGTERM via child.kill. Invoke the same handler over IPC.
const signalHarness = `process.on('message', m => { if (m === 'shutdown') { process.emit('SIGTERM'); process.disconnect(); } });`;
const child = spawn(process.execPath, ['--env-file-if-exists=.env', '--import', `data:text/javascript,${encodeURIComponent(signalHarness)}`, 'dist/server/src/index.js'],
  { env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
let exitResult; child.once('exit', (code, signal) => { exitResult = { code, signal }; });
const peers = []; let stream;
async function wait(check, label, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = check(); if (result) return result; await delay(20); }
  throw new Error(`Timed out: ${label}\n${output}`);
}
async function peer() {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin });
  const result = { ws, messages: [], seq: 0, fire: false, closed: new Promise(ok => ws.once('close', code => ok(code))) };
  ws.on('message', data => { result.messages.push(JSON.parse(data.toString())); });
  ws.on('error', error => { output += `\nPeer error: ${error.message}`; });
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail); }); peers.push(result); return result;
}
const send = (peer, message) => peer.ws.send(JSON.stringify(message));
const state = (peer, predicate, since = 0) => peer.messages.slice(since).reverse().find(m => m.type === 'snapshot' && predicate(m.state))?.state;
try {
  for (let i = 0; i < 100; i++) {
    try { const health = await fetch(`http://127.0.0.1:${port}/health`); if (health.ok) break; } catch { /* Wait for listen. */ }
    await delay(50);
  }
  const health = await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: origin } });
  assert.deepEqual(await health.json(), { ok: true, rooms: 0, players: 0 }); assert.equal(health.headers.get('access-control-allow-origin'), origin);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`, { headers: { Origin: 'https://denied.example' } })).status, 403);
  const host = await peer(); send(host, { type: 'create', name: 'Production 1' });
  const welcome = await wait(() => host.messages.find(m => m.type === 'welcome'), 'create room');
  for (let i = 1; i < 8; i++) { const guest = await peer(); send(guest, { type: 'join', name: `Production ${i + 1}`, code: welcome.code }); await wait(() => guest.messages.find(m => m.type === 'welcome'), 'join room'); }
  const population = await fetch(`http://127.0.0.1:${port}/health`); assert.equal((await population.json()).players, 8);
  send(host, { type: 'start' }); await wait(() => state(host, s => s.phase === 'playing'), 'start match');
  stream = setInterval(() => peers.forEach((peer, index) => {
    if (peer.ws.readyState === WebSocket.OPEN) send(peer, { type: 'input', commands: Array.from({ length: 3 }, () => ({ seq: ++peer.seq, throttle: 1, steer: index === 0 ? 0 : index % 2 ? 0.2 : -0.2, fire: peer.fire, drift: false })) });
  }), 50);
  const equipped = await wait(() => state(host, s => !!s.players.find(p => p.id === welcome.id)?.weapon), 'authoritative pickup');
  const ammo = equipped.players.find(p => p.id === welcome.id).ammo; host.fire = true;
  await wait(() => state(host, s => s.players.find(p => p.id === welcome.id)?.ammo < ammo), 'weapon activation');
  await Promise.all(peers.map(peer => wait(() => state(peer, s => s.tick >= 150 && s.players.every(p => p.ack >= 60)), 'eight concurrent input streams')));
  const reference = host.messages.find(m => m.type === 'snapshot' && m.state.tick >= 150).state;
  for (const participant of peers) {
    const synced = await wait(() => state(participant, s => s.tick === reference.tick), 'identical authoritative snapshot');
    assert.deepEqual(synced.players, reference.players); assert.deepEqual(synced.projectiles, reference.projectiles); assert.deepEqual(synced.pickups, reference.pickups);
  }
  await Promise.all(peers.map(peer => wait(() => state(peer, s => s.phase === 'finished' && s.remaining === 0), 'match timer finish')));
  clearInterval(stream); stream = undefined; const replayAfter = host.messages.length; send(host, { type: 'start' });
  await wait(() => state(host, s => s.phase === 'playing' && s.tick < 20 && s.players.every(p => p.health === 100 && p.score === 0), replayAfter), 'replay');
  host.ws.terminate(); const newHost = peers[1].messages.find(m => m.type === 'welcome').id;
  await wait(() => state(peers[1], s => s.players.length === 7 && s.host === newHost), 'disconnect and host transfer');
  const replacement = await peer(); send(replacement, { type: 'join', name: 'Reconnected', code: welcome.code });
  const fresh = await wait(() => replacement.messages.find(m => m.type === 'welcome'), 'fresh session rejoin'); assert.notEqual(fresh.id, welcome.id);
  await wait(() => state(replacement, s => s.players.length === 8), 'rejoin membership');
  child.send('shutdown'); assert.deepEqual(await wait(() => exitResult, 'shutdown complete'), { code: 0, signal: null });
  for (const participant of peers.slice(1)) assert.equal(await participant.closed, 1012);
  assert.match(output, /shutdown_complete/);
  console.log('PASS: compiled production entry, PORT/public binding, CORS/health, eight clients, pickups/weapons, synchronized snapshots, timer/replay, disconnect/rejoin, graceful restart handler.');
  console.log('SIGTERM handler was invoked through local IPC; actual Linux signal delivery and Render deployment remain unverified.');
} finally {
  clearInterval(stream); for (const participant of peers) participant.ws.terminate();
  if (child.exitCode === null && child.signalCode === null) child.kill();
}
