import { describe, expect, it } from 'vitest';
import { CONFIG } from '../shared/src/config.js';
import { ARENA_SIZE } from '../shared/src/arena.js';
import { WEAPONS, WEAPON_IDS } from '../shared/src/weapons.js';
import { activate } from '../server/src/weapons/activate.js';
import { damage, explode } from '../server/src/combat/damage.js';
import { advance, duel, equip } from './helpers.js';
describe('weapon activation and validation', () => {
  it.each(WEAPON_IDS)('%s enforces equip, usage count, cooldown, and dead-player restrictions', id => {
    const { world, a } = duel(); expect(activate(world, a)).toBe(false); equip(a, id);
    expect(activate(world, a)).toBe(true); expect(a.ammo).toBe(WEAPONS[id].ammo - 1);
    const count = world.projectiles.size; expect(activate(world, a)).toBe(false); expect(world.projectiles.size).toBe(count);
    if (a.ammo > 0) { world.time = a.nextFire + 0.001; expect(activate(world, a)).toBe(true); }
    a.health = 0; expect(activate(world, a)).toBe(false);
  });
  it('cleans an equipped weapon after its final use', () => {
    const { world, a } = duel(); equip(a, 'shield'); activate(world, a); expect(a.weapon).toBeNull(); expect(a.ammo).toBe(0);
  });
});
describe('projectile behaviors', () => {
  it('machine gun bullets damage enemies and are removed on collision', () => {
    const { world, a, b } = duel(); equip(a, 'machineGun'); activate(world, a); advance(world, 0.15);
    expect(b.health).toBe(88); expect(a.health).toBe(100); expect(world.projectiles.size).toBe(0);
  });
  it('sweeps high-speed projectiles across their entire path', () => {
    const { world, a, b } = duel(); equip(a, 'machineGun'); activate(world, a);
    world.projectiles.values().next().value!.vz = 1000; world.step(); expect(b.health).toBe(88);
  });
  it('rockets explode on impact and damage nearby enemies', () => {
    const { world, a, b } = duel(); equip(a, 'rocket'); activate(world, a); advance(world, 0.3);
    expect(b.health).toBeLessThan(50); expect(world.events.some(e => e.kind === 'explosion')).toBe(true); expect(world.projectiles.size).toBe(0);
  });
  it('homing missiles acquire a valid target, turn, and hit it', () => {
    const { world, a, b } = duel(); b.x = -16; b.z = 11; equip(a, 'homing'); activate(world, a);
    expect(world.projectiles.values().next().value!.target).toBe(b.id); advance(world, 0.1);
    expect(world.projectiles.values().next().value!.vx).toBeLessThan(0); advance(world, 1);
    expect(b.health).toBeLessThan(100); expect(world.projectiles.size).toBe(0);
  });
  it('homing missiles without a valid target still fire forward and clean up', () => {
    const { world, a, b } = duel(); b.z = -10; equip(a, 'homing'); activate(world, a);
    expect(world.projectiles.values().next().value!.target).toBeNull(); advance(world, 5.1); expect(world.projectiles.size).toBe(0);
  });
  it('homing missiles hit nearby targets approaching from an angle without orbiting', () => {
    const { world, a, b } = duel(); b.x = -11; b.z = 6; equip(a, 'homing'); activate(world, a); advance(world, 0.8);
    expect(b.health).toBeLessThan(100); expect(world.projectiles.size).toBe(0);
  });
  it('mines arm after a delay, trigger only on enemies, and explode once', () => {
    const { world, a, b } = duel(); equip(a, 'mine'); activate(world, a);
    const mine = world.projectiles.values().next().value!; b.z = mine.z;
    advance(world, 0.5); expect(b.health).toBe(100); expect(world.projectiles.size).toBe(1);
    advance(world, 0.3); expect(b.health).toBeLessThan(100); expect(world.projectiles.size).toBe(0);
    expect(world.events.filter(e => e.kind === 'explosion')).toHaveLength(1);
  });
  it('unused mines expire and owned ordnance is deleted on disconnect', () => {
    const { world, a, b } = duel(); b.z = 20; equip(a, 'mine'); activate(world, a); advance(world, 22.1); expect(world.projectiles.size).toBe(0);
    equip(a, 'rocket'); activate(world, a); world.removePlayer(a.id); expect(world.projectiles.size).toBe(0);
  });
  it('bombs follow a lob trajectory and detonate only after their timed fuse', () => {
    const { world, a, b } = duel(); b.z = 19; equip(a, 'bomb'); activate(world, a); advance(world, 0.25);
    expect(world.projectiles.values().next().value!.y).toBeGreaterThan(1.5); expect(b.health).toBe(100);
    advance(world, 1.2); expect(world.projectiles.size).toBe(1); advance(world, 0.2);
    expect(world.projectiles.size).toBe(0); expect(b.health).toBeLessThan(100); expect(world.events.some(e => e.kind === 'explosion')).toBe(true);
  });
  it('bombs reflect only the velocity into a wall and keep tangential motion', () => {
    const { world, a } = duel(); equip(a, 'bomb'); activate(world, a); const bomb = world.projectiles.values().next().value!;
    Object.assign(bomb, { x: ARENA_SIZE / 2 - 1.5, y: 1, z: 10, vx: 20, vy: 0, vz: 8 }); world.step();
    expect(bomb.vx).toBeLessThan(0); expect(bomb.vz).toBe(8); expect(bomb.x).toBeLessThan(ARENA_SIZE / 2 - 1 - bomb.radius); expect(bomb.z).toBeGreaterThan(10);
  });
  it('bombs land on obstacle tops instead of passing through them', () => {
    const { world, a } = duel(); equip(a, 'bomb'); activate(world, a); const bomb = world.projectiles.values().next().value!;
    Object.assign(bomb, { x: 15, z: 22, y: 1.2 + bomb.radius + 0.08, vx: 0, vy: -12, vz: 0 }); world.step();
    expect(bomb.y).toBeGreaterThan(1.2 + bomb.radius); expect(bomb.vy).toBeGreaterThan(0);
  });
  it('chooses a free spawn when a new player joins an active match after a departure', () => {
    const { world, a, b } = duel(); const third = world.addPlayer('third', 'Third');
    world.start(); world.removePlayer(b.id); const joined = world.addPlayer('replacement', 'Replacement');
    expect(Math.hypot(joined.x - third.x, joined.z - third.z)).toBeGreaterThan(CONFIG.kartRadius * 2);
    expect(Math.hypot(joined.x - a.x, joined.z - a.z)).toBeGreaterThan(CONFIG.kartRadius * 2);
  });
  it('scatter blaster spawns five distinct trajectories and can land multiple pellets', () => {
    const { world, a, b } = duel(); b.z = 5; equip(a, 'scatter'); activate(world, a);
    expect(world.projectiles.size).toBe(5); expect(new Set([...world.projectiles.values()].map(p => p.vx)).size).toBe(5);
    advance(world, 0.2); expect(b.health).toBeLessThanOrEqual(56); advance(world, 1); expect(world.projectiles.size).toBe(0);
  });
  it('walls stop bullets and muzzle offsets cannot shoot through an obstacle', () => {
    const { world, a, b } = duel(); a.x = 15; a.z = 19; b.x = 15; b.z = 25;
    equip(a, 'machineGun'); activate(world, a); advance(world, 0.3); expect(b.health).toBe(100); expect(world.projectiles.size).toBe(0);
    a.z = 20.4; equip(a, 'rocket'); activate(world, a); expect(world.projectiles.values().next().value!.z).toBeLessThan(21.4);
    world.step(); expect(world.projectiles.size).toBe(0); expect(b.health).toBe(100);
  });
});
describe('damage, power-ups, and match rules', () => {
  it('blast damage falls off within radius and ignores targets outside it', () => {
    const { world, a, b } = duel(); equip(a, 'rocket'); activate(world, a); const p = world.projectiles.values().next().value!;
    p.x = -12; p.y = 0.65; p.z = 8; a.z = 4; explode(world, p);
    expect(b.health).toBe(28); expect(a.health).toBeGreaterThan(b.health);
    b.health = 100; b.z = 14; explode(world, p); expect(b.health).toBe(100);
  });
  it('walls occlude explosion damage', () => {
    const { world, a, b } = duel(); equip(a, 'rocket'); activate(world, a); const p = world.projectiles.values().next().value!;
    p.x = 15; p.y = 0.7; p.z = 20; p.blast = 10; b.x = 15; b.z = 24;
    explode(world, p); expect(b.health).toBe(100);
  });
  it('shield prevents damage for its configured duration and then expires', () => {
    const { world, a, b } = duel(); equip(b, 'shield'); activate(world, b);
    damage(world, b, 40, a.id); expect(b.health).toBe(100); advance(world, WEAPONS.shield.duration + 0.01);
    damage(world, b, 40, a.id); expect(b.health).toBe(60);
  });
  it('boost increases actual server movement speed and expires at a bounded duration', () => {
    const { world, a, b } = duel(), baseline = duel();
    a.z = -20; baseline.a.z = -20; b.x = -30; baseline.b.x = -30;
    equip(a, 'boost'); activate(world, a); expect(a.boostUntil).toBe(WEAPONS.boost.duration);
    for (let i = 0; i < 100; i++) {
      const command = { seq: i + 1, throttle: 1, steer: 0, fire: false, drift: false };
      world.enqueue(a.id, [command]); baseline.world.enqueue(baseline.a.id, [command]); world.step(); baseline.world.step();
    }
    expect(a.vz).toBeGreaterThan(baseline.a.vz * 1.4); expect(a.z).toBeGreaterThan(baseline.a.z + 4);
    advance(world, WEAPONS.boost.duration); expect(a.boostUntil).toBeLessThan(world.time);
  });
  it('eliminates once, scores the attacker, respawns, and protects the new spawn', () => {
    const { world, a, b } = duel(); damage(world, b, 100, a.id);
    expect(b.health).toBe(0); expect(a.score).toBe(1); expect(b.deaths).toBe(1);
    damage(world, b, 100, a.id); expect(a.score).toBe(1); advance(world, CONFIG.respawnDelay - 0.1); expect(b.health).toBe(0);
    advance(world, 0.2); expect(b.health).toBe(100); expect(b.weapon).toBeNull(); damage(world, b, 100, a.id); expect(b.health).toBe(100);
    advance(world, CONFIG.spawnProtection + 0.1); damage(world, b, 100, b.id); expect(b.score).toBe(0); expect(b.deaths).toBe(1); expect(b.health).toBe(100);
  });
  it('ends exactly at the match duration, freezes scores, and resets on replay', () => {
    const { world, a, b } = duel(); world.duration = 1; damage(world, b, 100, a.id); advance(world, 1.2);
    expect(world.phase).toBe('finished'); expect(world.time).toBe(1); const tick = world.tick; world.step(); expect(world.tick).toBe(tick);
    expect(world.snapshot('AAAAA', a.id, 8).remaining).toBe(0); world.start(); expect(a.score).toBe(0); expect(b.deaths).toBe(0); expect(b.health).toBe(100); expect(world.phase).toBe('playing');
  });
});
