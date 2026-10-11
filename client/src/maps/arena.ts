import * as THREE from 'three';
import { ARENA_SIZE, RAMPS, WALLS } from '../../../shared/src/arena.js';
function block(scene: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
export function buildArena(): THREE.Group {
  const group = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x577079, roughness: 0.95 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd1bda0, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd4e1d9, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x31464e });
  const orange = new THREE.MeshStandardMaterial({ color: 0xf29b46 });
  block(group, [250, 0.5, 250], [0, -0.55, 0], sand);
  block(group, [ARENA_SIZE, 0.3, ARENA_SIZE], [0, -0.15, 0], asphalt);
  // Lane markings are purely decorative; every surface inside the arena is driveable.
  for (let i = -29; i <= 29; i += 5) {
    for (const z of [-29, 29]) block(group, [2.6, 0.015, 0.14], [i, 0.014, z], white);
    for (const x of [-29, 29]) block(group, [0.14, 0.015, 2.6], [x, 0.014, i], white);
  }
  for (const w of WALLS) {
    const material = new THREE.MeshStandardMaterial({ color: w.height > 3 ? 0x739aa7 : 0xc7b99b, roughness: 0.8 });
    block(group, [w.width, w.height, w.depth], [w.x, w.height / 2, w.z], material);
    block(group, [w.width + 0.08, 0.12, w.depth + 0.08], [w.x, w.height, w.z], orange);
    if (w.width < 20 && w.depth < 20) block(group, [w.width + 0.15, 0.35, w.depth + 0.15], [w.x, 0.18, w.z], dark);
  }
  for (const r of RAMPS) {
    const x0 = r.x - r.width / 2, x1 = r.x + r.width / 2, z0 = r.z - r.depth / 2, z1 = r.z + r.depth / 2;
    const points = [x0,0,z0, x0,r.height,r.z, x1,0,z0, x1,0,z0, x0,r.height,r.z, x1,r.height,r.z,
      x0,r.height,r.z, x0,0,z1, x1,r.height,r.z, x1,r.height,r.z, x0,0,z1, x1,0,z1,
      x0,0,z0, x0,0,z1, x0,r.height,r.z, x1,0,z1, x1,0,z0, x1,r.height,r.z];
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x83988e, side: THREE.DoubleSide, roughness: 0.85 })); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    for (const side of [-1, 1]) {
      const stripe = block(group, [0.16, 0.05, r.depth / 2 * Math.sqrt(1 + (2 * r.height / r.depth) ** 2)], [r.x + side * (r.width / 2 - 0.35), r.height / 2 + 0.03, r.z - r.depth / 4], orange);
      stripe.rotation.x = -Math.atan2(r.height, r.depth / 2);
      const stripe2 = stripe.clone(); stripe2.position.z = r.z + r.depth / 4; stripe2.rotation.x *= -1; group.add(stripe2);
    }
  }
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, radius = 53 + (i % 3) * 7;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + i % 4, 0), sand); rock.position.set(Math.sin(a) * radius, 1, Math.cos(a) * radius); rock.scale.y = 1.3; rock.rotation.y = i; group.add(rock);
  }
  return group;
}
