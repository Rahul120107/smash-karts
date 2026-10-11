import * as THREE from 'three';
import { ARENA_SIZE, RAMPS, WALLS } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';
function block(scene: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
function roadTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, image = ctx.createImageData(256, 256);
  let seed = 317;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed >>> 24) % 16;
    image.data.set([71 + grain, 88 + grain, 101 + grain, 255], i);
  }
  ctx.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(18, 18); map.anisotropy = 2; return map;
}
export function buildArena(): THREE.Group {
  const group = new THREE.Group();
  const asphalt = new THREE.MeshStandardMaterial({ color: 0xd8edff, map: roadTexture(), roughness: 0.97 });
  const sand = new THREE.MeshStandardMaterial({ color: 0xe7c9a5, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xfff5d5, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x20354a });
  const orange = new THREE.MeshStandardMaterial({ color: 0xffad51 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x48aac1, roughness: 0.75 });
  const cargo = new THREE.MeshStandardMaterial({ color: 0xcab08f, roughness: 0.9 });
  const greenery = new THREE.MeshStandardMaterial({ color: 0x629b83, flatShading: true });
  block(group, [250, 0.5, 250], [0, -0.55, 0], sand).castShadow = false;
  block(group, [ARENA_SIZE, 0.3, ARENA_SIZE], [0, -0.15, 0], asphalt).castShadow = false;
  for (let i = -29; i <= 29; i += 5) {
    for (const z of [-29, 29]) block(group, [2.6, 0.012, 0.16], [i, 0.015, z], white).castShadow = false;
    for (const x of [-29, 29]) block(group, [0.16, 0.012, 2.6], [x, 0.015, i], white).castShadow = false;
  }
  // Painted pit lanes and an arena centre circle never change collision geometry.
  for (const x of [-31, 31]) block(group, [0.2, 0.012, 61], [x, 0.015, 0], orange).castShadow = false;
  for (const z of [-31, 31]) block(group, [61, 0.012, 0.2], [0, 0.015, z], orange).castShadow = false;
  const circle = new THREE.Mesh(new THREE.RingGeometry(6.85, 7, 48), white); circle.rotation.x = -Math.PI / 2; circle.position.y = 0.015; group.add(circle);
  for (const w of WALLS) {
    block(group, [w.width, w.height, w.depth], [w.x, w.height / 2, w.z], w.height > 3 ? blue : cargo);
    block(group, [w.width + 0.04, 0.12, w.depth + 0.04], [w.x, w.height, w.z], orange);
    if (w.width < 20 && w.depth < 20) {
      block(group, [w.width + 0.1, 0.25, w.depth + 0.1], [w.x, 0.14, w.z], dark);
      for (let x = -w.width / 2 + 0.4; x < w.width / 2; x += 1.1)
        for (const side of [-1, 1]) block(group, [0.07, w.height - 0.2, 0.05], [w.x + x, w.height / 2, w.z + side * (w.depth / 2 + 0.025)], orange);
    } else {
      const length = Math.max(w.width, w.depth);
      for (let n = -length / 2 + 2; n < length / 2; n += 4) {
        const horizontal = w.width > w.depth;
        block(group, horizontal ? [1.6, 0.3, 0.03] : [0.03, 0.3, 1.6],
          [w.x + (horizontal ? n : -w.width / 2 - 0.02), 0.75, w.z + (horizontal ? -w.depth / 2 - 0.02 : n)], white);
      }
    }
  }
  for (const r of RAMPS) {
    const x0 = r.x - r.width / 2, x1 = r.x + r.width / 2, z0 = r.z - r.depth / 2, z1 = r.z + r.depth / 2;
    const points = [x0,0,z0, x0,r.height,r.z, x1,0,z0, x1,0,z0, x0,r.height,r.z, x1,r.height,r.z,
      x0,r.height,r.z, x0,0,z1, x1,r.height,r.z, x1,r.height,r.z, x0,0,z1, x1,0,z1,
      x0,0,z0, x0,0,z1, x0,r.height,r.z, x1,0,z1, x1,0,z0, x1,r.height,r.z];
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, cargo); mesh.material.side = THREE.DoubleSide; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    const slope = Math.atan2(r.height, r.depth / 2);
    for (const side of [-1, 1]) for (const half of [-1, 1]) {
      const stripe = block(group, [0.18, 0.035, r.depth / 2 / Math.cos(slope)], [r.x + side * (r.width / 2 - 0.3), r.height / 2 + 0.025, r.z + half * r.depth / 4], orange);
      stripe.rotation.x = half * slope;
    }
    for (const half of [-1, 1]) {
      const stripe = block(group, [r.width - 0.9, 0.015, 0.35], [r.x, r.height * 0.25 + 0.02, r.z + half * r.depth * 0.375], white);
      stripe.rotation.x = half * slope; stripe.castShadow = false;
    }
  }
  // All props are beyond the arena boundary, so silhouettes match the physical arena.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, radius = 54 + (i % 3) * 6, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
    const trunk = block(group, [0.6, 3, 0.6], [x, 1, z], cargo); trunk.castShadow = false;
    for (let tier = 0; tier < 2; tier++) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(2.6 - tier * 0.6, 4.8, 6), greenery); tree.position.set(x, 4 + tier * 2.1, z); tree.rotation.y = i; group.add(tree);
    }
  }
  const mountain = new THREE.MeshStandardMaterial({ color: 0xa8b6bc, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * Math.PI * 2;
    const rock = new THREE.Mesh(new THREE.ConeGeometry(11 + i % 4, 15 + i % 7, 5), mountain);
    rock.position.set(Math.sin(a) * 95, 4, Math.cos(a) * 95); rock.rotation.y = i; group.add(rock);
  }
  batchStatic(group); return group;
}
