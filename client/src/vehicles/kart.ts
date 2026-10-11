import * as THREE from 'three';
import { batchStatic } from '../game/batch.js';
export interface KartVisual {
  group: THREE.Group; chassis: THREE.Group; wheels: THREE.Group[]; steering: THREE.Group[];
  turret: THREE.Group; cannon: THREE.Group; missileMarker: THREE.Mesh; shield: THREE.Mesh; boost: THREE.Mesh; contact: THREE.Mesh; label: THREE.Sprite;
}
/** Original open-wheel racer, with four batched body materials. */
export function createKart(color: number, name: string): KartVisual {
  const group = new THREE.Group(), chassis = new THREE.Group(), wheels: THREE.Group[] = [], steering: THREE.Group[] = [];
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.18, flatShading: true });
  const dark = new THREE.MeshStandardMaterial({ color: 0x172635, roughness: 0.87 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xaac8d5, metalness: 0.65, roughness: 0.32 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xfff3df, roughness: 0.6 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; chassis.add(mesh); return mesh;
  };
  add(new THREE.BoxGeometry(1.28, 0.3, 2.15), paint, 0, 0.48, 0);
  const nose = add(new THREE.CylinderGeometry(0.6, 0.74, 0.3, 4), paint, 0, 0.71, 0.68); nose.rotation.y = Math.PI / 4; nose.scale.z = 1.22;
  for (const x of [-0.62, 0.62]) {
    add(new THREE.BoxGeometry(0.26, 0.38, 1.25), paint, x, 0.64, -0.14);
    add(new THREE.BoxGeometry(0.1, 0.65, 0.1), metal, x * 0.63, 1.1, -0.6);
    add(new THREE.BoxGeometry(0.12, 0.16, 0.8), dark, x * 0.75, 0.36, -0.75);
    add(new THREE.BoxGeometry(0.2, 0.13, 0.08), cream, x * 0.73, 0.68, 1.24);
  }
  add(new THREE.BoxGeometry(0.82, 0.1, 0.1), metal, 0, 1.43, -0.6);
  add(new THREE.BoxGeometry(1.85, 0.14, 0.34), paint, 0, 0.95, -1.09);
  add(new THREE.BoxGeometry(1.6, 0.12, 0.18), metal, 0, 0.39, 1.18);
  add(new THREE.BoxGeometry(0.18, 0.035, 0.75), cream, 0, 0.875, 0.83);
  add(new THREE.BoxGeometry(0.65, 0.58, 0.4), dark, 0, 0.94, -0.44);
  add(new THREE.CapsuleGeometry(0.23, 0.13, 3, 8), cream, 0, 1.04, -0.12);
  add(new THREE.IcosahedronGeometry(0.34, 1), paint, 0, 1.47, -0.06);
  const visor = add(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI), dark, 0, 1.49, -0.015); visor.scale.set(1, 0.43, 1);
  const steeringWheel = add(new THREE.TorusGeometry(0.19, 0.035, 4, 10), dark, 0, 1.05, 0.32); steeringWheel.rotation.x = -0.5;
  batchStatic(chassis); group.add(chassis);
  for (const x of [-0.84, 0.84]) for (const z of [-0.77, 0.77]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.33, z);
    const wheel = new THREE.Group(); pivot.add(wheel);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.27, 10), dark); tire.rotation.z = Math.PI / 2; tire.castShadow = true; wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.285, 6), metal); hub.rotation.z = Math.PI / 2; wheel.add(hub);
    wheels.push(wheel); if (z > 0) steering.push(pivot); group.add(pivot);
  }
  const turret = new THREE.Group(); turret.position.set(0.48, 0.95, 0.55);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.72, 6), dark); barrel.rotation.x = Math.PI / 2; barrel.position.z = 0.3; turret.add(barrel);
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 6), metal); muzzle.rotation.x = Math.PI / 2; muzzle.position.z = 0.62; turret.add(muzzle); batchStatic(turret); chassis.add(turret);
  const cannon = new THREE.Group(); cannon.position.set(0, 0.94, 0.35);
  const cannonBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.31, 1, 12), dark); cannonBarrel.rotation.x = Math.PI / 2; cannonBarrel.position.z = 0.3; cannon.add(cannonBarrel);
  for (const z of [-0.12, 0.7]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.045, 4, 12), metal); band.position.z = z; cannon.add(band); }
  const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.65), paint); carriage.position.y = -0.22; cannon.add(carriage);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), dark); bore.position.z = 0.81; cannon.add(bore);
  batchStatic(cannon); cannon.visible = false; chassis.add(cannon);
  const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.65, 1), new THREE.MeshBasicMaterial({ color: 0x71e2ff, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  shield.position.y = 0.8; shield.visible = false; group.add(shield);
  const missileMarker = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.035, 3, 20, Math.PI * 1.7), new THREE.MeshBasicMaterial({ color: 0xf6a5ff, transparent: true, opacity: 0.7, depthWrite: false }));
  missileMarker.rotation.x = -Math.PI / 2; missileMarker.position.y = 0.4; missileMarker.visible = false; group.add(missileMarker);
  const boost = new THREE.Mesh(new THREE.ConeGeometry(0.27, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0x62ffdc, transparent: true, opacity: 0.85, depthWrite: false })); boost.position.set(0, 0.5, -1.7); boost.rotation.x = -Math.PI / 2; boost.visible = false; group.add(boost);
  const contact = new THREE.Mesh(new THREE.CircleGeometry(1.1, 12), new THREE.MeshBasicMaterial({ color: 0x11283b, transparent: true, opacity: 0.2, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2; contact.scale.y = 1.3; contact.visible = false; group.add(contact);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 96;
  const ctx = canvas.getContext('2d')!; ctx.font = '700 38px system-ui'; ctx.textAlign = 'center';
  ctx.fillStyle = '#12273de6'; ctx.beginPath(); ctx.roundRect(0, 4, 512, 84, 24); ctx.fill(); ctx.fillStyle = '#fff6e5'; ctx.fillText(name, 256, 61);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); label.position.set(0, 2.5, 0); label.scale.set(2.8, 0.525, 1); group.add(label);
  return { group, chassis, wheels, steering, turret, cannon, missileMarker, shield, boost, contact, label };
}
