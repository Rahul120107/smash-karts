import * as THREE from 'three';
import { ARENA_SIZE, CORNER_RADIUS, CROSSINGS, LAVA, rampProfile, rampHalfWidth, RAMPS, WALLS } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';
function block(group: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
export function floorOutline() {
  const h = ARENA_SIZE / 2, r = CORNER_RADIUS, s = new THREE.Shape();
  s.moveTo(-h + r, -h); s.lineTo(h - r, -h); s.absarc(h-r, -h+r, r, -Math.PI/2, 0, false);
  s.lineTo(h, h-r); s.absarc(h-r, h-r, r, 0, Math.PI/2, false);
  s.lineTo(-h+r, h); s.absarc(-h+r, h-r, r, Math.PI/2, Math.PI, false);
  s.lineTo(-h, -h+r); s.absarc(-h+r, -h+r, r, Math.PI, Math.PI*1.5, false); s.closePath();
  const hole = new THREE.Path(); const w = LAVA.width / 2, d = LAVA.depth / 2;
  hole.moveTo(-w,-d); hole.lineTo(-w,d); hole.lineTo(w,d); hole.lineTo(w,-d); hole.closePath(); s.holes.push(hole); return s;
}
/** All obstacle meshes come from the authoritative boxes and ramp profiles. */
export function buildArena(): THREE.Group {
  const group = new THREE.Group(); group.name = 'crossfire-island';
  const grain = new Uint8Array(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) {
    const value = 237 + ((Math.imul(i + 7, 1597334677) >>> 24) % 19);
    grain.set([value,value,value,255], i * 4);
  }
  const asphalt = new THREE.DataTexture(grain,64,64); asphalt.colorSpace=THREE.SRGBColorSpace;
  asphalt.wrapS=asphalt.wrapT=THREE.RepeatWrapping; asphalt.magFilter=THREE.LinearFilter; asphalt.minFilter=THREE.LinearMipmapLinearFilter;
  asphalt.generateMipmaps=true; asphalt.repeat.set(.6,.6); asphalt.needsUpdate=true;
  const road = new THREE.MeshStandardMaterial({ color: 0x7c919a, map: asphalt, roughness: .88, metalness: .025 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f7ef, roughness: .9 });
  const red = new THREE.MeshStandardMaterial({ color: 0xf34448, roughness: .86 });
  const pit = new THREE.MeshStandardMaterial({ color: 0x512334, roughness: 1 });
  const green = new THREE.MeshStandardMaterial({ color: 0x37b77a, roughness: .88 });
  const rail = new THREE.MeshStandardMaterial({ color: 0xd0e7e6, roughness: .4, metalness: .25 });
  const materials = new Map<number, THREE.MeshStandardMaterial>();
  const colored = (color: number) => { let m = materials.get(color); if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: .42, metalness: .12 }); materials.set(color, m); } return m; };
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(floorOutline(), { depth: 2, bevelEnabled: false, curveSegments: 12 }), road);
  slab.rotation.x = -Math.PI / 2; slab.position.y = -2; slab.receiveShadow = true; group.add(slab);
  block(group,[LAVA.width,.1,LAVA.depth],[0,LAVA.bottom-.05,0],pit).castShadow = false;
  // Shared, traversable 12 cm rim; alternating segments have no overlapping corners.
  for (const side of [-1,1]) {
    for (let i=0;i<10;i++) block(group,[1.84,LAVA.curbHeight,1.2],[-8.28+i*1.84,LAVA.curbHeight/2,side*8.6],i%2?white:red);
    for (let i=0;i<10;i++) block(group,[1.2,LAVA.curbHeight,1.6],[side*8.6,LAVA.curbHeight/2,-7.2+i*1.6],i%2?red:white);
  }
  for (const w of WALLS) {
    const mesh=block(group,[w.width,w.height,w.depth],[w.x,(w.base??0)+w.height/2,w.z],colored(w.color!));mesh.rotation.y=w.yaw??0;
    const foot=block(group,[w.width+.02,.08,w.depth+.02],[w.x,(w.base??0)+.04,w.z],w.style==='barrier'?white:green);foot.rotation.y=w.yaw??0;
    const cap=block(group,[Math.max(.1,w.width-.08),.02,Math.max(.1,w.depth-.08)],[w.x,(w.base??0)+w.height+.008,w.z],rail);cap.rotation.y=w.yaw??0;cap.castShadow=false;
  }
  for (const r of RAMPS) {
    const local=new THREE.Group(),profile=rampProfile(r),vertices:number[]=[];
    for(let i=1;i<profile.length;i++) {
      const [az,ya]=profile[i-1]!,[bz,yb]=profile[i]!,za=az-r.z,zb=bz-r.z;if(za===zb)continue;
      const wa=rampHalfWidth(r,za),wb=rampHalfWidth(r,zb);
      vertices.push(-wa,ya,za,-wb,yb,zb,wa,ya,za,wa,ya,za,-wb,yb,zb,wb,yb,zb);
      for(const side of [-1,1])vertices.push(side*wa,0,za,side*wa,ya,za,side*wb,yb,zb,side*wa,0,za,side*wb,yb,zb,side*wb,0,zb);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const uvs:number[]=[];for(let i=0;i<vertices.length;i+=3)uvs.push(vertices[i]!,vertices[i+2]!);
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    const surface=new THREE.Mesh(geometry,r.color?colored(r.color):road);surface.material.side=THREE.DoubleSide;surface.castShadow=true;surface.receiveShadow=true;local.add(surface);
    const run=(r.depth-(r.plateau??0))/2,slope=Math.atan2(r.height,run);
    for(const side of [-1,1]) {
      const z=side*((r.plateau??0)/2+run*.75),mark=block(local,[rampHalfWidth(r,z)*2-.5,.015,.3],[0,r.height*.25+.013,z],white);mark.rotation.x=side*slope;mark.castShadow=false;
    }
    local.position.set(r.x,0,r.z);local.rotation.y=r.yaw??0;group.add(local);
  }
  for(const crossing of CROSSINGS) {
    const marks=new THREE.Group();for(let i=0;i<9;i++)block(marks,[.65,.008,crossing.depth],[-4.4+i*1.1,.006,0],white).castShadow=false;
    marks.position.set(crossing.x,0,crossing.z);marks.rotation.y=crossing.yaw;group.add(marks);
  }
  for(const s of [-1,1]) {
    block(group,[.18,.008,84],[s*53,.006,0],white).castShadow=false;
    block(group,[84,.008,.18],[0,.006,s*53],white).castShadow=false;
    block(group,[16,1.2,.02],[0,-.6,s*7.99],pit);block(group,[.02,1.2,16],[s*7.99,-.6,0],pit);
    // Lane dashes on the outer driving loop, clear of all collision geometry.
    for(let i=-36;i<=36;i+=6) {
      block(group,[2,.008,.14],[i,.012,s*49],white).castShadow=false;
      block(group,[.14,.008,2],[s*49,.012,i],white).castShadow=false;
    }
  }
  batchStatic(group); return group;
}
