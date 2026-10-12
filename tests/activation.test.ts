import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG, DT } from '../shared/src/config.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { WEAPONS, WEAPON_IDS } from '../shared/src/weapons.js';
import { Controls } from '../client/src/game/input.js';
import { damage, explode } from '../server/src/combat/damage.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { advance, duel, equip } from './helpers.js';

afterEach(() => vi.unstubAllGlobals());
describe('owner immunity across every weapon', () => {
  it.each(WEAPON_IDS)('%s cannot directly or indirectly damage its originating player', id => {
    const { world, a, b } = duel(); equip(a, id); activate(world, a);
    expect(a.health).toBe(100); expect(a.deaths).toBe(0);
    world.time = 10; a.shieldUntil = 0; a.invulnerableUntil = 0;
    damage(world, a, 10000, a.id); expect(a.health).toBe(100);
    for (const p of world.projectiles.values()) {
      expect(p.owner).toBe(a.id); expect(p.weapon).toBe(id);
      Object.assign(p, { x: a.x, y: 0.65, z: a.z, vx: 0, vy: 0, vz: 0, expires: 10.1, armedAt: 0 });
      if (p.blast) { b.x = a.x; b.z = a.z + 1; explode(world, p); expect(b.health).toBeLessThan(100); }
    }
    world.time = 10.2; stepProjectiles(world);
    expect(a.health).toBe(100); expect(a.deaths).toBe(0); expect(a.score).toBeGreaterThanOrEqual(0);
    expect(world.events.some(e => (e.kind === 'hit' || e.kind === 'elimination') && e.target === a.id)).toBe(false);
  });
  it('keeps original bomb ownership after the equipped weapon has been consumed', () => {
    const { world, a, b } = duel(); equip(a, 'bomb'); activate(world, a); expect(a.weapon).toBeNull();
    const bomb = world.projectiles.values().next().value!;
    Object.assign(bomb, { x: a.x, y: 0.65, z: a.z, vx: 0, vy: 0, vz: 0 }); b.z = a.z + 1;
    world.time = bomb.expires; stepProjectiles(world);
    expect(a.health).toBe(100); expect(a.deaths).toBe(0); expect(b.health).toBeLessThan(100);
    expect(world.events.find(e => e.kind === 'explosion')).toMatchObject({ player: a.id, weapon: 'bomb' });
  });
});
describe('server-owned single-press attacks', () => {
  it.each(WEAPON_IDS)('%s executes its configured use after immediate key release', id => {
    const { world, a, b } = duel(); b.x = 30; b.z = 45; equip(a, id);
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2, fire: false }]);
    const seen = new Map<number, number>();
    for (let i = 0; i < 240; i++) {
      if(id==='mine' && i%40===0) a.z+=2; world.step(); for (const e of world.events) if (e.kind === 'fire' && e.player === a.id) seen.set(e.id, e.at);
    }
    const uses = WEAPONS[id].activation === 'burst' ? WEAPONS[id].ammo : 1;
    expect(seen.size).toBe(uses); expect(a.ammo).toBe(WEAPONS[id].ammo - uses);
    expect(a.weapon).toBe(a.ammo === 0 ? null : id); expect(a.attacking).toBe(false);
    const times = [...seen.values()];
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(WEAPONS[id].cooldown - 1e-9);
    expect(a.health).toBe(CONFIG.maxHealth);
  });
  it('does not reactivate a new pickup while Space remains held, but allows a fresh press', () => {
    const { world, a } = duel(); equip(a, 'machineGun'); a.ammo = 1;
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }]); world.step(); expect(a.weapon).toBeNull();
    equip(a, 'shield'); world.enqueue(a.id, [{ ...NEUTRAL, seq: 2, fire: true }]); world.step();
    expect(a.weapon).toBe('shield'); expect(a.shieldUntil).toBe(0);
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 3 }, { ...NEUTRAL, seq: 4, fire: true }]); world.step(); world.step();
    expect(a.weapon).toBeNull(); expect(a.shieldUntil).toBeGreaterThan(world.time);
  });
  it('ignores repeated presses during a burst, cancels on elimination, and never resumes after respawn', () => {
    const { world, a, b } = duel(); equip(a, 'machineGun');
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2 }, { ...NEUTRAL, seq: 3, fire: true }]);
    advance(world, 3 * DT); expect(a.ammo).toBe(29);
    damage(world, a, 100, b.id); world.step(); advance(world, CONFIG.respawnDelay + 0.1);
    expect(a.health).toBe(100); expect(a.weapon).toBeNull(); expect(a.attacking).toBe(false);
    expect(world.events.some(e => e.kind === 'fire' && e.player === a.id)).toBe(false);
  });
  it('reselects a valid target for subsequent shots during an automatic burst', () => {
    const { world, a, b } = duel(); b.z = 16; equip(a, 'machineGun'); world.random = () => 0.5;
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2 }]); world.step(); expect(a.aimTarget).toBe(b.id);
    Object.assign(b, { x: 30, z: 45 });
    const c = world.addPlayer('c', 'New target'); Object.assign(c, { x: -10.5, z: 10, y: 0, invulnerableUntil: 0 });
    advance(world, 0.5); expect(a.aimTarget).toBe(c.id); expect(c.health).toBeLessThan(100); expect(b.health).toBe(100);
    Object.assign(c, { x: 15, z: 25 }); Object.assign(a, { x: 15, z: 19 });
    const health = c.health; advance(world, 0.5); expect(a.aimTarget).toBeNull(); expect(c.health).toBe(health);
  });
  it('captures a quick Space tap between input ticks and ignores keyboard repeats', () => {
    const target = new EventTarget(), documentTarget = new EventTarget();
    vi.stubGlobal('window', target); vi.stubGlobal('document', documentTarget);
    vi.stubGlobal('HTMLInputElement', class {}); vi.stubGlobal('HTMLButtonElement', class {});
    const controls = new Controls();
    const key = (type: string, repeat = false) => target.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code: 'Space', repeat }));
    key('keydown'); key('keyup'); expect(controls.read(1).fire).toBe(true); expect(controls.read(2).fire).toBe(false);
    key('keydown'); key('keydown', true); expect(controls.read(3).fire).toBe(true);
    key('keyup'); expect(controls.read(4).fire).toBe(false); controls.dispose();
  });
});
