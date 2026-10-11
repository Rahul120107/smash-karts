import * as THREE from 'three';
import type { ProjectileKind } from '../../../shared/src/types.js';
export function createProjectile(kind: ProjectileKind): THREE.Group {
  const group = new THREE.Group();
  const colors: Record<ProjectileKind, number> = { bullet: 0xfff38d, pellet: 0xffcf71, rocket: 0xff7948, homing: 0xdf8eff, mine: 0xff5268, bomb: 0x24313c };
  const material = new THREE.MeshStandardMaterial({ color: colors[kind], emissive: colors[kind], emissiveIntensity: kind === 'bomb' ? 0 : 0.6 });
  if (kind === 'rocket' || kind === 'homing') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.8, 8), material); body.rotation.x = Math.PI / 2; group.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), material); nose.rotation.x = Math.PI / 2; nose.position.z = 0.5; group.add(nose);
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.9, 8), new THREE.MeshBasicMaterial({ color: 0xffd17d, transparent: true, opacity: 0.7 })); trail.rotation.x = -Math.PI / 2; trail.position.z = -0.7; group.add(trail);
  } else if (kind === 'mine') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.22, 12), material); group.add(body);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffedf0 })); light.position.y = 0.2; group.add(light);
  } else {
    const radius = kind === 'bomb' ? 0.4 : kind === 'pellet' ? 0.17 : 0.1;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), material); if (kind === 'bullet') mesh.scale.z = 3; group.add(mesh);
    if (kind === 'bomb') { const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5), new THREE.MeshBasicMaterial({ color: 0xffc04f })); fuse.position.y = 0.45; group.add(fuse); }
  }
  return group;
}
export function createPickup(): THREE.Group {
  const group = new THREE.Group();
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15), new THREE.MeshStandardMaterial({ color: 0xffd367, emissive: 0xd99724, emissiveIntensity: 0.35, roughness: 0.35 })); cube.castShadow = true; group.add(cube);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: 0xfff4c1 })); group.add(edges);
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128; const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffdc79'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#744923'; ctx.font = 'bold 102px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', 64, 102);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshBasicMaterial({ map: texture });
  for (let i = 0; i < 4; i++) { const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), face); plane.rotation.y = i * Math.PI / 2; plane.position.set(Math.sin(plane.rotation.y) * 0.581, 0, Math.cos(plane.rotation.y) * 0.581); group.add(plane); }
  return group;
}
