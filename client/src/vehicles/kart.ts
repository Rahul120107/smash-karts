import * as THREE from 'three';
export interface KartVisual { group: THREE.Group; wheels: THREE.Group[]; shield: THREE.Mesh; boost: THREE.Mesh; label: THREE.Sprite }
export function createKart(color: number, name: string): KartVisual {
  const group = new THREE.Group(), wheels: THREE.Group[] = [];
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.12 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2934, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9eafb1, metalness: 0.45, roughness: 0.4 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf3e5c9 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; group.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(1.35, 0.35, 2.25), paint, 0, 0.52, 0);
  add(new THREE.BoxGeometry(1.12, 0.28, 0.9), paint, 0, 0.76, 0.78);
  add(new THREE.BoxGeometry(1.55, 0.15, 0.15), metal, 0, 0.42, 1.22);
  add(new THREE.BoxGeometry(1.55, 0.15, 0.15), metal, 0, 0.42, -1.22);
  add(new THREE.BoxGeometry(0.78, 0.6, 0.45), dark, 0, 1, -0.48);
  add(new THREE.CapsuleGeometry(0.24, 0.15, 4, 8), cream, 0, 1.05, -0.16);
  add(new THREE.SphereGeometry(0.34, 12, 10), paint, 0, 1.52, -0.1);
  add(new THREE.BoxGeometry(0.5, 0.16, 0.13), dark, 0, 1.53, 0.2);
  const gun = add(new THREE.CylinderGeometry(0.08, 0.08, 0.65, 8), dark, 0.45, 0.95, 0.75); gun.rotation.x = Math.PI / 2;
  for (const x of [-0.85, 0.85]) for (const z of [-0.78, 0.78]) {
    const wheel = new THREE.Group(); wheel.position.set(x, 0.33, z);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.25, 12), dark); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.27, 8), metal); hub.rotation.z = Math.PI / 2; wheel.add(hub); wheels.push(wheel); group.add(wheel);
  }
  const shield = add(new THREE.SphereGeometry(1.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0x6addff, transparent: true, opacity: 0.16, wireframe: true, depthWrite: false }), 0, 0.8, 0); shield.visible = false;
  const boost = add(new THREE.ConeGeometry(0.3, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x7bffd3, transparent: true, opacity: 0.85 }), 0, 0.5, -1.8); boost.rotation.x = -Math.PI / 2; boost.visible = false;
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.font = 'bold 38px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#162a3bd9'; ctx.beginPath(); ctx.roundRect(0, 4, 512, 84, 24); ctx.fill(); ctx.fillStyle = '#f6f2e5'; ctx.fillText(name, 256, 61);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); label.position.set(0, 2.55, 0); label.scale.set(2.8, 0.525, 1); group.add(label);
  return { group, wheels, shield, boost, label };
}
