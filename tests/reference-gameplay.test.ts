import { describe, expect, it } from 'vitest';
import { CONFIG, DT } from '../shared/src/config.js';
import { RAMPS, WALLS } from '../shared/src/arena.js';
import { moveKart, NEUTRAL } from '../shared/src/movement.js';
import { Prediction } from '../client/src/networking/prediction.js';
import { matchWinners, standings } from '../shared/src/match.js';
import { WEAPONS, WEAPON_IDS } from '../shared/src/weapons.js';
import { RoomManager } from '../server/src/rooms/manager.js';
import { activate } from '../server/src/weapons/activate.js';
import { damage, explode } from '../server/src/combat/damage.js';
import { stepContactAttacks } from '../server/src/combat/contact.js';
import { advance, duel, equip } from './helpers.js';

describe('reference-informed ammunition and activation', () => {
  it.each(WEAPON_IDS.filter(id => WEAPONS[id].activation === 'single'))('%s retains inventory, ignores held Space and consumes one use on a new press', id => {
    const { world, a, b } = duel(); b.x = 30; b.z = 45; equip(a, id);
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }]); advance(world, 1);
    expect(a.ammo).toBe(WEAPONS[id].ammo - 1); expect(a.attacking).toBe(false);
    for (let seq = 2; seq <= 60; seq++) { world.enqueue(a.id, [{ ...NEUTRAL, seq, fire: true }]); world.step(); }
    expect(a.ammo).toBe(WEAPONS[id].ammo - 1);
    if (a.ammo > 0) {
      world.enqueue(a.id, [{ ...NEUTRAL, seq: 61 }, { ...NEUTRAL, seq: 62, fire: true }]); world.step(); world.step();
      expect(a.ammo).toBe(WEAPONS[id].ammo - 2);
    }
    expect(a.health).toBe(100);
  });
  it('ignores repeated rocket presses while the original three-shot sequence completes', () => {
    const { world, a } = duel(); equip(a, 'rocket');
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }, { ...NEUTRAL, seq: 2 }, { ...NEUTRAL, seq: 3, fire: true }]);
    advance(world, 3 * DT); expect(a.ammo).toBe(2);
    advance(world, .7); expect(a.ammo).toBe(1);
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 4 }, { ...NEUTRAL, seq: 5, fire: true }]); world.step(); world.step();
    expect(a.ammo).toBe(1); advance(world,.7); expect(a.ammo).toBe(0); expect(a.attacking).toBe(false);
  });
  it('heavy bullets assist within their cone and deal authoritative direct damage', () => {
    const { world, a, b } = duel(); world.random = () => .5; equip(a, 'bullets'); activate(world, a);
    const shot = world.projectiles.values().next().value!;
    expect(shot).toMatchObject({ kind: 'slug', target: null, blast: 0 }); expect(a.aimTarget).toBe(b.id);
    advance(world, .2); expect(b.health).toBe(100 - WEAPONS.bullets.damage); expect(a.health).toBe(100);
    b.health = 100; b.x = -10; equip(a, 'bullets'); activate(world, a); advance(world, .3); expect(b.health).toBe(100 - WEAPONS.bullets.damage);
  });
  it('a slow blast missile damages multiple opponents within its larger radius, excluding its owner', () => {
    const { world, a, b } = duel(), c = world.addPlayer('c', 'Third'), d = world.addPlayer('d', 'Distant');
    Object.assign(c, { x: -18, y: 0, z: 8, invulnerableUntil: 0 }); Object.assign(d, { x: -12, y: 0, z: 19, invulnerableUntil: 0 });
    equip(a, 'blastMissile'); activate(world, a); const missile = world.projectiles.values().next().value!;
    expect(missile.radius).toBeGreaterThan(WEAPONS.rocket.radius); expect(missile.vz).toBeLessThan(WEAPONS.rocket.speed);
    Object.assign(missile, { x: b.x, y: .65, z: b.z }); explode(world, missile);
    expect(a.health).toBe(100); expect(b.health).toBe(0); expect(c.health).toBeLessThan(100); expect(d.health).toBe(100);
    expect(a.score).toBe(1); expect(world.events.find(e => e.kind === 'explosion')).toMatchObject({ player: a.id, weapon: 'blastMissile', radius: 10 });
  });
});

describe('server-owned contact power-ups', () => {
  it.each(['orbit', 'shield'] as const)('%s damages opponents once on unobstructed contact, never its owner', id => {
    const { world, a, b } = duel(); b.z = 1.8; equip(a, id);
    world.enqueue(a.id, [{ ...NEUTRAL, seq: 1, fire: true }]); world.step();
    expect(b.health).toBe(id==='orbit'?62:0); expect(a.health).toBe(100); expect(a.score).toBe(id==='orbit'?0:1); expect(a.weapon).toBeNull();
    stepContactAttacks(world); expect(a.score).toBe(id==='orbit'?0:1);
    expect(world.snapshot('ABCDE', a.id, 8).players.find(p => p.id === a.id)).toMatchObject(id === 'orbit' ? { orbitUntil: world.time + WEAPONS.orbit.duration } : { shieldUntil: world.time + 5 });
    if(id==='shield'){advance(world, CONFIG.respawnDelay + .1); expect(b.health).toBe(100); expect(b.invulnerableUntil).toBeGreaterThan(world.time);}
  });
  it('orbit contact respects duration, height separation, line of sight and spawn protection', () => {
    const { world, a, b } = duel(); equip(a, 'orbit'); activate(world, a); b.z = 1.8; b.invulnerableUntil = 2;
    stepContactAttacks(world); expect(b.health).toBe(100); b.invulnerableUntil = 0; b.y = 3;
    stepContactAttacks(world); expect(b.health).toBe(100);
    const trunk = WALLS.find(w => w.style === 'barrier' && w.width < 2)!;
    Object.assign(a, { x: trunk.x - 1.1, y: 0, z: trunk.z }); Object.assign(b, { x: trunk.x + 1.1, y: 0, z: trunk.z });
    stepContactAttacks(world); expect(b.health).toBe(100);
    Object.assign(a, { x: -12, z: 0 }); Object.assign(b, { x: -12, z: 1.8 }); world.time = a.orbitUntil!;
    stepContactAttacks(world); expect(b.health).toBe(100);
  });
  it('shielded opponents survive orbit contact, and an orbit grants no damage immunity', () => {
    const { world, a, b } = duel(); b.z = 1.8; equip(a, 'orbit'); activate(world, a); equip(b, 'shield'); activate(world, b);
    stepContactAttacks(world); expect(b.health).toBe(100); expect(a.health).toBe(0); expect(b.score).toBe(1);
    expect(a.orbitUntil).toBe(0);
  });
  it('simultaneous orbit collisions are resolved fairly independent of join order', () => {
    const { world, a, b } = duel(); b.z = 1.8;
    world.time=Math.PI/6/WEAPONS.orbit.orbit!.speed; equip(a, 'orbit'); activate(world, a); equip(b, 'orbit'); activate(world, b);
    for(let i=0;i<3;i++){stepContactAttacks(world);world.time+=Math.PI*2/WEAPONS.orbit.orbit!.speed;} expect(a.health).toBe(0); expect(b.health).toBe(0); expect(a.score).toBe(1); expect(b.score).toBe(1);
    expect(a.deaths).toBe(1); expect(b.deaths).toBe(1);
  });
  it('bounds sustained shield contact feedback and immediately hits when protection expires', () => {
    const { world, a, b } = duel(); b.z = 1.8; equip(a, 'shield'); activate(world, a); equip(b, 'shield'); activate(world, b);
    world.events = [];
    for (let tick = 0; tick < 60; tick++) { world.time = tick * DT; stepContactAttacks(world); }
    const effects = world.events.filter(e => e.kind === 'shieldImpact'); expect(effects.length).toBeLessThanOrEqual(14);
    expect(effects.length).toBeGreaterThanOrEqual(12); expect(a.health).toBe(100); expect(b.health).toBe(100);
    for (const player of [a, b]) {
      const times = effects.filter(e => e.player === player.id).map(e => e.at);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i-1]!).toBeGreaterThanOrEqual(.15 - 1e-9);
    }
    b.shieldUntil = world.time; stepContactAttacks(world); expect(b.health).toBe(0); expect(a.score).toBe(1);
    world.start(); Object.assign(a, { x: -12, z: 0, invulnerableUntil: 0 }); Object.assign(b, { x: -12, z: 1.8, invulnerableUntil: 0 });
    equip(a, 'shield'); activate(world, a); equip(b, 'shield'); activate(world, b); world.events = [];
    stepContactAttacks(world); expect(world.events.filter(e => e.kind === 'shieldImpact')).toHaveLength(2);
  });
  it('death, disconnect, and replay stop contact attacks without residual damage', () => {
    const { world, a, b } = duel(); equip(a, 'orbit'); activate(world, a); damage(world, a, 100, b.id);
    expect(a.orbitUntil).toBe(0); advance(world, CONFIG.respawnDelay + .1); expect(a.orbitUntil).toBe(0);
    equip(a, 'orbit'); activate(world, a); world.start(); expect(a.orbitUntil).toBe(0);
    equip(a, 'orbit'); activate(world, a); world.removePlayer(a.id); stepContactAttacks(world); expect(b.health).toBe(100);
  });
});

describe('fixed Free For All rules', () => {
  it('uses three minutes, a three-second respawn and an enforced eight-player maximum', () => {
    expect(CONFIG.matchDuration).toBe(180); expect(CONFIG.respawnDelay).toBe(3); expect(CONFIG.capacity).toBe(8);
    expect(() => new RoomManager(9)).toThrow(); expect(() => new RoomManager(1)).toThrow();
  });
  it('shares victory on the highest elimination score regardless of deaths, freezing results at expiry', () => {
    const { world, a, b } = duel(); a.score = b.score = 2; a.deaths = 3; b.deaths = 1;
    const c = world.addPlayer('c', 'Third'); c.score = 1;
    expect(standings(world.players.values())[0]?.id).toBe(b.id); expect(matchWinners(world.players.values())).toEqual([b.id, a.id]);
    world.duration = DT; world.step(); expect(world.snapshot('ABCDE', a.id, 8).winnerIds).toEqual([b.id, a.id]);
    world.removePlayer(b.id); expect(world.snapshot('ABCDE', a.id, 8).winnerIds).toEqual([b.id, a.id]);
    world.start(); expect(world.snapshot('ABCDE', a.id, 8).winnerIds).toEqual([]); expect(a.score).toBe(0);
    expect(matchWinners([])).toEqual([]);
  });
});

describe('homing terrain and muzzle validation', () => {
  it('terrain occludes large-area explosions rather than allowing splash through a ramp', () => {
    const { world, a, b } = duel(); Object.assign(a, { x: -46, z: 0, yaw: Math.PI / 2 }); Object.assign(b, { x: -34, z: 0 });
    equip(a, 'blastMissile'); activate(world, a); const missile = world.projectiles.values().next().value!;
    Object.assign(missile, { x: -45.2, y: .65, z: 0 }); explode(world, missile); expect(b.health).toBe(100); expect(a.health).toBe(100);
  });
  it('does not acquire an enemy hidden behind a ramp, or a protected enemy', () => {
    const { world, a, b } = duel(); Object.assign(a, { x: -46, z: 0, yaw: Math.PI / 2 }); Object.assign(b, { x: -34, z: 0 });
    equip(a, 'homing'); activate(world, a); expect(world.projectiles.values().next().value!.target).toBeNull();
    world.projectiles.clear(); Object.assign(a, { x: -12, z: 0, yaw: 0 }); Object.assign(b, { x: -12, z: 8, invulnerableUntil: 2 });
    equip(a, 'homing'); activate(world, a); expect(world.projectiles.values().next().value!.target).toBeNull();
  });
  it('a projectile muzzle cannot spawn on the opposite side of a ramp face', () => {
    const { world, a, b } = duel(); Object.assign(a, { x: -45.9, z: 0, yaw: Math.PI / 2 }); Object.assign(b, { x: -34, z: 0 });
    equip(a, 'rocket'); activate(world, a); const rocket = world.projectiles.values().next().value!;
    expect(rocket.x).toBeLessThan(-45); expect(rocket.expires).toBe(world.time); expect(rocket.owner).toBe(a.id);
    world.step(); expect(a.health).toBe(100); expect(world.projectiles.size).toBe(0);
  });
});

describe('new perimeter platform prediction', () => {
  it('agrees with the authoritative heightfield through a ramp and landing', () => {
    const { world, a, b } = duel(), ramp = RAMPS[0]!;
    Object.assign(a, { x: ramp.x, y: 0, z: -26, yaw: 0, vy: 0, vx: 0, vz: 18 }); Object.assign(b, { x: 30, z: 45 });
    const prediction = new Prediction(); prediction.reconcile(world.snapshot('ABCDE', a.id, 8), a.id);
    let elevated = false;
    for (let i = 1; i <= 330; i++) {
      const input = { ...NEUTRAL, throttle: 1, seq: i }; prediction.step(input, a, world.time + DT); world.enqueue(a.id, [input]); world.step();
      elevated ||= a.y >= ramp.height;
      expect(prediction.kart!.y).toBeCloseTo(a.y, 8); expect(prediction.kart!.vy).toBeCloseTo(a.vy, 8);
      expect(a.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity);
    }
    expect(elevated).toBe(true); expect(a.y).toBe(0); expect(a.vy).toBe(0);
  });
});
