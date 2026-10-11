import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Particles } from '../client/src/effects/particles.js';
import { drivingSoundProfile } from '../client/src/effects/driving-audio.js';
import { batchStatic } from '../client/src/game/batch.js';
import { updatePickupVisual } from '../client/src/weapons/pickup-visual.js';
import { createProjectile } from '../client/src/weapons/visuals.js';
import { PickupBatch } from '../client/src/weapons/pickup-batch.js';
import type { GameEvent } from '../shared/src/types.js';
const kart = { x: -8, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0 };
const event: GameEvent = { id: 1, at: 0, kind: 'explosion', player: 'a', x: -8, y: 0.8, z: 0, radius: 4 };

describe('bounded rendering and driving audio', () => {
  it('instances active pickup transforms while excluding cooldown boxes and clearing all instances',()=>{
    const scene=new THREE.Scene(),template=new THREE.Group(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshBasicMaterial();
    template.add(new THREE.Mesh(geometry,material));
    const halo=new THREE.Mesh(geometry,material);halo.name='pickup-halo';halo.position.y=-.6;template.add(halo);
    const batch=new PickupBatch(scene,template,30),visuals=Array.from({length:30},(_,id)=>{
      const visual=template.clone();updatePickupVisual(visual,{id,x:id,y:0,z:5,active:id!==4,availableAt:10},true,10,0);return visual;
    });
    batch.sync(visuals);expect(scene.children).toHaveLength(2);expect(batch.meshes.every(m=>m.count===29)).toBe(true);
    const matrix=new THREE.Matrix4(),actual=new THREE.Vector3();batch.meshes[0]!.getMatrixAt(4,matrix);actual.setFromMatrixPosition(matrix);expect(actual.x).toBe(5);expect(actual.z).toBe(5);expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(.6);
    for(const visual of visuals)visual.visible=false;batch.sync(visuals);expect(batch.meshes.every(m=>m.count===0)).toBe(true);
    batch.dispose();expect(scene.children).toHaveLength(0);geometry.dispose();material.dispose();
  });
  it('gives the cannon a large spherical model and persistent launch smoke', () => {
    const ball = createProjectile('cannonball'), bullet = createProjectile('bullet');
    const ballSize = new THREE.Box3().setFromObject(ball).getSize(new THREE.Vector3()), bulletSize = new THREE.Box3().setFromObject(bullet).getSize(new THREE.Vector3());
    expect(ballSize.x).toBeGreaterThan(bulletSize.x * 3); expect(ballSize.y).toBeCloseTo(ballSize.x, 1);
    const particles = new Particles(new THREE.Scene()); particles.emit({ ...event, kind: 'fire', weapon: 'cannon' }); particles.update(0.01);
    expect(particles.counts.particles).toBe(22); particles.update(0.12); expect(particles.counts.particles).toBe(14);
    particles.dispose(); for (const model of [ball, bullet]) model.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } });
  });
  it('hides collected boxes immediately and never predicts a respawn from a local clock', () => {
    const visual = new THREE.Group(), halo = new THREE.Group(); halo.name = 'pickup-halo'; visual.add(halo);
    const box = { id: 0, x: -8, y: 0, z: 18, active: false, availableAt: 10 };
    updatePickupVisual(visual, box, true, 100, 100000); expect(visual.visible).toBe(false);
    box.active = true; updatePickupVisual(visual, box, true, 10, 100000);
    expect(visual.visible).toBe(true); expect(visual.position.x).toBe(-8); expect(visual.position.z).toBe(18);
    expect(visual.scale.x).toBeCloseTo(0.6); expect(halo.scale.x).toBeCloseTo(1.8);
    updatePickupVisual(visual, box, true, 10.65, 100650); expect(visual.scale.x).toBeCloseTo(1); expect(halo.scale.x).toBeCloseTo(1);
    updatePickupVisual(visual, box, false, 11, 101000); expect(visual.visible).toBe(false);
  });
  it('renders bounded collection and glowing spawn effects and releases them', () => {
    const scene = new THREE.Scene(), particles = new Particles(scene);
    particles.emit({ ...event, kind: 'pickup' }); particles.update(0.01);
    expect(particles.counts.particles).toBe(12); expect(particles.counts.rings).toBe(1);
    particles.reset(); particles.emit({ ...event, kind: 'pickupSpawn', pickupId: 0 }); particles.update(0.01);
    expect(particles.counts.particles).toBe(16); expect(particles.counts.rings).toBe(1); expect(scene.children).toHaveLength(3);
    particles.update(0.65); expect(particles.counts).toEqual({ particles: 0, skids: 0, rings: 0 }); particles.dispose();
  });
  it('keeps simultaneous explosions in fixed pools and releases expired effects', () => {
    const scene = new THREE.Scene(), particles = new Particles(scene);
    for (let i = 0; i < 100; i++) particles.emit(event);
    particles.update(0.01);
    expect(scene.children).toHaveLength(3); expect(scene.children.every(child => child instanceof THREE.InstancedMesh)).toBe(true);
    expect(particles.counts.particles).toBe(512); expect(particles.counts.rings).toBe(16);
    particles.update(1); expect(particles.counts).toEqual({ particles: 0, skids: 0, rings: 0 });
    particles.dispose(); expect(scene.children).toHaveLength(0);
  });
  it('emits smoke and skid marks for physical sliding, but never for parked or airborne karts', () => {
    const particles = new Particles(new THREE.Scene());
    particles.drive(kart, 'a', 0.1); particles.drive({ ...kart, y: 2, vx: 6, vz: 18 }, 'b', 0.1); particles.update(0.01);
    expect(particles.counts.skids).toBe(0); expect(particles.counts.particles).toBe(0);
    for (let i = 0; i < 400; i++) particles.drive({ ...kart, vx: 6, vz: 18 }, 'a', 0.07);
    particles.update(0.01); expect(particles.counts.skids).toBe(256); expect(particles.counts.particles).toBeLessThanOrEqual(512);
    particles.reset(); particles.update(0.01); expect(particles.counts).toEqual({ particles: 0, skids: 0, rings: 0 }); particles.dispose();
  });
  it('changes engine pitch with speed and load while gating tyre audio by ground/slip', () => {
    const idle = drivingSoundProfile(kart, 0, 0.1), straight = drivingSoundProfile({ ...kart, vz: 20 }, 20, 0.1);
    const slip = drivingSoundProfile({ ...kart, vx: 6, vz: 18 }, 19, 0.1), airborne = drivingSoundProfile({ ...kart, y: 1, vx: 6, vz: 18 }, 19, 0.1);
    expect(idle.engineVolume).toBeGreaterThan(0); expect(straight.engineHz).toBeGreaterThan(idle.engineHz);
    expect(straight.tyreVolume).toBe(0); expect(idle.tyreVolume).toBe(0); expect(airborne.tyreVolume).toBe(0); expect(slip.tyreVolume).toBeGreaterThan(0);
    const accelerating = drivingSoundProfile({ ...kart, vz: 10 }, 8, 0.1), decelerating = drivingSoundProfile({ ...kart, vz: 10 }, 12, 0.1);
    expect(accelerating.engineHz).toBeGreaterThan(decelerating.engineHz); expect(accelerating.engineVolume).toBeGreaterThan(decelerating.engineVolume);
    expect(slip.tyreVolume).toBeLessThanOrEqual(0.2);
  });
  it('batches transformed geometry without moving its vertices or changing texture coordinates', () => {
    const root = new THREE.Group(); root.position.set(20, 2, -4);
    const material = new THREE.MeshStandardMaterial(), a = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material), b = a.clone();
    a.position.set(1, 0, 0); b.position.set(-3, 0, 0); root.add(a, b); batchStatic(root);
    expect(root.children).toHaveLength(1); const mesh = root.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox(); expect(mesh.geometry.boundingBox!.min.x).toBe(-4); expect(mesh.geometry.boundingBox!.max.x).toBe(2);
    expect(mesh.geometry.getAttribute('uv').count).toBe(mesh.geometry.getAttribute('position').count);
    mesh.geometry.dispose(); material.dispose();
  });
});
