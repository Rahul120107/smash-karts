import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { WebSocket, WebSocketServer } from 'ws';
import { CONFIG, DT } from '../../../shared/src/config.js';
import type { ServerMessage } from '../../../shared/src/types.js';
import { RoomManager } from '../rooms/manager.js';
import { parseMessage } from './validation.js';
import { encodeSnapshot } from './serialization.js';

export interface ServerOptions { port?: number; host?: string; capacity?: number; duration?: number; staticDir?: string; allowedOrigins?: string[]; serveClient?: boolean; logger?: (entry: Record<string, unknown>) => void }
export async function startServer(options: ServerOptions = {}) {
  const rooms = new RoomManager(options.capacity, options.duration);
  const clients = new Map<string, WebSocket>();
  const lastEvents = new Map<string, number>();
  let closing = false;
  const log = (event: string, detail: Record<string, unknown> = {}) => options.logger?.({ event, ...detail });
  const originAllowed = (origin: string) => !options.allowedOrigins?.length || options.allowedOrigins.includes(origin);
  const root = resolve(options.staticDir ?? 'client/dist');
  const http = createServer(async (req, res) => {
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end('Invalid request path.'); return; }
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Vary', 'Origin');
      if (!originAllowed(origin)) { res.writeHead(403); res.end('Origin not allowed.'); return; }
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS' }); res.end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (path === '/health') {
      res.writeHead(closing ? 503 : 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ ok: !closing, rooms: rooms.rooms.size, players: rooms.memberships.size })); return;
    }
    if (options.serveClient === false) { res.writeHead(404); res.end('Frontend is hosted separately.'); return; }
    try {
      let file = resolve(root, '.' + path);
      if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
      if (file === root || !(await stat(file).catch(() => null))?.isFile()) {
        if (extname(path)) { res.writeHead(404); res.end(); return; }
        file = resolve(root, 'index.html');
      }
      const body = await readFile(file);
      const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { res.writeHead(404); res.end('Build the client with npm run build, or use npm run dev.'); }
      else if (error instanceof URIError) { res.writeHead(400); res.end('Invalid request path.'); }
      else { log('http_error', { message: error instanceof Error ? error.message : String(error) }); res.writeHead(500); res.end('Request failed.'); }
    }
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096, perMessageDeflate: false,
    verifyClient: ({ origin }: { origin: string }, done) => {
      const accepted = !closing && originAllowed(origin);
      if (!accepted) log('upgrade_rejected', { origin, closing });
      done(accepted, closing ? 503 : 403, closing ? 'Server restarting' : 'Origin not allowed');
    } });
  function send(ws: WebSocket, m: ServerMessage) { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256000) ws.send(JSON.stringify(m)); }
  function broadcast() {
    if (closing) return;
    for (const room of rooms.rooms.values()) {
      const state = room.simulation.snapshot(room.code, room.host, rooms.capacity);
      const cache = new Map<number, string>();
      for (const id of room.simulation.players.keys()) {
        const ws = clients.get(id);
        if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 256000) {
          const last = lastEvents.get(id) ?? 0;
          let encoded = cache.get(last); if (!encoded) { encoded = encodeSnapshot(state, last); cache.set(last, encoded); }
          ws.send(encoded); lastEvents.set(id, state.events.at(-1)?.id ?? last);
        }
      }
    }
  }
  wss.on('connection', ws => {
    const id = randomUUID(); clients.set(id, ws); log('connected', { id, connections: clients.size });
    let windowStart = performance.now(), count = 0, alive = true;
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 10000);
    ws.on('message', raw => {
      if (closing || ws.readyState !== WebSocket.OPEN) return;
      const now = performance.now(); if (now - windowStart > 1000) { count = 0; windowStart = now; }
      if (++count > 100) { log('rate_limited', { id }); ws.close(1008, 'Message rate exceeded'); return; }
      try {
        const m = parseMessage(raw.toString());
        switch (m.type) {
          case 'create': case 'join': {
            const room = m.type === 'create' ? rooms.create(id, m.name) : rooms.join(id, m.name, m.code);
            lastEvents.delete(id);
            log(m.type === 'create' ? 'room_created' : 'room_joined', { id, code: room.code });
            send(ws, { type: 'welcome', id, code: room.code }); broadcast(); break;
          }
          case 'leave': rooms.leave(id); lastEvents.delete(id); send(ws, { type: 'left' }); broadcast(); break;
          case 'start': rooms.start(id); log('match_started', { id, code: rooms.roomFor(id)?.code }); broadcast(); break;
          case 'input': rooms.roomFor(id)?.simulation.enqueue(id, m.commands); break;
          case 'ping': send(ws, { type: 'pong', at: m.at }); break;
        }
      } catch (error) { const message = error instanceof Error ? error.message : 'Request failed.'; log('request_rejected', { id, message }); send(ws, { type: 'error', message }); }
    });
    ws.on('close', (code, reason) => { clearInterval(heartbeat); rooms.leave(id); clients.delete(id); lastEvents.delete(id); log('disconnected', { id, code, reason: reason.toString(), connections: clients.size }); broadcast(); });
    ws.on('error', error => log('websocket_error', { id, message: error.message }));
  });
  wss.on('error', error => log('websocket_server_error', { message: error.message }));
  try {
    await new Promise<void>((ok, fail) => { http.once('error', fail); http.listen(options.port ?? 3001, options.host ?? '0.0.0.0', () => { http.off('error', fail); ok(); }); });
  } catch (error) { wss.close(); throw error; }
  http.on('error', error => log('http_server_error', { message: error.message }));
  let previous = performance.now(), accumulator = 0, networkTicks = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    let steps = 0;
    while (accumulator >= DT && steps++ < 15) {
      let pickupChanged = false;
      for (const room of rooms.rooms.values()) {
        const wasPlaying = room.simulation.phase === 'playing'; room.simulation.step();
        if (wasPlaying && room.simulation.phase === 'playing' && room.simulation.events.some(e =>
          e.at === room.simulation.time && (e.kind === 'pickup' || e.kind === 'pickupSpawn'))) pickupChanged = true;
        if (wasPlaying && room.simulation.phase === 'finished') { room.lastActivity = Date.now(); log('match_finished', { code: room.code }); }
      }
      accumulator -= DT;
      if (++networkTicks % (CONFIG.tickRate / CONFIG.snapshotRate) === 0 || pickupChanged) broadcast();
    }
  }, 4);
  const cleanup = setInterval(() => { for (const id of rooms.cleanup()) { const ws = clients.get(id); if (ws) { send(ws, { type: 'error', message: 'Room closed after ten minutes of inactivity.' }); send(ws, { type: 'left' }); } } }, 30000);
  const address = http.address(); const port = typeof address === 'object' && address ? address.port : 3001;
  log('listening', { port, host: options.host ?? '0.0.0.0' });
  let closePromise: Promise<void> | undefined;
  const close = () => closePromise ??= (async () => {
    closing = true; clearInterval(timer); clearInterval(cleanup); log('shutdown_started');
    for (const ws of clients.values()) ws.close(1012, 'Server restarting');
    const deadline = setTimeout(() => { for (const ws of clients.values()) ws.terminate(); http.closeAllConnections(); }, 1000);
    try {
      await Promise.all([new Promise<void>(ok => wss.close(() => ok())), new Promise<void>(ok => http.close(() => ok()))]);
      log('shutdown_complete');
    } finally { clearTimeout(deadline); }
  })();
  return { port, rooms, close };
}
