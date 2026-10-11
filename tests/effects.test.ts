import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Particles } from '../client/src/effects/particles.js';
import { drivingSoundProfile } from '../client/src/effects/driving-audio.js';
import { batchStatic } from '../client/src/game/batch.js';
import type { GameEvent } from '../shared/src/types.js';
const kart = { x: -8, y: 0, z: 0, yaw: 0, vx: 0, vy: 0, vz: 0 };
const event: GameEvent = { id: 1, at: 0, kind: 'explosion', player: 'a', x: -8, y: 0.8, z: 0, radius: 4 };

describe('bounded rendering and driving audio', () => {
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
