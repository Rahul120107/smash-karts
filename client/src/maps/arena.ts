import * as THREE from 'three';
import { ARENA_SIZE, rampProfile, RAMPS, WALLS } from '../../../shared/src/arena.js';
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
  const grass = new THREE.MeshStandardMaterial({ color: 0x72a87b, roughness: 1 });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x9c9284, flatShading: true, roughness: 1 });
  block(group, [250, 0.5, 250], [0, -0.55, 0], sand).castShadow = false;
  block(group, [ARENA_SIZE, 0.3, ARENA_SIZE], [0, -0.15, 0], grass).castShadow = false;
  // A twelve-unit curved outer loop connects open combat plazas and inner lanes.
  const loop = new THREE.Mesh(new THREE.RingGeometry(38, 50, 80), asphalt); loop.rotation.x = -Math.PI / 2; loop.position.y = 0.008; loop.receiveShadow = true; group.add(loop);
  block(group, [22, 0.015, 108], [0, 0.001, 0], asphalt).castShadow = false;
  block(group, [108, 0.015, 24], [0, 0.002, 0], asphalt).castShadow = false;
  for (const z of [-22, 22]) block(group, [66, 0.015, 18], [0, 0.003, z], asphalt).castShadow = false;
  for (const radius of [38, 50]) {
    const edge = new THREE.Mesh(new THREE.RingGeometry(radius - 0.12, radius + 0.12, 80), white); edge.rotation.x = -Math.PI / 2; edge.position.y = 0.025; group.add(edge);
  }
  for (let i = 0; i < 64; i++) {
    const angle = i / 64 * Math.PI * 2;
    const dash = block(group, [0.16, 0.012, 1.6], [Math.sin(angle) * 44, 0.028, Math.cos(angle) * 44], white); dash.rotation.y = angle + Math.PI / 2; dash.castShadow = false;
  }
  for (let i = -29; i <= 29; i += 5) {
    for (const z of [-29, 29]) block(group, [2.6, 0.012, 0.16], [i, 0.015, z], white).castShadow = false;
    for (const x of [-29, 29]) block(group, [0.16, 0.012, 2.6], [x, 0.015, i], white).castShadow = false;
  }
  // Painted pit lanes and an arena centre circle never change collision geometry.
  for (const x of [-31, 31]) block(group, [0.2, 0.012, 61], [x, 0.015, 0], orange).castShadow = false;
  for (const z of [-31, 31]) block(group, [61, 0.012, 0.2], [0, 0.015, z], orange).castShadow = false;
  const circle = new THREE.Mesh(new THREE.RingGeometry(6.85, 7, 48), white); circle.rotation.x = -Math.PI / 2; circle.position.y = 0.015; group.add(circle);
  for (const w of WALLS) {
    block(group, [w.width, w.height, w.depth], [w.x, w.height / 2, w.z], w.style === 'rock' ? rockMaterial : w.style === 'barrier' ? orange : w.height > 3 ? blue : cargo);
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
    const x0 = r.x - r.width / 2, x1 = r.x + r.width / 2, profile = rampProfile(r), points: number[] = [];
    for (let i = 1; i < profile.length; i++) {
      const [za, ya] = profile[i - 1]!, [zb, yb] = profile[i]!; if (za === zb) continue;
      points.push(x0,ya,za, x0,yb,zb, x1,ya,za, x1,ya,za, x0,yb,zb, x1,yb,zb);
      for (const x of [x0, x1]) points.push(x,0,za, x,ya,za, x,yb,zb, x,0,za, x,yb,zb, x,0,zb);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, cargo); mesh.material.side = THREE.DoubleSide; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    const slopeLength = (r.depth - (r.plateau ?? 0)) / 2, slope = Math.atan2(r.height, slopeLength);
    for (const side of [-1, 1]) for (const half of [-1, 1]) {
      const stripe = block(group, [0.18, 0.035, slopeLength / Math.cos(slope)], [r.x + side * (r.width / 2 - 0.3), r.height / 2 + 0.025, r.z + half * ((r.plateau ?? 0) / 2 + slopeLength / 2)], orange);
      stripe.rotation.x = half * slope;
    }
    for (const half of [-1, 1]) {
      const stripe = block(group, [r.width - 0.9, 0.015, 0.35], [r.x, r.height * 0.25 + 0.02, r.z + half * ((r.plateau ?? 0) / 2 + slopeLength * 0.75)], white);
      stripe.rotation.x = half * slope; stripe.castShadow = false;
    }
    if (r.plateau) {
      const edge = block(group, [r.width - 0.4, 0.035, r.plateau - 0.4], [r.x, r.height + 0.025, r.z], blue); edge.castShadow = false;
    }
  }
  // All props are beyond the arena boundary, so silhouettes match the physical arena.
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, radius = 84 + (i % 3) * 5, x = Math.sin(a) * radius, z = Math.cos(a) * radius;
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
