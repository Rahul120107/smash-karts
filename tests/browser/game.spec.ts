import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { startServer } from '../../server/src/networking/server.js';
import { WEAPON_IDS, WEAPONS } from '../../shared/src/weapons.js';
import { groundHeight } from '../../shared/src/arena.js';
import type { ClientMessage, Input, ServerMessage, Snapshot } from '../../shared/src/types.js';
import { writeFile } from 'node:fs/promises';
let server: Awaited<ReturnType<typeof startServer>>;
let contexts: BrowserContext[] = [];
const errors: string[] = [];
test.beforeEach(async () => { server = await startServer({ port: 0, host: '127.0.0.1', duration: 12 }); errors.length = 0; });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.close())); await server.close(); expect(errors).toEqual([]); });
function observe(page: Page) {
  const observed: { latest: Snapshot | null; history: Snapshot[]; inputs: Input[] } = { latest: null, history: [], inputs: [] };
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /Shader Error|VALIDATE_STATUS|INVALID_OPERATION|WebGLProgram/.test(message.text())) errors.push(message.text()); });
  page.on('websocket', ws => {
    ws.on('framesent', frame => {
      const message = JSON.parse(frame.payload.toString()) as ClientMessage;
      if (message.type === 'input') { observed.inputs.push(...message.commands); if (observed.inputs.length > 4096) observed.inputs.splice(0, observed.inputs.length - 4096); }
    });
    ws.on('framereceived', frame => {
    const message = JSON.parse(frame.payload.toString()) as ServerMessage;
    if (message.type === 'snapshot') { observed.latest = message.state; observed.history.push(message.state); if (observed.history.length > 1000) observed.history.shift(); }
    });
  });
  return observed;
}
async function appliedKey(page: Page, observed: ReturnType<typeof observe>, id: string, key: string, down: boolean, matches: (input: Input) => boolean) {
  const boundary = observed.inputs.at(-1)?.seq ?? 0;
  if (down) await page.keyboard.down(key); else await page.keyboard.up(key);
  let seq = 0;
  await expect.poll(() => { seq = observed.inputs.find(input => input.seq > boundary && matches(input))?.seq ?? 0; return seq; }).toBeGreaterThan(0);
  await expect.poll(() => observed.latest?.players.find(p => p.id === id)?.ack ?? 0).toBeGreaterThanOrEqual(seq);
}
async function lobby(host: Page, guest: Page) {
  await host.goto(`http://127.0.0.1:${server.port}`); await guest.goto(`http://127.0.0.1:${server.port}`);
  await host.getByLabel('YOUR NICKNAME').fill('Roadrunner'); await host.getByRole('button', { name: 'Create room' }).click();
  const code = await host.getByTestId('room-code').innerText();
  await guest.getByLabel('YOUR NICKNAME').fill('Dusty'); await guest.getByLabel('Room code').fill(code); await guest.getByRole('button', { name: 'Join', exact: false }).click();
  await expect(host.locator('.lobby-players')).toContainText('Dusty'); await expect(guest.locator('.lobby-players')).toContainText('Roadrunner');
  return code;
}
test('Space on a focused HUD button fires while steering and drifting, and cannon volleys synchronize', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(), seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 60; world.random = () => .5;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  const shooter = [...world.players.values()].find(p => p.name === 'Roadrunner')!, victim = [...world.players.values()].find(p => p.name === 'Dusty')!;
  Object.assign(shooter, { x: -12, y: 0, z: 0, yaw: 0, yawRate: 0, vx: 0, vy: 0, vz: 0, weapon: 'machineGun', ammo: 30, nextFire: 0, invulnerableUntil: 0 });
  Object.assign(victim, { x: -11.5, y: 0, z: 16, vx: 0, vy: 0, vz: 0, invulnerableUntil: 0 });
  await expect(a.getByTestId('equipped-weapon')).toHaveText('Machine gun');
  await a.getByRole('button', { name: 'Mute audio' }).focus();
  for (const key of ['KeyW', 'KeyA', 'ShiftLeft']) await a.keyboard.down(key);
  await a.keyboard.press('Space');
  await expect.poll(() => seenA.inputs.some(input => input.throttle === 1 && input.steer === 1 && input.drift && (input.firePress ?? 0) > 0)).toBe(true);
  for (const key of ['KeyW', 'KeyA', 'ShiftLeft']) await a.keyboard.up(key);
  await expect(a.getByRole('button', { name: 'Mute audio' })).toBeVisible();
  await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.ammo, { timeout: 15000 }).toBe(0);
  expect(new Set(seenB.history.flatMap(s => s.events).filter(e => e.kind === 'fire' && e.player === shooter.id && e.weapon === 'machineGun').map(e => e.id)).size).toBe(30);
  Object.assign(shooter, { x: -12, y: 0, z: -15, yaw: 0, yawRate: 0, vx: 0, vy: 0, vz: 0, weapon: 'cannon', ammo: 4, nextFire: 0 });
  Object.assign(victim, { x: 30, y: 0, z: 40, health: 100, invulnerableUntil: 0 });
  await expect(a.getByTestId('equipped-weapon')).toHaveText('Siege cannon');
  const since = world.time;
  for (const key of ['ArrowUp', 'ArrowRight', 'ShiftRight']) await a.keyboard.down(key);
  await a.keyboard.press('Space');
  await expect.poll(() => seenA.inputs.some(input => input.throttle === 1 && input.steer === -1 && input.drift && (input.firePress ?? 0) === 2)).toBe(true);
  for (const key of ['ArrowUp', 'ArrowRight', 'ShiftRight']) await a.keyboard.up(key);
  await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.ammo, { timeout: 15000 }).toBe(0);
  const fire = new Map(seenB.history.flatMap(s => s.events).filter(e => e.at >= since && e.kind === 'fire' && e.weapon === 'cannon').map(e => [e.id, e.at]));
  expect(fire.size).toBe(4); const times = [...fire.values()]; for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeCloseTo(.8, 6);
  const balls = seenB.history.flatMap(s => s.projectiles).filter(p => p.kind === 'cannonball');
  expect(balls.some(p => p.vy > 0)).toBe(true); expect(balls.some(p => p.vy < 0)).toBe(true);
  await a.screenshot({ path: testInfo.outputPath('alien-combat-input.png') });
});
test('idle arena redraws on resizing and room changes without continuously consuming GPU frames', async ({ browser }, testInfo) => {
  const context = await browser.newContext(); contexts.push(context); const page = await context.newPage(); observe(page);
  await page.goto(`http://127.0.0.1:${server.port}`); await expect(page.getByLabel('YOUR NICKNAME')).toBeVisible();
  const rendered = async () => Number(await page.locator('.game-canvas').getAttribute('data-idle-renders'));
  await expect.poll(rendered).toBeGreaterThan(0);
  // Let initial layout/ResizeObserver callbacks settle before measuring idle redraws.
  await page.evaluate(() => new Promise<void>(ok => requestAnimationFrame(() => requestAnimationFrame(() => ok()))));
  const initial = await rendered(); await page.waitForTimeout(600); expect(await rendered()).toBe(initial);
  await page.setViewportSize({ width: 640, height: 720 }); await expect.poll(rendered).toBeGreaterThan(initial);
  const smallFrames = await rendered(); await page.setViewportSize({ width: 1280, height: 800 }); await expect.poll(rendered).toBeGreaterThan(smallFrames);
  await page.screenshot({ path: testInfo.outputPath('main-menu.png') }); const beforeJoin = await rendered();
  await page.getByLabel('YOUR NICKNAME').fill('Idle racer'); await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible(); await expect.poll(rendered).toBeGreaterThan(beforeJoin);
  const lobbyFrames = await rendered(); await page.waitForTimeout(600); expect(await rendered()).toBe(lobbyFrames);
});

test('two independent browser sessions drive, collect, fire, finish, replay, and leave', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(); const seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b);
  await a.screenshot({ path: testInfo.outputPath('lobby.png') });
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.getByRole('button', { name: 'Mute audio' }).click(); await a.keyboard.down('KeyW');
  await expect.poll(() => !!seenA.latest?.players.find(p => p.name === 'Roadrunner')?.weapon, { intervals: [50] }).toBe(true);
  // Releasing throttle coasts naturally. Brake before the new central falling hazard.
  await a.keyboard.up('KeyW'); await a.keyboard.down('KeyS');
  await expect.poll(() => seenA.latest?.players.find(p => p.name === 'Roadrunner')?.vx ?? -100, { intervals: [50] }).toBeGreaterThan(-1);
  await a.keyboard.up('KeyS'); await expect(a.getByTestId('equipped-weapon')).not.toHaveText('Find a weapon');
  const player = seenA.latest!.players.find(p => p.name === 'Roadrunner')!;
  expect(player.x).toBeLessThan(-10); expect(player.ack).toBeGreaterThan(0);
  await expect.poll(() => seenB.latest?.pickups[0]?.availableAt ?? 0).toBeGreaterThan(0);
  const ammo = player.ammo;
  await expect.poll(()=>seenA.latest!.time>=seenA.latest!.players.find(p=>p.id===player.id)!.nextFire).toBe(true);
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
test('pickup disappearance and glowing respawn synchronize across rendered browsers', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(), seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 45;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  const markerA = a.locator('.minimap [data-pickup-id="0"]'), markerB = b.locator('.minimap [data-pickup-id="0"]');
  await expect(markerA).toHaveCount(1); await expect(markerB).toHaveCount(1);
  const collector = [...world.players.values()].find(p => p.name === 'Roadrunner')!, box = world.pickups[0]!;
  Object.assign(collector, { x: box.x, y: box.y, z: box.z, vx: 0, vy: 0, vz: 0 });
  await expect(markerA).toHaveCount(0); await expect(markerB).toHaveCount(0);
  expect(seenA.latest!.pickups[0]!.active).toBe(false); expect(seenB.latest!.pickups[0]!.active).toBe(false);
  const collection = seenA.history.flatMap(s => s.events).find(e => e.kind === 'pickup' && e.pickupId === box.id)!;
  expect(collection).toBeDefined(); await expect(a.getByTestId('equipped-weapon')).not.toHaveText('Find a weapon');
  Object.assign(collector, { x: -12, z: 24 });
  await expect.poll(() => seenB.history.flatMap(s => s.events).some(e => e.kind === 'pickupSpawn' && e.pickupId === box.id), { timeout: 20000 }).toBe(true);
  await expect(markerA).toHaveCount(1); await expect(markerB).toHaveCount(1);
  const spawnA = seenA.history.flatMap(s => s.events).find(e => e.kind === 'pickupSpawn' && e.pickupId === box.id)!;
  const spawnB = seenB.history.flatMap(s => s.events).find(e => e.kind === 'pickupSpawn' && e.pickupId === box.id)!;
  expect(spawnA.id).toBe(spawnB.id); expect(spawnA.at - collection.at).toBeCloseTo(10, 3);
  await a.screenshot({ path: testInfo.outputPath('pickup-respawn.png') });
});

test('all weapon categories render and synchronize combat between browsers', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(); const seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 120;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } });
  const shooter = [...world.players.values()].find(p => p.name === 'Roadrunner')!, target = [...world.players.values()].find(p => p.name === 'Dusty')!;
  for (const weapon of WEAPON_IDS) await test.step(WEAPONS[weapon].label, async () => {
    // Server fixtures arrange reproducible shots. The browser activates them through ordinary Space input.
    world.projectiles.clear(); world.events = [];
    Object.assign(shooter, { x: -12, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0, health: 100, invulnerableUntil: 0, shieldUntil: 0, boostUntil: 0, orbitUntil: 0, weapon, ammo: WEAPONS[weapon].ammo, nextFire: 0 });
    Object.assign(target, { x: weapon === 'homing' ? -15 : -12, y: 0, z: weapon === 'mine' ? -1.8 : weapon === 'bomb' ? 19 : weapon === 'cannon' ? 18.5 : weapon === 'orbit' ? 1.8 : 6, vx: 0, vy: 0, vz: 0, health: 100, invulnerableUntil: 0, shieldUntil: 0, boostUntil: 0, orbitUntil: 0, respawnAt: 0 });
    await expect(a.getByTestId('equipped-weapon')).toHaveText(WEAPONS[weapon].label);
    const since = world.time;
    let fireId = 0;
    await a.keyboard.down('Space');
    await expect.poll(() => { fireId = world.events.find(e => e.kind === 'fire' && e.weapon === weapon && e.at >= since)?.id ?? 0; return fireId; }).toBeGreaterThan(0);
    await appliedKey(a, seenA, shooter.id, 'Space', false, input => !input.fire);
    await expect.poll(() => seenB.history.some(s => s.events.some(e => e.id === fireId))).toBe(true);
    if (weapon === 'shield') { await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.shieldUntil ?? 0).toBeGreaterThan(since); }
    else if (weapon === 'boost') { await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.boostUntil ?? 0).toBeGreaterThan(since); }
    else { await expect.poll(() => seenB.history.some(s => s.time >= since && s.players.some(p => p.id === target.id && p.health < 100))).toBe(true); }
    expect(seenA.latest?.players.find(p => p.id === shooter.id)?.ammo).toBeLessThan(WEAPONS[weapon].ammo);
    if (WEAPONS[weapon].activation === 'single' && WEAPONS[weapon].ammo > 1) {
      await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.ammo).toBe(WEAPONS[weapon].ammo - 1);
      await a.waitForTimeout(WEAPONS[weapon].cooldown * 1000 + 50);
      expect(shooter.ammo).toBe(WEAPONS[weapon].ammo - 1);
    }
    if (weapon === 'orbit') {
      await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.orbitUntil ?? 0).toBeGreaterThan(since);
      await a.screenshot({ path: testInfo.outputPath('orbit-contact.png') });
    }
    if (weapon === 'rocket') await a.screenshot({ path: testInfo.outputPath('rocket-combat.png') });
  });
  expect(world.projectiles.size).toBeLessThan(20);
  await test.step('elimination, live score, respawn, and protection', async () => {
    world.projectiles.clear();
    Object.assign(shooter, { x: -12, z: 0, yaw: 0, health: 100, invulnerableUntil: 0, shieldUntil: 0, orbitUntil: 0, weapon: 'machineGun', ammo: 30, nextFire: 0 });
    Object.assign(target, { x: -12, z: 6, health: 12, invulnerableUntil: 0, shieldUntil: 0 });
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
test('ramp-side stability, legitimate jumps and assisted fire agree across two browsers', async ({ browser }, testInfo) => {
  const ctxA = await browser.newContext(), ctxB = await browser.newContext({ viewport: { width: 640, height: 720 } }); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(), seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 90; world.random = () => 0.5;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } });
  const shooter = [...world.players.values()].find(p => p.name === 'Roadrunner')!, victim = [...world.players.values()].find(p => p.name === 'Dusty')!;
  Object.assign(shooter, { x: -45.05, z: 0, y: 0, yaw: Math.PI / 2, vx: 20, vy: 0, vz: 0 });
  const sideSince = world.time; await a.keyboard.down('KeyW');
  await expect.poll(() => seenA.latest?.time ?? 0).toBeGreaterThan(sideSince + 0.6);
  expect(seenB.history.filter(s => s.time > sideSince + 0.05).every(s => s.players.find(p => p.id === shooter.id)!.y === 0)).toBe(true);
  await expect.poll(async () => Number(await a.locator('.game-canvas').getAttribute('data-prediction-y'))).toBe(0);
  await appliedKey(a, seenA, shooter.id, 'KeyW', false, input => input.throttle === 0);
  await appliedKey(a, seenA, shooter.id, 'KeyW', true, input => input.throttle === 1);
  Object.assign(shooter, { x: -40, z: 35, y: groundHeight(-40, 35), yaw: 0, vx: 0, vy: 0, vz: 21 });
  const jumpSince = world.time;
  try { await expect.poll(() => seenB.history.some(s => s.time > jumpSince && s.players.some(p => p.id === shooter.id && p.vy > 1))).toBe(true); }
  catch (error) {
    const positions = seenB.history.filter(s => s.time > jumpSince).map(s => ({ time: s.time, player: s.players.find(p => p.id === shooter.id) }));
    await testInfo.attach('ramp-state', { body: JSON.stringify({ shooter, positions }), contentType: 'application/json' }); throw error;
  }
  await expect.poll(() => seenA.latest?.players.find(p => p.id === shooter.id)?.z ?? -100).toBeGreaterThan(49);
  await appliedKey(a, seenA, shooter.id, 'KeyW', false, input => input.throttle === 0);
  const jumpHeights = seenB.history.filter(s => s.time > jumpSince).map(s => s.players.find(p => p.id === shooter.id)!.y);
  expect(Math.max(...jumpHeights)).toBeGreaterThan(1.2); expect(Math.max(...jumpHeights)).toBeLessThan(2.3);
  await expect.poll(async () => Number(await a.locator('.game-canvas').getAttribute('data-prediction-y'))).toBe(0);
  Object.assign(shooter, { x: -12, z: 0, y: 0, yaw: 0, vx: 0, vy: 0, vz: 0, weapon: 'machineGun', ammo: 30, nextFire: 0, invulnerableUntil: 0 });
  Object.assign(victim, { x: -10.4, z: 8, y: 0, vx: 0, vy: 0, vz: 0, health: 100, invulnerableUntil: 0 });
  await expect(a.getByTestId('aim-feedback')).toHaveText('TRACKING Dusty');
  await a.screenshot({ path: testInfo.outputPath('assisted-fire.png') });
  await a.keyboard.down('Space'); await expect.poll(() => seenB.latest?.players.find(p => p.id === victim.id)?.health ?? 100).toBeLessThan(100);
  await appliedKey(a, seenA, shooter.id, 'Space', false, input => !input.fire); world.projectiles.clear();
  Object.assign(shooter, { x: 15, z: 19, yaw: 0 }); Object.assign(victim, { x: 15, z: 25, health: 100 });
  await expect(a.getByTestId('aim-feedback')).toHaveText('ASSIST READY');
  const blockedSince = world.time; await a.keyboard.down('Space');
  await expect.poll(() => seenB.latest?.time ?? 0).toBeGreaterThan(blockedSince + 0.5); await a.keyboard.up('Space'); expect(victim.health).toBe(100);
  const calls = Number(await a.locator('.game-canvas').getAttribute('data-draw-calls'));
  expect(calls).toBeGreaterThan(0); expect(calls).toBeLessThan(180);
  expect(Number(await a.locator('.game-canvas').getAttribute('data-audio-voices'))).toBeLessThanOrEqual(12);
  await b.screenshot({ path: testInfo.outputPath('compact-hud.png') });
  await b.setViewportSize({ width: 390, height: 720 });
  const weaponBounds = await b.locator('.weapon-panel').boundingBox(), vitalsBounds = await b.locator('.vitals').boundingBox();
  expect(weaponBounds!.x).toBeGreaterThanOrEqual(0); expect(weaponBounds!.x + weaponBounds!.width).toBeLessThanOrEqual(390);
  expect(weaponBounds!.y).toBeGreaterThanOrEqual(vitalsBounds!.y + vitalsBounds!.height);
  await b.screenshot({ path: testInfo.outputPath('narrow-hud.png') });
});

test('movement inputs continue while animation frames are paused', async ({ browser }) => {
  const context = await browser.newContext(); contexts.push(context); const page = await context.newPage(), seen = observe(page);
  await page.goto(`http://127.0.0.1:${server.port}`); await page.getByLabel('YOUR NICKNAME').fill('Render pause');
  await page.getByRole('button', { name: 'Create room' }).click(); const code = await page.getByTestId('room-code').innerText(); server.rooms.rooms.get(code)!.simulation.duration = 30;
  await page.getByRole('button', { name: 'Start match' }).click(); await expect(page.getByTestId('match-timer')).toBeVisible();
  await page.locator('canvas').click({ position: { x: 600, y: 400 } });
  const id = seen.latest!.players[0]!.id, initialAck = seen.latest!.players[0]!.ack;
  await page.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await appliedKey(page, seen, id, 'KeyW', true, input => input.throttle === 1);
  await expect.poll(() => seen.latest?.players[0]?.ack ?? 0).toBeGreaterThan(initialAck + 30);
  await expect.poll(() => seen.latest?.players[0]?.x ?? -4).toBeLessThan(-6); expect(seen.latest!.players[0]!.y).toBe(0);
  await appliedKey(page, seen, id, 'KeyW', false, input => input.throttle === 0);
});

test('quick Space taps execute complete bursts and heavy cannon combat in the expanded arena', async ({ browser }, testInfo) => {
  test.setTimeout(90000);
  const ctxA = await browser.newContext(), ctxB = await browser.newContext(); contexts.push(ctxA, ctxB);
  const a = await ctxA.newPage(), b = await ctxB.newPage(), seenA = observe(a), seenB = observe(b);
  const code = await lobby(a, b), world = server.rooms.rooms.get(code)!.simulation; world.duration = 60; world.random = () => 0.5;
  await a.getByRole('button', { name: 'Start match' }).click(); await expect(b.getByTestId('match-timer')).toBeVisible();
  await a.locator('canvas').click({ position: { x: 600, y: 400 } });
  const shooter = [...world.players.values()].find(p => p.name === 'Roadrunner')!, victim = [...world.players.values()].find(p => p.name === 'Dusty')!;
  Object.assign(shooter, { x: -12, y: 0, z: 0, yaw: 0, yawRate: 0, vx: 0, vy: 0, vz: 0, weapon: 'machineGun', ammo: 30, nextFire: 0, invulnerableUntil: 0 });
  Object.assign(victim, { x: -10.5, y: 0, z: 10, vx: 0, vy: 0, vz: 0, invulnerableUntil: 0 });
  await expect(a.getByTestId('equipped-weapon')).toHaveText('Machine gun'); await a.keyboard.press('Space');
  await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.attacking).toBe(true);
  await expect.poll(() => seenA.latest?.players.find(p => p.id === shooter.id)?.ammo, { timeout: 15000 }).toBe(0);
  const fireIds = new Set(seenB.history.flatMap(s => s.events).filter(e => e.kind === 'fire' && e.player === shooter.id && e.weapon === 'machineGun').map(e => e.id));
  expect(fireIds.size).toBe(30); expect(shooter.health).toBe(100); expect(shooter.score).toBe(1);
  Object.assign(shooter, { weapon: 'cannon', ammo: 1, nextFire: 0 });
  Object.assign(victim, { x: -12, y: 0, z: 18.5, health: 100, invulnerableUntil: 0, respawnAt: 0, vx: 0, vy: 0, vz: 0 });
  await expect(a.getByTestId('equipped-weapon')).toHaveText('Siege cannon'); await a.screenshot({ path: testInfo.outputPath('siege-cannon-ready.png') });
  await a.keyboard.press('Space');
  await expect.poll(() => seenB.history.some(s => s.projectiles.some(p => p.kind === 'cannonball'))).toBe(true);
  await expect.poll(() => seenB.latest?.players.find(p => p.id === victim.id)?.health ?? 100).toBeLessThan(100);
  expect(shooter.health).toBe(100);
  Object.assign(shooter, { x: 50, z: 0, y: 0, yaw: Math.PI / 2, yawRate: 0, vx: 0, vy: 0, vz: 0 });
  await appliedKey(a, seenA, shooter.id, 'KeyW', true, input => input.throttle === 1);
  await expect.poll(() => seenB.latest?.players.find(p => p.id === shooter.id)?.x ?? 0).toBeGreaterThan(54);
  await appliedKey(a, seenA, shooter.id, 'KeyW', false, input => input.throttle === 0);
  expect(shooter.x).toBeLessThanOrEqual(54.15 + 1e-8); expect(shooter.y).toBe(0);
  await a.screenshot({ path: testInfo.outputPath('expanded-arena.png') });
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
    expect(latest()!.players[0]!.x).toBeLessThan(-10);
    await expect.poll(async () => Number((await page.locator('.latency').innerText()).replace(' ms', ''))).toBeGreaterThanOrEqual(110);
  } finally { routing = false; for (const timer of pending) clearTimeout(timer); }
});
test('invalid room codes and disconnected servers give usable feedback', async ({ browser }) => {
  const ctx = await browser.newContext(); contexts.push(ctx); const page = await ctx.newPage(); observe(page);
  await page.goto(`http://127.0.0.1:${server.port}`); await page.getByLabel('YOUR NICKNAME').fill('Tester'); await page.getByLabel('Room code').fill('ZZZZZ');
  await page.getByRole('button', { name: 'Join' }).click(); await expect(page.getByRole('alert')).toContainText('Room not found');
  await page.getByRole('button', { name: 'Dismiss error' }).click(); await page.getByRole('button', { name: 'Create room' }).click(); await expect(page.getByTestId('room-code')).toBeVisible();
  await server.close(); await expect(page.getByRole('alert')).toContainText('server restarted');
  await expect(page.locator('.connection-status')).toContainText('Disconnected');
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

test('island platforms, lava and respawn synchronize with measured rendering',async({browser},testInfo)=>{
  test.setTimeout(120000);
  const ctxA=await browser.newContext(),ctxB=await browser.newContext();contexts.push(ctxA,ctxB);
  const a=await ctxA.newPage(),b=await ctxB.newPage(),seenA=observe(a),seenB=observe(b);
  const code=await lobby(a,b),world=server.rooms.rooms.get(code)!.simulation;world.duration=150;
  await a.getByRole('button',{name:'Start match'}).click();await expect(b.getByTestId('match-timer')).toBeVisible();
  const driver=[...world.players.values()].find(p=>p.name==='Roadrunner')!,enemy=[...world.players.values()].find(p=>p.name==='Dusty')!;
  Object.assign(driver,{x:40,y:0,z:-26,yaw:0,vx:0,vy:0,vz:0,weapon:null,invulnerableUntil:0});
  Object.assign(enemy,{x:30,y:0,z:-20,yaw:0,vx:0,vy:0,vz:0,invulnerableUntil:0});
  await expect.poll(()=>seenA.latest?.players.find(p=>p.id===driver.id)?.x).toBe(40);
  await a.keyboard.down('KeyW');await expect.poll(()=>driver.z).toBeGreaterThan(-3);await a.keyboard.up('KeyW');
  await expect.poll(()=>seenB.history.some(s=>s.players.some(p=>p.id===driver.id&&Math.abs(p.z)<3&&Math.abs(p.y-1.2)<.01))).toBe(true);
  await a.screenshot({path:testInfo.outputPath('island-platform.png')});
  await expect.poll(()=>seenA.inputs.at(-1)?.throttle).toBe(0);
  Object.assign(driver,{x:0,y:0,z:0,vx:0,vy:0,vz:0,health:100});
  await expect.poll(()=>seenB.latest?.players.find(p=>p.id===driver.id)?.health).toBe(0);
  await expect(a.locator('.respawn')).toBeVisible();expect(driver.score).toBe(0);expect(enemy.score).toBe(0);
  await a.screenshot({path:testInfo.outputPath('island-lava-respawn.png')});
  await expect.poll(()=>seenB.latest?.players.find(p=>p.id===driver.id)?.health).toBe(100);
  expect(driver.y).toBe(groundHeight(driver.x,driver.z));
  Object.assign(driver,{x:-12,y:0,z:0,yaw:0,vx:0,vy:0,vz:0,weapon:'machineGun',ammo:30,nextFire:world.time,invulnerableUntil:0});
  Object.assign(enemy,{x:-12,y:0,z:8,yaw:Math.PI,vx:0,vy:0,vz:0,health:100,invulnerableUntil:0});
  await expect(a.getByTestId('equipped-weapon')).toHaveText('Machine gun');await a.keyboard.press('Space');
  await expect.poll(()=>enemy.health<100||enemy.deaths>0).toBe(true);expect(driver.health).toBe(100);
  await ctxB.close();contexts=contexts.filter(c=>c!==ctxB);
  await a.setViewportSize({width:1920,height:1080});
  const measurement=await a.evaluate(()=>new Promise<{fps:number;meanFrameMs:number;p95FrameMs:number;maxFrameMs:number}>(resolve=>{
    const start=performance.now();let previous=start;const gaps:number[]=[];
    const frame=(now:number)=>{gaps.push(now-previous);previous=now;if(now-start<5000)requestAnimationFrame(frame);else{const sorted=[...gaps].sort((a,b)=>a-b);resolve({fps:gaps.length*1000/(now-start),meanFrameMs:(now-start)/gaps.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)]!,maxFrameMs:Math.max(...gaps)});}};
    requestAnimationFrame(frame);
  }));
  const details=await a.locator('.game-canvas').evaluate(e=>({gpu:(e as HTMLElement).dataset.gpu,drawCalls:Number((e as HTMLElement).dataset.drawCalls),triangles:Number((e as HTMLElement).dataset.triangles),reducedGraphics:(e as HTMLElement).dataset.reducedGraphics==='true'}));
  expect(details.drawCalls).toBeGreaterThan(0);expect(details.drawCalls).toBeLessThan(180);expect(measurement.fps).toBeGreaterThan(0);
  const path=testInfo.outputPath('island-1080p-performance.json');await writeFile(path,JSON.stringify({viewport:'1920x1080',concurrentBrowsers:1,...measurement,...details},null,2));await testInfo.attach('island-performance',{path,contentType:'application/json'});
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
  const liveries = new Map(observations[0]!.latest!.players.map(p => [p.id,p.color]));
  expect(new Set(liveries.values()).size).toBe(8);
  await pages[0]!.getByRole('button', { name: 'Start match' }).click();
  // Focus and apply actual keys concurrently; serial click stability checks on eight
  // software WebGL renderers can consume the entire match before the last input.
  await Promise.all(pages.map(async page => {
    await expect(page.getByTestId('match-timer')).toBeVisible(); await page.locator('canvas').focus();
    await page.keyboard.down('KeyW'); await page.keyboard.down('Space');
  }));
  const measurements = await Promise.all(pages.map(page => page.evaluate(() => new Promise<{ frames: number; elapsed: number; maxFrameGap: number }>(ok => {
    const start = performance.now(); let frames = 0, previous = start, maxFrameGap = 0;
    const frame = (now: number) => { frames++; maxFrameGap = Math.max(maxFrameGap, now - previous); previous = now;
      if (now - start >= 2000) ok({ frames, elapsed: now - start, maxFrameGap }); else requestAnimationFrame(frame);
    }; requestAnimationFrame(frame);
  }))));
  for (const page of pages) { await page.keyboard.up('Space'); await page.keyboard.up('KeyW'); }
  for (let i = 0; i < pages.length; i++) {
    await expect.poll(() => observations[i]!.latest?.players.every(p => p.ack >= 10 && Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
    expect(observations[i]!.latest!.players.map(p => [p.id,p.color])).toEqual([...liveries]);
    await expect(pages[i]!.locator('canvas')).toBeVisible(); expect(measurements[i]!.frames).toBeGreaterThan(0);
  }
  const renderStats = await Promise.all(pages.map(page => page.locator('.game-canvas').evaluate(element => ({ gpu:(element as HTMLElement).dataset.gpu, frameMs:Number((element as HTMLElement).dataset.frameMs), drawCalls: Number((element as HTMLElement).dataset.drawCalls), triangles: Number((element as HTMLElement).dataset.triangles) }))));
  for (const stats of renderStats) { expect(stats.drawCalls).toBeGreaterThan(0); expect(stats.drawCalls).toBeLessThan(240); }
  const report = measurements.map((m, index) => ({ browser: index + 1, ...m, ...renderStats[index], framesPerSecond: Math.round(m.frames / m.elapsed * 1000) }));
  const output = testInfo.outputPath('eight-browser-performance.json'); await writeFile(output, JSON.stringify(report, null, 2));
  await testInfo.attach('eight-browser-performance', { path: output, contentType: 'application/json' });
});
