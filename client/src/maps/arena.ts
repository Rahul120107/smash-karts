import * as THREE from 'three';
import { ARENA_SIZE, BRIDGE, rampProfile, RAMPS, WALLS } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';
function block(scene: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); return mesh;
}
function roadTexture(grass = false) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, image = ctx.createImageData(256, 256);
  let seed = 317;
  for (let i = 0; i < image.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const grain = (seed >>> 24) % 16;
    image.data.set(grass ? [57 + grain, 129 + grain, 75 + grain, 255] : [52 + grain, 66 + grain, 75 + grain, 255], i);
  }
  ctx.putImageData(image, 0, 0);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(18, 18); map.anisotropy = 2; return map;
}
/** Reusable hand-authored stone relief inside the collision box; no decorative overhangs. */
function rockBlock(width: number, height: number, depth: number) {
  const geometry=new THREE.BoxGeometry(width,height,depth,3,3,3),position=geometry.getAttribute('position'),colors:number[]=[];
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i),y=position.getY(i),z=position.getZ(i),edge=Math.abs(x)>width*.49&&Math.abs(z)>depth*.49;
    // Tiny bevels only at box corners; broad faces remain aligned with the collision bounds.
    if(edge){position.setX(i,x-Math.sign(x)*Math.min(.09,width*.03));position.setZ(i,z-Math.sign(z)*Math.min(.09,depth*.03));}
    const tint=.8+Math.sin(x*2.3+z*1.7+y*3.1)*.07+(y/height+.5)*.13;
    colors.push(tint,tint,tint);
  }
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
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
  const grass = new THREE.MeshStandardMaterial({ color: 0xd2fbc0, map: roadTexture(true), roughness: 1 });
  const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x9ca68e, flatShading: true, roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8b9986, roughness: 0.95, flatShading: true, vertexColors:true });
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
    if (w.style === 'tree') continue; // Exactly sized instanced trunks live in TropicalEnvironment.
    const base = w.base ?? 0, top = base + w.height;
    if(w.style==='barrier') block(group,[w.width,w.height,w.depth],[w.x,base+w.height/2,w.z],cargo);
    else {
      const obstacle=new THREE.Mesh(rockBlock(w.width,w.height,w.depth),stone);obstacle.position.set(w.x,base+w.height/2,w.z);obstacle.castShadow=true;obstacle.receiveShadow=true;group.add(obstacle);
    }
    block(group, [w.width, 0.08, w.depth], [w.x, top + 0.035, w.z], w.style === 'barrier' ? orange : greenery);
    if (w.style === 'tunnel') {
      // Portal edging and warm guide lamps reveal the corridor without extra lights.
      if (!base) for (const end of [-1,1]) {
        block(group, [0.3, 3.7, 0.12], [w.x + (w.x < 0 ? w.width / 2 - .15 : -w.width / 2 + .15), 1.9, w.z + end * (w.depth / 2 + .06)], white);
        block(group, [0.42, 0.22, 0.16], [w.x + (w.x < 0 ? w.width / 2 : -w.width / 2), 2.9, w.z + end * (w.depth / 2 + .08)], orange);
      }
      continue;
    }
    if (base) continue;
    if (w.style==='rock') continue;
    if (w.width < 20 && w.depth < 20) {
      block(group, [w.width + 0.1, 0.25, w.depth + 0.1], [w.x, 0.14, w.z], dark);
      // Horizontal stone bands make the original obstacles read as island ruins.
      for(let y=.8;y<w.height;y+=.9) for(const side of [-1,1])
        block(group,[w.width-.14,.025,.025],[w.x,y,w.z+side*(w.depth/2+.015)],dark).castShadow=false;
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
    const mesh = new THREE.Mesh(geometry, rockMaterial); mesh.material.side = THREE.DoubleSide; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
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
      const edge = block(group, [r.width - 0.4, 0.035, r.plateau - 0.4], [r.x, r.height + 0.025, r.z], r === BRIDGE ? cargo : blue); edge.castShadow = false;
      if (r === BRIDGE) for (let z = -r.plateau / 2 + .3; z < r.plateau / 2; z += .6)
        block(group, [r.width - .5, .014, .04], [r.x, r.height + .051, z], dark).castShadow = false;
    }
  }
  // Curved shortcuts join the western launch lane and two combat plazas.
  for (const sign of [-1,1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-27, .02, sign*22), new THREE.Vector3(-43,.02,sign*25),new THREE.Vector3(-41,.02,sign*13));
    const vertices: number[] = [], points = curve.getPoints(24);
    for (let i=1;i<points.length;i++) {
      const a=points[i-1]!,b=points[i]!,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),ox=-dz/length*3,oz=dx/length*3;
      vertices.push(a.x+ox,.022,a.z+oz,b.x+ox,.022,b.z+oz,a.x-ox,.022,a.z-oz,b.x+ox,.022,b.z+oz,b.x-ox,.022,b.z-oz,a.x-ox,.022,a.z-oz);
    }
    const geometry=new THREE.BufferGeometry(); geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,asphalt);mesh.receiveShadow=true;group.add(mesh);
  }
  batchStatic(group); return group;
}
