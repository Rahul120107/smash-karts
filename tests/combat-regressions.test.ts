import { afterEach, describe, expect, it, vi } from 'vitest';
import { Controls, touchControl } from '../client/src/game/input.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { WEAPONS } from '../shared/src/weapons.js';
import { weaponAim } from '../shared/src/aim.js';
import { ballisticPosition, weaponMuzzle } from '../shared/src/weapon-physics.js';
import { parseMessage } from '../server/src/networking/validation.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { explode, damage } from '../server/src/combat/damage.js';
import { advance, duel, equip } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());
function keyboard(active = () => true) {
  const windowTarget = new EventTarget(), documentTarget = new EventTarget();
  vi.stubGlobal('window', windowTarget); vi.stubGlobal('document', documentTarget);
  const controls = new Controls(active);
  const key = (type: string, code: string, target?: object, repeat = false) => {
    const event = Object.assign(new Event(type, { cancelable: true }), { code, repeat });
    if (target) Object.defineProperty(event, 'target', { value: target });
    windowTarget.dispatchEvent(event); return event;
  };
  return { controls, key, windowTarget, documentTarget };
}
describe('central input and lossless Space intent', () => {
  it('combines independent touch and keyboard sources without repeating a held fire sequence',()=>{
    const {controls,key,windowTarget}=keyboard();key('keydown','KeyW');touchControl('left',true,1);touchControl('fire',true,2);
    expect(controls.read(1)).toMatchObject({throttle:1,steer:1,fireHeld:true,firePress:1});
    key('keydown','Space');touchControl('fire',false,2);expect(controls.read(2)).toMatchObject({fireHeld:true,firePress:1});
    key('keyup','Space');touchControl('left',false,1);expect(controls.read(3)).toMatchObject({throttle:1,steer:0,fireHeld:false});
    touchControl('fire',true,3);windowTarget.dispatchEvent(new Event('blur'));expect(controls.read(4).fire).toBe(false);controls.dispose();
  });
  it.each([['KeyW', 'KeyA', 'ShiftLeft'], ['ArrowUp', 'ArrowLeft', 'ShiftRight']])('fires during simultaneous throttle, steering and drift: %s', (forward, left, shift) => {
    const { controls, key } = keyboard();
    for (const code of [forward, left, shift, 'Space']) expect(key('keydown', code).defaultPrevented).toBe(true);
    expect(controls.read(1)).toMatchObject({ throttle: 1, steer: 1, drift: true, fire: true, firePress: 1 });
    key('keyup', 'Space'); expect(controls.read(2)).toMatchObject({ throttle: 1, steer: 1, drift: true, fire: false }); controls.dispose();
  });
  it('captures consecutive taps with no sampled release and ignores native key repeat', () => {
    const { controls, key } = keyboard();
    key('keydown', 'Space'); key('keyup', 'Space'); const first = controls.read(1);
    key('keydown', 'Space'); key('keydown', 'Space', undefined, true); key('keyup', 'Space'); const second = controls.read(2);
    expect(first).toMatchObject({ fire: true, firePress: 1 }); expect(second).toMatchObject({ fire: true, firePress: 2 });
    expect(controls.read(3)).toMatchObject({ fire: false, firePress: 2 }); controls.dispose();
  });
  it('handles a focused HUD button, respects text editing, and ignores menus', () => {
    let active = true; const { controls, key } = keyboard(() => active);
    expect(key('keydown', 'Space', { tagName: 'BUTTON' }).defaultPrevented).toBe(true);
    key('keyup', 'Space'); expect(controls.read(1).firePress).toBe(1);
    for (const target of [{ tagName: 'INPUT' }, { tagName: 'TEXTAREA' }, { tagName: 'DIV', isContentEditable: true }]) {
      expect(key('keydown', 'Space', target).defaultPrevented).toBe(false); expect(controls.read(2).fire).toBe(false);
    }
    active = false; expect(key('keydown', 'ArrowUp').defaultPrevented).toBe(false); expect(controls.read(3).throttle).toBe(0); controls.dispose();
  });
  it('clears stuck held keys on blur, hidden tabs and match reset', () => {
    const { controls, key, windowTarget, documentTarget } = keyboard();
    for (const target of [windowTarget, documentTarget]) {
      key('keydown', 'KeyW'); key('keydown', 'Space'); target.dispatchEvent(new Event(target === windowTarget ? 'blur' : 'visibilitychange'));
      expect(controls.read(1)).toMatchObject({ throttle: 0, fire: false, firePress: 0 });
    }
    controls.clear(); expect(controls.read(2).firePress).toBe(0); controls.dispose();
  });
  it('recognizes consecutive taps with no sampled release, but does not replay an old press', () => {
    const {world,a}=duel();equip(a,'shield');
    world.enqueue(a.id,[{...NEUTRAL,seq:1,fire:true,firePress:1}]);world.step();expect(a.weapon).toBeNull();
    equip(a,'boost');world.enqueue(a.id,[{...NEUTRAL,seq:2,fire:true,firePress:2}]);world.step();expect(a.boostUntil).toBeGreaterThan(world.time);
    equip(a,'shield');a.shieldUntil=0;world.enqueue(a.id,[{...NEUTRAL,seq:3,fire:true,firePress:2}]);world.step();expect(a.shieldUntil).toBe(0);
  });
  it('preserves fire intent when the movement backlog is trimmed', () => {
    const { world, a } = duel(); equip(a, 'rocket');
    world.enqueue(a.id, Array.from({ length: CONFIG.maxQueue + 8 }, (_, i) => ({ ...NEUTRAL, seq: i + 1, fire: i === 0, firePress: 1 })));
    world.step(); expect(a.ammo).toBe(2); advance(world, 1); expect(a.ammo).toBe(1); advance(world,.5);expect(a.ammo).toBe(0);
  });
  it('buffers only near-ready activation and cannot replay an old press ID',()=>{
    const {world,a}=duel();equip(a,'shield');a.nextFire=.08;
    world.enqueue(a.id,[{...NEUTRAL,seq:1,firePress:1}]);world.step();expect(a.ammo).toBe(1);
    advance(world,.12);expect(a.ammo).toBe(0);expect(a.shieldUntil).toBeGreaterThan(world.time);
    equip(a,'boost');world.enqueue(a.id,[{...NEUTRAL,seq:2,firePress:1}]);advance(world,.2);expect(a.boostUntil).toBe(0);
    a.nextFire=world.time+.3;world.enqueue(a.id,[{...NEUTRAL,seq:3,firePress:2}]);advance(world,.5);expect(a.boostUntil).toBe(0);
  });
  it('does not activate a newly acquired weapon from a held Space or dead-player intent', () => {
    const { world, a, b } = duel(); equip(a, 'shield');
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, firePress: 1, fire: true }]); world.step();
    equip(a, 'boost'); world.enqueue(a.id, [{ ...NEUTRAL, seq: 2, firePress: 1, fire: true }]); world.step(); expect(a.boostUntil).toBe(0);
    a.shieldUntil = 0; damage(world, a, 100, b.id); world.enqueue(a.id, [{ ...NEUTRAL, seq: 3, firePress: 2 }]); world.step();
    advance(world, CONFIG.respawnDelay + .1); equip(a, 'boost'); world.enqueue(a.id, [{ ...NEUTRAL, seq: 4, firePress: 2 }]); world.step(); expect(a.boostUntil).toBe(0);
  });
  it.each([-1, 1.2, 1e10, '2', null])('rejects malformed press IDs: %s', firePress => {
    expect(() => parseMessage(JSON.stringify({ type: 'input', commands: [{ ...NEUTRAL, seq: 1, firePress }] }))).toThrow();
  });
});
describe('assisted bullets, ballistic cannon and physical explosives', () => {
  it.each(['machineGun'] as const)('%s intercepts a moving elevated target from its actual barrel', weapon => {
    const { world, a, b } = duel(); world.random = () => .5;
    a.x=-23;Object.assign(b, { x: -22, y: 1.2, z: 10, vx: 8, vy: 1 }); equip(a, weapon);
    const aim = weaponAim(a, world.players.values(), world.time, weapon); expect(aim.target?.id).toBe(b.id); expect(aim.direction.y).toBeGreaterThan(0);
    activate(world, a); const shot = world.projectiles.values().next().value!;
    expect(shot.x).toBeCloseTo(weaponMuzzle(a, weapon, aim.direction).x); expect(shot.y).toBeCloseTo(weaponMuzzle(a, weapon, aim.direction).y);
    for (let i = 0; i < 24; i++) { b.x += b.vx * DT; b.y += b.vy * DT; world.time += DT; stepProjectiles(world); }
    expect(b.health).toBeLessThan(100);expect(b.health).toBeGreaterThanOrEqual(100-WEAPONS[weapon].damage); expect(world.projectiles.size).toBe(0);
  });
  it('cannon follows the analytic gravity arc and produces a heavy ground-impact explosion', () => {
    const { world, a, b } = duel(); b.x = 30; equip(a, 'cannon'); activate(world, a);
    const shot = world.projectiles.values().next().value!, initial = { ...shot };
    for (let i = 0; i < 15; i++) { world.time += DT; stepProjectiles(world); }
    const expected = ballisticPosition(initial, 15 * DT, CONFIG.gravity);
    expect(shot.y).toBeCloseTo(expected.y, 8); expect(shot.z).toBeCloseTo(expected.z, 8); expect(shot.vy).toBeCloseTo(initial.vy - CONFIG.gravity * 15 * DT, 8);
    expect(shot.y).toBeGreaterThan(initial.y + 1.3);
    for (let i = 0; i < 80; i++) { world.time += DT; stepProjectiles(world); }
    expect(world.projectiles.size).toBe(0); expect(world.events.find(e => e.kind === 'explosion')).toMatchObject({ weapon: 'cannon', radius: WEAPONS.cannon.blast });
  });
  it('one cannon tap fires all four rounds at the authoritative cadence after release', () => {
    const { world, a, b } = duel(); b.x = 30; equip(a, 'cannon');
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, firePress: 1 }, { ...NEUTRAL, seq: 2, firePress: 1 }]);
    const events = new Map<number, number>();
    for (let i = 0; i < 170; i++) { world.step(); for (const e of world.events) if (e.kind === 'fire') events.set(e.id, e.at); }
    expect(events.size).toBe(4); expect(a.ammo).toBe(0); expect(a.attacking).toBe(false);
    const times = [...events.values()]; for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeCloseTo(.8, 8);
  });
  it('sweeps a bomb against a raised ramp face rather than snapping onto its top', () => {
    const { world, a, b } = duel(); b.x = 30; equip(a, 'bomb'); activate(world, a);
    const bomb = world.projectiles.values().next().value!;
    Object.assign(bomb, { x: 0, y: .4, z: -49, vx: 0, vy: 0, vz: 100 }); world.time += DT; stepProjectiles(world);
    expect(bomb.z).toBeLessThan(-47.5); expect(bomb.vz).toBeLessThan(0); expect(bomb.y).toBeLessThan(1);
  });
  it('Lob-Grenuke detonates on a swept direct kart impact', () => {
    const { world, a, b } = duel(); equip(a, 'bomb'); activate(world, a);
    const bomb = world.projectiles.values().next().value!; Object.assign(bomb, { x: b.x, y: .7, z: b.z - 1.5, vx: 0, vy: 0, vz: 30 });
    world.time += DT; stepProjectiles(world); expect(b.health).toBe(0); expect(world.projectiles.size).toBe(0);expect(world.events.some(e=>e.kind==='explosion'&&e.weapon==='bomb')).toBe(true);
  });
  it('homing reacquires a visible target after its original target dies', () => {
    const { world, a, b } = duel();a.x=-23;b.x=-23; equip(a, 'homing'); activate(world, a); const missile = world.projectiles.values().next().value!;
    b.health = 0; const c = world.addPlayer('c', 'Replacement'); Object.assign(c, { x: -22, y: 0, z: 10, invulnerableUntil: 0 });
    world.time += DT; stepProjectiles(world); expect(missile.target).toBe(c.id); expect(missile.vx).toBeGreaterThan(0);
  });
  it('an embedded explosion cannot bypass the wall that encloses it', () => {
    const { world, a, b } = duel(); Object.assign(b, { x: 15, z: 25 }); equip(a, 'rocket'); activate(world, a);
    const rocket = world.projectiles.values().next().value!; Object.assign(rocket, { x: 15, y: 1.9, z: 24.15, blast: 10 });
    explode(world, rocket); expect(b.health).toBe(100);
  });
  it('an embedded explosion cannot lift its damage origin above solid terrain', () => {
    const { world, a, b } = duel(); equip(a, 'rocket'); activate(world, a);
    const rocket = world.projectiles.values().next().value!; Object.assign(rocket, { x: 0, y: .35, z: -43 });
    Object.assign(b, { x: 0, y: .7, z: -43 }); explode(world, rocket); expect(b.health).toBe(100);
  });
});
