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

export interface ServerOptions { port?: number; host?: string; capacity?: number; duration?: number; staticDir?: string; allowedOrigins?: string[] }
export async function startServer(options: ServerOptions = {}) {
  const rooms = new RoomManager(options.capacity, options.duration);
  const clients = new Map<string, WebSocket>();
  const root = resolve(options.staticDir ?? 'client/dist');
  const http = createServer(async (req, res) => {
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, rooms: rooms.rooms.size, players: rooms.memberships.size })); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
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
      else { console.error('HTTP request failed', error); res.writeHead(500); res.end('Request failed.'); }
    }
  });
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: 4096, perMessageDeflate: false,
    verifyClient: ({ origin }: { origin: string }) => !options.allowedOrigins?.length || options.allowedOrigins.includes(origin) });
  function send(ws: WebSocket, m: ServerMessage) { if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 256000) ws.send(JSON.stringify(m)); }
  function broadcast() {
    for (const room of rooms.rooms.values()) {
      const message: ServerMessage = { type: 'snapshot', state: room.simulation.snapshot(room.code, room.host, rooms.capacity) };
      const encoded = JSON.stringify(message);
      for (const id of room.simulation.players.keys()) {
        const ws = clients.get(id);
        if (ws?.readyState === WebSocket.OPEN && ws.bufferedAmount < 256000) ws.send(encoded);
      }
    }
  }
  wss.on('connection', ws => {
    const id = randomUUID(); clients.set(id, ws);
    let windowStart = performance.now(), count = 0, alive = true;
    ws.on('pong', () => { alive = true; });
    const heartbeat = setInterval(() => { if (!alive) ws.terminate(); else { alive = false; ws.ping(); } }, 10000);
    ws.on('message', raw => {
      const now = performance.now(); if (now - windowStart > 1000) { count = 0; windowStart = now; }
      if (++count > 100) { ws.close(1008, 'Message rate exceeded'); return; }
      try {
        const m = parseMessage(raw.toString());
        switch (m.type) {
          case 'create': case 'join': {
            const room = m.type === 'create' ? rooms.create(id, m.name) : rooms.join(id, m.name, m.code);
            send(ws, { type: 'welcome', id, code: room.code }); broadcast(); break;
          }
          case 'leave': rooms.leave(id); send(ws, { type: 'left' }); broadcast(); break;
          case 'start': rooms.start(id); broadcast(); break;
          case 'input': rooms.roomFor(id)?.simulation.enqueue(id, m.commands); break;
          case 'ping': send(ws, { type: 'pong', at: m.at }); break;
        }
      } catch (error) { send(ws, { type: 'error', message: error instanceof Error ? error.message : 'Request failed.' }); }
    });
    ws.on('close', () => { clearInterval(heartbeat); rooms.leave(id); clients.delete(id); broadcast(); });
    ws.on('error', error => console.error('WebSocket transport error:', error.message));
  });
  let previous = performance.now(), accumulator = 0, networkTicks = 0;
  const timer = setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - previous) / 1000, 0.25); previous = now;
    let steps = 0;
    while (accumulator >= DT && steps++ < 15) {
      for (const room of rooms.rooms.values()) room.simulation.step();
      accumulator -= DT;
      if (++networkTicks % (CONFIG.tickRate / CONFIG.snapshotRate) === 0) broadcast();
    }
  }, 4);
  const cleanup = setInterval(() => { for (const id of rooms.cleanup()) { const ws = clients.get(id); if (ws) { send(ws, { type: 'error', message: 'Room closed after ten minutes of inactivity.' }); send(ws, { type: 'left' }); } } }, 30000);
  await new Promise<void>((ok, fail) => { http.once('error', fail); http.listen(options.port ?? 3001, options.host ?? '0.0.0.0', () => { http.off('error', fail); ok(); }); });
  const address = http.address(); const port = typeof address === 'object' && address ? address.port : 3001;
  return { port, rooms, close: async () => {
    clearInterval(timer); clearInterval(cleanup);
    for (const ws of clients.values()) ws.terminate();
    await new Promise<void>(ok => wss.close(() => ok()));
    await new Promise<void>(ok => http.close(() => ok()));
  } };
}
