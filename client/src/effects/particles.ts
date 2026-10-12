import * as THREE from 'three';
import { groundHeight } from '../../../shared/src/arena.js';
import { drivingTelemetry } from '../../../shared/src/movement.js';
import type { GameEvent, KartState, Projectile, Vec3 } from '../../../shared/src/types.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
interface Particle { position: THREE.Vector3; velocity: THREE.Vector3; color: THREE.Color; life: number; total: number; size: number; gravity: number; growth: number }
interface Decal { x: number; y: number; z: number; yaw: number; life: number; size: number; color: THREE.Color }
/** Fixed-capacity effects: particles, shockwaves and tyre marks cost at most three draw calls. */
export class Particles {
  readonly capacity = 512;
  private pool: Particle[] = Array.from({ length: this.capacity }, () => ({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), color: new THREE.Color(), life: 0, total: 1, size: 0, gravity: 0, growth: 0 }));
  private skids: Decal[] = Array.from({ length: 256 }, () => ({ x: 0, y: 0, z: 0, yaw: 0, life: 0, size: 1, color: new THREE.Color(0x16232c) }));
  private rings: Decal[] = Array.from({ length: 16 }, () => ({ x: 0, y: 0, z: 0, yaw: 0, life: 0, size: 1, color: new THREE.Color() }));
  private mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ depthWrite: false }), this.capacity);
  private skidMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.11, 0.75), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.38, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }), 256);
  private ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.85, 1, 24), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }), 16);
  private transform = new THREE.Object3D(); private tint = new THREE.Color();
  private driftClocks = new Map<string, number>(); private skidIndex = 0; private ringIndex = 0;
  constructor(private scene: THREE.Scene) {
    for (const mesh of [this.mesh, this.skidMesh, this.ringMesh]) { mesh.count = 0; mesh.frustumCulled = false; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(mesh); }
  }
  get counts() { return { particles: this.mesh.count, skids: this.skidMesh.count, rings: this.ringMesh.count }; }
  private add(pos: Vec3, color: number, size: number, life: number, speed: number, gravity = 10, growth = 0) {
    const p = this.pool.find(item => item.life <= 0); if (!p) return;
    p.position.set(pos.x, pos.y, pos.z); p.color.setHex(color); p.size = size; p.life = p.total = life; p.gravity = gravity; p.growth = growth;
    p.velocity.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.6, (Math.random() - 0.5) * speed);
  }
  emit(event: GameEvent) {
    if (event.kind === 'pickupSpawn') {
      // Original glowing motes and a ground halo reuse the existing bounded pools.
      for (let i = 0; i < 16; i++) this.add(event, 0xffe79b, 0.09, 0.65, 2.2, -2, 0.3);
      const ring = this.rings[this.ringIndex++ % this.rings.length]!;
      Object.assign(ring, { x: event.x, y: groundHeight(event.x, event.z) + 0.05, z: event.z, life: 0.65, size: 2 }); ring.color.setHex(0xffd963);
      return;
    }
    if (event.kind === 'fire' && (event.weapon === 'shield' || event.weapon === 'boost' || event.weapon === 'mine')) return;
    const explosive = event.kind === 'explosion' || event.kind === 'elimination';
    const cannon = event.weapon === 'cannon';
    const color = explosive ? cannon ? 0xffd29a : event.weapon === 'blastMissile' ? 0xff747c : 0xffad4c : event.kind === 'respawn' || event.kind === 'shield' || event.kind === 'shieldImpact' ? 0x68ddff : event.kind === 'pickup' || event.kind === 'fire' && event.weapon === 'orbit' ? event.weapon ? WEAPONS[event.weapon].color : 0xffd963 : event.kind === 'boost' ? 0x64ffcf : 0xfff1b5;
    const fire = event.kind === 'fire', count = explosive ? 22 : fire ? cannon ? 8 : 4 : event.kind === 'collision' ? 5 : 12;
    for (let i = 0; i < count; i++) this.add(event, color, explosive ? 0.16 + Math.random() * 0.25 : fire ? 0.1 : 0.065, explosive ? 0.65 : fire ? 0.09 : 0.4, explosive ? 12 : fire ? 2 : 5);
    if (explosive) for (let i = 0; i < 10; i++) this.add(event, 0x75808b, 0.18, 0.85, 4, -1.2, 1.8);
    if (cannon && fire) for (let i = 0; i < 14; i++) this.add(event, 0xb8b4a9, 0.2, 0.7, 2.5, -1, 2);
    if (cannon && explosive) for (let i = 0; i < 8; i++) this.add(event, 0x374657, 0.14, 0.8, 11, 18);
    if (explosive || event.kind === 'respawn' || event.kind === 'pickup' || event.kind === 'shield' || fire && event.weapon === 'orbit') {
      const ring = this.rings[this.ringIndex++ % this.rings.length]!;
      Object.assign(ring, { x: event.x, y: groundHeight(event.x, event.z) + 0.05, z: event.z, life: 0.65, size: explosive ? event.radius ?? 3 : 2.5 }); ring.color.setHex(color);
    }
  }
  boost(kart: KartState, dt: number) {
    if (Math.random() > Math.min(1, dt * 24)) return;
    const fx = Math.sin(kart.yaw), fz = Math.cos(kart.yaw);
    for (const side of [-0.45, 0.45]) this.add({ x: kart.x - fx * 1.6 + fz * side, y: kart.y + 0.4, z: kart.z - fz * 1.6 - fx * side }, 0x61f5ce, 0.08, 0.32, 0.8, 0, 1.2);
  }
  trail(p: Projectile, dt: number) {
    if (p.kind === 'cannonball') {
      if (Math.random() < Math.min(1, dt * 16)) this.add(p, 0xbab8ae, .075, .3, .3, -.4, .9);
      return;
    }
    if ((p.kind !== 'rocket' && p.kind !== 'homing' && p.kind !== 'blastMissile' && p.kind !== 'bomb') || Math.random() > Math.min(1, dt * 30)) return;
    const speed = Math.hypot(p.vx, p.vy, p.vz) || 1;
    this.add(p.kind === 'bomb' ? {x:p.x,y:p.y+.55,z:p.z} : { x: p.x - p.vx / speed * 0.6, y: p.y - p.vy / speed * 0.6, z: p.z - p.vz / speed * 0.6 }, p.kind === 'homing' ? 0xba92e0 : p.kind === 'bomb' ? 0xffb752 : 0xb4bac0, p.kind === 'bomb' ? .055 : .12, p.kind === 'bomb' ? .2 : .45, .7, -.6, p.kind === 'bomb' ? 0 : 1.5);
  }
  drive(kart: KartState, id: string, dt: number) {
    const telemetry = drivingTelemetry(kart);
    if (!telemetry.sliding) { this.driftClocks.delete(id); return; }
    const elapsed = (this.driftClocks.get(id) ?? 0) + dt;
    if (elapsed < 0.065) { this.driftClocks.set(id, elapsed); return; }
    this.driftClocks.set(id, elapsed % 0.065);
    for (const side of [-1, 1]) {
      const x = kart.x + Math.cos(kart.yaw) * side * 0.83 - Math.sin(kart.yaw) * 0.77;
      const z = kart.z - Math.sin(kart.yaw) * side * 0.83 - Math.cos(kart.yaw) * 0.77;
      const y = groundHeight(x, z) + 0.025;
      this.add({ x, y: y + 0.12, z }, 0xbec8ce, 0.13, 0.55, 0.7, -0.6, 1.7);
      const mark = this.skids[this.skidIndex++ % this.skids.length]!;
      Object.assign(mark, { x, y, z, yaw: kart.yaw, life: 6, size: 1 });
    }
  }
  update(dt: number) {
    let count = 0; const t = this.transform; t.rotation.set(0, 0, 0);
    for (const p of this.pool) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue;
      p.velocity.y -= p.gravity * dt; p.position.addScaledVector(p.velocity, dt);
      t.position.copy(p.position); t.scale.setScalar(p.size * (p.growth ? 1 + (p.total - p.life) * p.growth : p.life / p.total)); t.updateMatrix();
      this.mesh.setMatrixAt(count, t.matrix); this.tint.copy(p.color).multiplyScalar(0.5 + p.life / p.total * 0.5); this.mesh.setColorAt(count++, this.tint);
    }
    this.mesh.count = count; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.updateDecals(this.skids, this.skidMesh, dt, false); this.updateDecals(this.rings, this.ringMesh, dt, true);
  }
  private updateDecals(pool: Decal[], mesh: THREE.InstancedMesh, dt: number, ring: boolean) {
    let count = 0; const t = this.transform;
    for (const p of pool) {
      if (p.life <= 0) continue; p.life -= dt; if (p.life <= 0) continue;
      t.position.set(p.x, p.y, p.z); t.rotation.set(-Math.PI / 2, 0, p.yaw);
      const scale = ring ? p.size * (1 - p.life / 0.65) : Math.min(1, p.life);
      t.scale.set(scale, scale, scale); t.updateMatrix(); mesh.setMatrixAt(count, t.matrix); mesh.setColorAt(count++, p.color);
    }
    mesh.count = count; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  reset() { for (const pool of [this.pool, this.skids, this.rings]) for (const item of pool) item.life = 0; this.driftClocks.clear(); for (const mesh of [this.mesh, this.skidMesh, this.ringMesh]) mesh.count = 0; }
  dispose() { this.reset(); for (const mesh of [this.mesh, this.skidMesh, this.ringMesh]) { mesh.removeFromParent(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); mesh.dispose(); } }
}
