import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { IslandBackdrop, WATERFALL_SITES } from '../client/src/maps/island-backdrop.js';
import { TREES, TUNNEL, toWorld } from '../shared/src/arena.js';
import { rockTextures } from '../client/src/maps/surface-textures.js';
import { groundHeight, TUNNELS } from '../shared/src/arena.js';
import { moveKart, NEUTRAL, resolveCeilings } from '../shared/src/movement.js';
import { clearShot } from '../shared/src/aim.js';
import { wallHit } from '../server/src/collisions/projectile.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { explode } from '../server/src/combat/damage.js';
import { duel, equip } from './helpers.js';
import { skylandGeometry } from '../client/src/maps/skylands.js';

describe('alien world geometry and quality budgets', () => {
  it('faces floating island walls outward and closes the elevated moss and lower rock caps',()=>{
    const geometry=skylandGeometry(),normal=geometry.getAttribute('normal');
    expect(normal.getZ(0)).toBeGreaterThan(0);const positions=geometry.getAttribute('position');let caps=0;for(let i=0;i<positions.count;i++)if(Math.hypot(positions.getX(i),positions.getZ(i))<.001){expect(normal.getY(i)*Math.sign(positions.getY(i))).toBeGreaterThan(.9);caps++;}expect(caps).toBe(2);geometry.dispose();
  });
  it('uses small original repeatable color and normal maps', () => {
    const textures = rockTextures();
    for (const map of Object.values(textures)) { expect(map.image.width).toBe(128); expect(map.image.height).toBe(128); expect(map.wrapS).toBe(THREE.RepeatWrapping); map.dispose(); }
  });
  it('retains all scenic layers while reducing forest density and cloud triangles', () => {
    const world = new IslandBackdrop();
    const trunks = world.group.getObjectByName('forest-trunks') as THREE.InstancedMesh;
    const clouds = world.group.getObjectByName('sunset-clouds') as THREE.InstancedMesh;
    expect(trunks.count).toBe(TREES.length); expect(clouds.geometry.index!.count / 3 * clouds.count).toBe(72);
    expect(world.group.getObjectByName('distant-mountains')).toBeInstanceOf(THREE.InstancedMesh);
    expect(world.group.getObjectByName('autumn-canopies')).toBeInstanceOf(THREE.InstancedMesh);
    expect(world.group.getObjectByName('waterfall-mist')).toBeInstanceOf(THREE.Points);
    for (const site of WATERFALL_SITES) expect(site.height).toBeGreaterThanOrEqual(7);
    world.update(1, new THREE.Vector3(), true); expect(trunks.count).toBe(TREES.filter(t=>t.solid).length+Math.ceil(TREES.filter(t=>!t.solid).length/3)); expect(clouds.visible).toBe(true);
    expect(world.group.getObjectByName('waterfall-0')!.visible).toBe(true);
    world.update(2, new THREE.Vector3(), false); expect(trunks.count).toBe(TREES.length);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    world.group.traverse(object => { if (object instanceof THREE.Mesh || object instanceof THREE.Points) { geometries.add(object.geometry); for (const m of Array.isArray(object.material) ? object.material : [object.material]) { materials.add(m); for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); } if (object instanceof THREE.InstancedMesh) object.dispose(); } });
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
  });
});
describe('playable tunnel and combat integration', () => {
  it.each(TUNNELS.filter(w => (w.base??0) > 3))('drives through the open portal at $x,$z while roof hits stop jumps', roof => {
    const kart = { ...toWorld(0,-6,roof), y: 0, yaw: TUNNEL.yaw, vx: 0, vy: 0, vz: 10 };
    for (let i = 0; i < 45; i++) { moveKart(kart, { ...NEUTRAL, throttle: 1 }); expect(Math.abs(kart.x-roof.x)).toBeLessThan(2); expect(kart.y).toBeGreaterThanOrEqual(groundHeight(kart.x, kart.z)); }
    expect(kart.z).toBeGreaterThan(roof.z + 5);
    Object.assign(kart, { z: roof.z, y: 4, vy: 5 }); resolveCeilings(kart); expect(kart.y).toBeCloseTo(roof.base! - 1.8); expect(kart.vy).toBe(0);
  });
  it('allows low shots through the portal and stops shots against its ceiling', () => {
    expect(clearShot({ x: 45, y: 2, z: -20 }, { x: 45, y: 2, z: -8 })).toBe(true);
    expect(wallHit({ x: 45, y: 3, z: -14 }, { x: 45, y: 7, z: -14 }, .44)).not.toBeNull();
  });
  it.each(['machineGun', 'rocket', 'homing', 'scatter', 'cannon', 'bullets', 'blastMissile'] as const)('%s cannot sweep through an overhead tunnel roof', weapon => {
    const { world, a, b } = duel(); b.x = 30; equip(a, weapon); activate(world, a);
    const shot = world.projectiles.values().next().value!;
    Object.assign(shot, { x: 45, y: 3.8, z: -14, vx: 0, vy: 150, vz: 0, target: null });
    // Prevent homing reacquisition from changing the deliberately vertical sweep.
    b.health = 0; world.time += 1 / 60; stepProjectiles(world);
    expect(world.projectiles.has(shot.id)).toBe(false); expect(shot.y).toBeLessThan(5.2);
    if (shot.blast) expect(world.events.some(e => e.kind === 'explosion' && e.weapon === weapon)).toBe(true);
  });
  it('blocks cannon splash across a tunnel ceiling while affecting an exposed enemy below it', () => {
    const { world, a, b } = duel(); equip(a, 'cannon'); activate(world, a);
    const ball = world.projectiles.values().next().value!;
    Object.assign(ball, { x: 45, y: 3.8, z: -14 }); Object.assign(b, { x: 45, y: 7, z: -14 });
    explode(world, ball); expect(b.health).toBe(100);
    b.y = 1.2; explode(world, ball); expect(b.health).toBeLessThan(100); expect(a.health).toBe(100);
  });
});
