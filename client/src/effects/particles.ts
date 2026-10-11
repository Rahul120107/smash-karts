import * as THREE from 'three';
import type { GameEvent } from '../../../shared/src/types.js';
interface Particle { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; total: number; size: number }
export class Particles {
  private particles: Particle[] = []; private geometry = new THREE.IcosahedronGeometry(1, 0);
  private materials = new Map<number, THREE.MeshBasicMaterial>();
  constructor(private scene: THREE.Scene) {}
  emit(event: GameEvent) {
    if (this.particles.length > 400) return;
    const explosive = event.kind === 'explosion' || event.kind === 'elimination';
    const count = explosive ? 20 : event.kind === 'fire' ? 3 : 8;
    const color = explosive ? 0xffa259 : event.kind === 'pickup' ? 0xffdb7e : event.kind === 'shield' ? 0x67d5ff : event.kind === 'boost' ? 0x72ffc1 : 0xfff3cb;
    let material = this.materials.get(color);
    if (!material) { material = new THREE.MeshBasicMaterial({ color }); this.materials.set(color, material); }
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geometry, material); mesh.position.set(event.x, event.y, event.z);
      const size = explosive ? 0.25 + Math.random() * 0.3 : 0.07 + Math.random() * 0.12; mesh.scale.setScalar(size); this.scene.add(mesh);
      const speed = explosive ? 8 : 3, life = explosive ? 0.65 : 0.3;
      this.particles.push({ mesh, size, velocity: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed), life, total: life });
    }
  }
  update(dt: number) {
    this.particles = this.particles.filter(p => {
      p.life -= dt; if (p.life <= 0) { this.scene.remove(p.mesh); return false; }
      p.velocity.y -= 12 * dt; p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.scale.setScalar(p.size * p.life / p.total); return true;
    });
  }
  dispose() { for (const p of this.particles) this.scene.remove(p.mesh); this.particles = []; this.geometry.dispose(); for (const m of this.materials.values()) m.dispose(); }
}
