import { test, expect, type BrowserContext } from '@playwright/test';
import { createServer } from 'node:https';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WebSocket, WebSocketServer } from 'ws';
import { startServer } from '../../server/src/networking/server.js';
import type { ServerMessage, Snapshot } from '../../shared/src/types.js';

// Local TLS termination mirrors Render: HTTPS/WSS edge -> plaintext authoritative Node.
const exec = promisify(execFile);
let backend: Awaited<ReturnType<typeof startServer>>;
let frontend: ReturnType<typeof createServer>, edge: ReturnType<typeof createServer>, bridge: WebSocketServer;
const tunnels = new Set<WebSocket>(); const contexts: BrowserContext[] = [];
const testRoot = resolve('test-results'); let scratch: string; let frontendUrl: string;
const listen = (server: ReturnType<typeof createServer>) => new Promise<number>((ok, fail) => {
  server.once('error', fail); server.listen(0, '127.0.0.1', () => { const addr = server.address(); ok(typeof addr === 'object' && addr ? addr.port : 0); });
});
test.beforeAll(async () => {
  await mkdir(testRoot, { recursive: true }); scratch = await mkdtemp(resolve(testRoot, 'render-tls-'));
  const openssl = process.env.OPENSSL_BIN || (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  await exec(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', resolve(scratch, 'key.pem'), '-out', resolve(scratch, 'cert.pem')]);
  const tls = { key: await readFile(resolve(scratch, 'key.pem')), cert: await readFile(resolve(scratch, 'cert.pem')) };
  edge = createServer(tls, (_req, res) => { res.writeHead(404); res.end(); });
  bridge = new WebSocketServer({ server: edge, path: '/ws' });
  bridge.on('connection', (browser, request) => {
    const upstream = new WebSocket(`ws://127.0.0.1:${backend.port}/ws`, { origin: request.headers.origin });
    tunnels.add(browser); tunnels.add(upstream);
    const queued: { data: Buffer; binary: boolean }[] = [];
    browser.on('message', (data, binary) => {
      if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary }); else queued.push({ data: Buffer.from(data as Buffer), binary });
    });
    upstream.on('open', () => { for (const packet of queued.splice(0)) upstream.send(packet.data, { binary: packet.binary }); });
    upstream.on('message', (data, binary) => { if (browser.readyState === WebSocket.OPEN) browser.send(data, { binary }); });
    browser.on('close', () => { tunnels.delete(browser); upstream.close(); });
    upstream.on('close', code => { tunnels.delete(upstream); if (browser.readyState === WebSocket.OPEN) browser.close(code === 1006 ? 1011 : code); });
    browser.on('error', () => upstream.terminate()); upstream.on('error', () => browser.close(1011, 'Backend connection failed'));
  });
  const backendUrl = `https://localhost:${await listen(edge)}`;
  await exec(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'client/vite.config.ts', '--outDir', resolve(scratch, 'client')],
    { env: { ...process.env, RENDER: 'true', VITE_SERVER_URL: backendUrl, VITE_WS_URL: '' } });
  frontend = createServer(tls, async (req, res) => {
    try {
      const pathname = new URL(req.url ?? '/', 'https://localhost').pathname;
      const file = resolve(scratch, 'client', '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(resolve(scratch, 'client') + sep)) { res.writeHead(403); res.end(); return; }
      const body = await readFile(file); const mime: Record<string, string> = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' };
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }); res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  frontendUrl = `https://localhost:${await listen(frontend)}`;
  backend = await startServer({ port: 0, host: '127.0.0.1', serveClient: false, allowedOrigins: [frontendUrl], duration: 30 });
});
test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await backend?.close(); for (const socket of tunnels) socket.terminate();
  if (bridge) await new Promise<void>(ok => bridge.close(() => ok()));
  for (const server of [edge, frontend]) if (server) { server.closeAllConnections(); await new Promise<void>(ok => server.close(() => ok())); }
  if (scratch && resolve(scratch).startsWith(testRoot + sep)) await rm(scratch, { recursive: true, force: true });
});

test('separate HTTPS static frontend and secure WebSockets support two browser players', async ({ browser }) => {
  const aContext = await browser.newContext({ ignoreHTTPSErrors: true }), bContext = await browser.newContext({ ignoreHTTPSErrors: true }); contexts.push(aContext, bContext);
  const a = await aContext.newPage(), b = await bContext.newPage(); const errors: string[] = []; const urls: string[] = []; let state: Snapshot | undefined;
  for (const page of [a, b]) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    page.on('websocket', ws => { urls.push(ws.url()); ws.on('framereceived', frame => {
      const message = JSON.parse(frame.payload.toString()) as ServerMessage; if (message.type === 'snapshot') state = message.state;
    }); });
    await page.goto(frontendUrl);
  }
  await a.getByLabel('YOUR NICKNAME').fill('Secure host'); await a.getByRole('button', { name: 'Create room' }).click(); const code = await a.getByTestId('room-code').innerText();
  await b.getByLabel('YOUR NICKNAME').fill('Secure guest'); await b.getByLabel('Room code').fill(code); await b.getByRole('button', { name: 'Join' }).click();
  await expect(a.locator('.lobby-players')).toContainText('Secure guest'); expect(urls).toHaveLength(2);
  expect(urls.every(url => url.startsWith('wss://localhost:') && !url.includes(new URL(frontendUrl).port))).toBe(true);
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } }); await a.keyboard.down('KeyW');
  await expect(a.getByTestId('equipped-weapon')).not.toHaveText('Find a weapon'); await a.keyboard.up('KeyW');
  const ammo = state!.players.find(p => p.name === 'Secure host')!.ammo; await a.keyboard.down('Space');
  await expect.poll(() => state?.players.find(p => p.name === 'Secure host')?.ammo ?? 100).toBeLessThan(ammo); await a.keyboard.up('Space');
  expect(state!.pickups[0]!.availableAt).toBeGreaterThan(0); expect(errors).toEqual([]);
});
