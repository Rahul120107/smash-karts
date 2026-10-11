import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { startServer } from '../../server/src/networking/server.js';
import { WEAPON_IDS, WEAPONS } from '../../shared/src/weapons.js';
import type { ServerMessage, Snapshot } from '../../shared/src/types.js';
import { writeFile } from 'node:fs/promises';
let server: Awaited<ReturnType<typeof startServer>>;
let contexts: BrowserContext[] = [];
const errors: string[] = [];
test.beforeEach(async () => { server = await startServer({ port: 0, host: '127.0.0.1', duration: 12 }); errors.length = 0; });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.close())); await server.close(); expect(errors).toEqual([]); });
function observe(page: Page) {
  const observed: { latest: Snapshot | null; history: Snapshot[] } = { latest: null, history: [] };
  page.on('pageerror', error => errors.push(error.message));
  page.on('websocket', ws => ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString()) as ServerMessage;
    if (message.type === 'snapshot') { observed.latest = message.state; observed.history.push(message.state); if (observed.history.length > 1000) observed.history.shift(); }
  }));
  return observed;
}
async function lobby(host: Page, guest: Page) {
  await host.goto(`http://127.0.0.1:${server.port}`); await guest.goto(`http://127.0.0.1:${server.port}`);
  await host.getByLabel('YOUR NICKNAME').fill('Roadrunner'); await host.getByRole('button', { name: 'Create room' }).click();
  const code = await host.getByTestId('room-code').innerText();
  await guest.getByLabel('YOUR NICKNAME').fill('Dusty'); await guest.getByLabel('Room code').fill(code); await guest.getByRole('button', { name: 'Join', exact: false }).click();
  await expect(host.locator('.lobby-players')).toContainText('Dusty'); await expect(guest.locator('.lobby-players')).toContainText('Roadrunner');
  return code;
}
test('two independent browser sessions drive, collect, fire, finish, replay, and leave', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(); const seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b);
  await a.screenshot({ path: testInfo.outputPath('lobby.png') });
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.getByRole('button', { name: 'Mute audio' }).click(); await a.keyboard.down('KeyW');
  await expect.poll(() => !!seenA.latest?.players.find(p => p.name === 'Roadrunner')?.weapon).toBe(true);
  await a.keyboard.up('KeyW'); await expect(a.getByTestId('equipped-weapon')).not.toHaveText('Find a weapon');
  const player = seenA.latest!.players.find(p => p.name === 'Roadrunner')!;
  expect(player.z).toBeLessThan(20); expect(player.ack).toBeGreaterThan(0);
  await expect.poll(() => seenB.latest?.pickups[0]?.availableAt ?? 0).toBeGreaterThan(0);
  const ammo = player.ammo;
  await a.keyboard.down('Space');
  await expect.poll(() => seenB.latest?.players.find(p => p.name === 'Roadrunner')?.ammo ?? 100).toBeLessThan(ammo);
  await a.keyboard.up('Space');
  await a.screenshot({ path: testInfo.outputPath('gameplay.png') });
  await expect(a.getByText('BATTLE COMPLETE')).toBeVisible({ timeout: 20000 }); await expect(b.getByText('BATTLE COMPLETE')).toBeVisible();
  await a.screenshot({ path: testInfo.outputPath('results.png') });
  await a.getByRole('button', { name: 'Play again' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await expect.poll(() => seenB.latest?.players.every(p => p.score === 0 && p.deaths === 0 && p.health === 100)).toBe(true);
  await a.getByRole('button', { name: 'Leave', exact: true }).click(); await expect(a.getByLabel('YOUR NICKNAME')).toBeVisible();
  await expect.poll(() => server.rooms.rooms.get(code)?.host === server.rooms.rooms.get(code)?.simulation.players.values().next().value?.id).toBe(true);
  await b.getByRole('button', { name: 'Leave', exact: true }).click(); await expect.poll(() => server.rooms.rooms.size).toBe(0);
});
test('all eight weapon categories render and synchronize combat between browsers', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(); const seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 90;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } });
  const shooter = [...world.players.values()].find(p => p.name === 'Roadrunner')!, target = [...world.players.values()].find(p => p.name === 'Dusty')!;
  for (const weapon of WEAPON_IDS) await test.step(WEAPONS[weapon].label, async () => {
    // Server fixtures arrange reproducible shots. The browser activates them through ordinary Space input.
    world.projectiles.clear(); world.events = [];
    Object.assign(shooter, { x: -8, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, health: 100, invulnerableUntil: 0, shieldUntil: 0, boostUntil: 0, weapon, ammo: WEAPONS[weapon].ammo, nextFire: 0 });
    Object.assign(target, { x: weapon === 'homing' ? -11 : -8, y: 0, z: weapon === 'mine' ? -1.8 : weapon === 'bomb' ? 19 : 6, vx: 0, vy: 0, vz: 0, health: 100, invulnerableUntil: 0, shieldUntil: 0, boostUntil: 0, respawnAt: 0 });
    await expect(a.getByTestId('equipped-weapon')).toHaveText(WEAPONS[weapon].label);
    const since = world.time;
    await a.keyboard.down('Space');
    await expect.poll(() => world.events.some(e => e.kind === 'fire' && e.weapon === weapon && e.at >= since)).toBe(true);
    await a.keyboard.up('Space');
    await expect.poll(() => seenB.history.some(s => s.events.some(e => e.kind === 'fire' && e.weapon === weapon && e.at >= since))).toBe(true);
    if (weapon === 'shield') { await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.shieldUntil ?? 0).toBeGreaterThan(since); }
    else if (weapon === 'boost') { await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.boostUntil ?? 0).toBeGreaterThan(since); }
    else { await expect.poll(() => seenB.history.some(s => s.time >= since && s.players.some(p => p.id === target.id && p.health < 100))).toBe(true); }
    expect(seenA.latest?.players.find(p => p.id === shooter.id)?.ammo).toBeLessThan(WEAPONS[weapon].ammo);
    if (weapon === 'rocket') await a.screenshot({ path: testInfo.outputPath('rocket-combat.png') });
    await a.waitForTimeout(150); // Flush the final key-up batch before arranging the next independent fixture.
  });
  expect(world.projectiles.size).toBeLessThan(20);
  await test.step('elimination, live score, respawn, and protection', async () => {
    world.projectiles.clear();
    Object.assign(shooter, { x: -8, z: 0, yaw: 0, health: 100, invulnerableUntil: 0, weapon: 'machineGun', ammo: 30, nextFire: 0 });
    Object.assign(target, { x: -8, z: 6, health: 12, invulnerableUntil: 0, shieldUntil: 0 });
    await expect(a.getByTestId('equipped-weapon')).toHaveText('Machine gun');
    const score = shooter.score, since = world.time; await a.keyboard.down('Space');
    await expect(b.getByText('KART ELIMINATED')).toBeVisible(); await a.keyboard.up('Space');
    await expect.poll(() => seenA.latest?.players.find(p => p.id === shooter.id)?.score).toBe(score + 1);
    await expect(b.getByTestId('health')).toHaveText('100 / 100');
    expect(seenB.history.some(s => s.time >= since && s.players.some(p => p.id === target.id && p.health === 100 && p.invulnerableUntil > s.time))).toBe(true);
    expect(target.deaths).toBeGreaterThan(0);
  });
  await a.screenshot({ path: testInfo.outputPath('weapons-tested.png') });
});
test('prediction remains playable with 120 ms simulated network round-trip delay', async ({ browser }) => {
  const ctx = await browser.newContext(); contexts.push(ctx); const page = await ctx.newPage();
  const pending = new Set<ReturnType<typeof setTimeout>>(); let received: Snapshot | null = null; let routing = true;
  await page.routeWebSocket('**/ws', route => {
    const upstream = route.connectToServer();
    const later = (fn: () => void) => { if (!routing) return; const timer = setTimeout(() => { pending.delete(timer); if (routing) fn(); }, 60); pending.add(timer); };
    route.onMessage(message => later(() => upstream.send(message)));
    upstream.onMessage(message => later(() => {
      const parsed = JSON.parse(message.toString()) as ServerMessage; if (parsed.type === 'snapshot') received = parsed.state;
      route.send(message);
    }));
  });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`http://127.0.0.1:${server.port}`); await page.getByLabel('YOUR NICKNAME').fill('Latency racer');
    await page.getByRole('button', { name: 'Create room' }).click(); const code = await page.getByTestId('room-code').innerText();
    server.rooms.rooms.get(code)!.simulation.duration = 30;
    await page.getByRole('button', { name: 'Start match' }).click(); await expect(page.getByTestId('match-timer')).toBeVisible();
    await page.locator('canvas').click({ position: { x: 600, y: 400 } }); await page.keyboard.down('KeyW');
    await expect(page.getByTestId('equipped-weapon')).not.toHaveText('Find a weapon'); await page.keyboard.up('KeyW');
    await expect.poll(() => received?.players[0]?.ack ?? 0).toBeGreaterThan(20);
    const latest = () => received as Snapshot | null;
    expect(latest()!.players[0]!.z).toBeLessThan(20);
    await expect.poll(async () => Number((await page.locator('.latency').innerText()).replace(' ms', ''))).toBeGreaterThanOrEqual(110);
  } finally { routing = false; for (const timer of pending) clearTimeout(timer); }
});
test('invalid room codes and disconnected servers give usable feedback', async ({ browser }) => {
  const ctx = await browser.newContext(); contexts.push(ctx); const page = await ctx.newPage(); observe(page);
  await page.goto(`http://127.0.0.1:${server.port}`); await page.getByLabel('YOUR NICKNAME').fill('Tester'); await page.getByLabel('Room code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join' }).click(); await expect(page.getByRole('alert')).toContainText('Room not found');
  await page.getByRole('button', { name: 'Dismiss error' }).click(); await page.getByRole('button', { name: 'Create room' }).click(); await expect(page.getByTestId('room-code')).toBeVisible();
  await server.close(); await expect(page.getByText('Disconnected · retrying…')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('server restarted');
});

test('a browser automatically rejoins a surviving room after transport loss', async ({ browser }) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(); observe(a); observe(b);
  let disconnect: (() => void) | undefined;
  await a.routeWebSocket('**/ws', route => {
    const upstream = route.connectToServer();
    disconnect = () => { route.close({ code: 4000, reason: 'Test transport interruption' }); upstream.close(); };
  });
  const code = await lobby(a, b); const world = server.rooms.rooms.get(code)!.simulation;
  const oldId = [...world.players.values()].find(p => p.name === 'Roadrunner')!.id;
  disconnect!();
  await expect.poll(() => [...world.players.values()].find(p => p.name === 'Roadrunner')?.id).not.toBe(oldId);
  await expect(a.getByTestId('room-code')).toHaveText(code);
  await expect(a.locator('.lobby-players')).toContainText('Dusty');
  await expect(b.getByRole('button', { name: 'Start match' })).toBeVisible();
  await b.getByRole('button', { name: 'Start match' }).click(); await expect(a.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } }); await a.keyboard.down('KeyW');
  await expect.poll(() => [...world.players.values()].find(p => p.name === 'Roadrunner')?.ack ?? 0).toBeGreaterThan(10);
  await a.keyboard.up('KeyW');
});

test('eight independent browser players render and send input concurrently', async ({ browser }, testInfo) => {
  test.setTimeout(240000);
  const pages: Page[] = []; const observations: ReturnType<typeof observe>[] = [];
  for (let i = 0; i < 8; i++) {
    const context = await browser.newContext({ viewport: { width: 640, height: 720 } }); contexts.push(context); const page = await context.newPage(); pages.push(page); observations.push(observe(page));
    await page.goto(`http://127.0.0.1:${server.port}`); await page.getByLabel('YOUR NICKNAME').fill(`Browser ${i + 1}`);
    if (i === 0) await page.getByRole('button', { name: 'Create room' }).click();
    else { await page.getByLabel('Room code').fill(await pages[0]!.getByTestId('room-code').innerText()); await page.getByRole('button', { name: 'Join' }).click(); }
    await expect(page.getByTestId('room-code')).toBeVisible();
  }
  const code = await pages[0]!.getByTestId('room-code').innerText(); server.rooms.rooms.get(code)!.simulation.duration = 60;
  await expect.poll(() => observations[0]!.latest?.players.length).toBe(8);
  await pages[0]!.getByRole('button', { name: 'Start match' }).click();
  for (const page of pages) {
    await expect(page.getByTestId('match-timer')).toBeVisible(); await page.locator('canvas').click({ position: { x: 320, y: 360 } });
    await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
  }
  const measurements = await Promise.all(pages.map(page => page.evaluate(() => new Promise<{ frames: number; elapsed: number; maxFrameGap: number }>(ok => {
    const start = performance.now(); let frames = 0, previous = start, maxFrameGap = 0;
    const frame = (now: number) => { frames++; maxFrameGap = Math.max(maxFrameGap, now - previous); previous = now;
      if (now - start >= 2000) ok({ frames, elapsed: now - start, maxFrameGap }); else requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  }))));
  for (const page of pages) { await page.keyboard.up('Space'); await page.keyboard.up('KeyW'); }
  for (let i = 0; i < pages.length; i++) {
    await expect.poll(() => observations[i]!.latest?.players.every(p => p.ack >= 10 && Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
    await expect(pages[i]!.locator('canvas')).toBeVisible(); expect(measurements[i]!.frames).toBeGreaterThan(0);
  }
  const report = measurements.map((m, index) => ({ browser: index + 1, ...m, framesPerSecond: Math.round(m.frames / m.elapsed * 1000) }));
  const output = testInfo.outputPath('eight-browser-performance.json'); await writeFile(output, JSON.stringify(report, null, 2));
  await testInfo.attach('eight-browser-performance', { path: output, contentType: 'application/json' });
});
