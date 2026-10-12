import * as THREE from 'three';
import { ARENA_SIZE,CORNER_RADIUS,ROADS,WALLS,BRIDGES,BOOST_PADS,earthHeight,groundHeight,toWorld } from '../../../shared/src/arena.js';
import { batchStatic } from '../game/batch.js';
import { rockTextures } from './surface-textures.js';

export function stoneTexture(){
  const pixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const row=Math.floor(y/16),column=Math.floor((x+(row%2)*16)/32),seam=y%16<1||(x+(row%2)*16)%32<1;
    const grain=(Math.imul(x+Math.imul(y,131),1597334677)>>>24)%14,shade=seam?92:174+(Math.imul(row*19+column*7,137)>>>2)%30+grain;
    pixels.set([shade,Math.min(255,shade+3),Math.max(0,shade-7),255],(y*128+x)*4);
  }
  const texture=new THREE.DataTexture(pixels,128,128);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(.28,.28);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;return texture;
}
export function floorOutline(){const h=ARENA_SIZE/2,r=CORNER_RADIUS,s=new THREE.Shape();s.moveTo(-h+r,-h);s.lineTo(h-r,-h);s.absarc(h-r,-h+r,r,-Math.PI/2,0);s.lineTo(h,h-r);s.absarc(h-r,h-r,r,0,Math.PI/2);s.lineTo(-h+r,h);s.absarc(-h+r,h-r,r,Math.PI/2,Math.PI);s.lineTo(-h,-h+r);s.absarc(-h+r,-h+r,r,Math.PI,Math.PI*1.5);s.closePath();return s;}
export function roadGeometry(){const p:number[]=[],uv:number[]=[];for(const road of ROADS)for(const t of road.triangles)for(const v of [t.a,t.b,t.c]){p.push(v.x,v.y,v.z);uv.push(v.x,v.z);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;}
export function terrainGeometry(){
  const p:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[],h=ARENA_SIZE/2,n=ARENA_SIZE/2;
  for(let z=0;z<=n;z++)for(let x=0;x<=n;x++){const wx=-h+x*2,wz=-h+z*2,y=earthHeight(wx,wz);p.push(wx,y,wz);uv.push(wx*.06,wz*.06);const tint=new THREE.Color(y<-.2?0x8c9273:0x758850).multiplyScalar(.92+.08*Math.sin(wx*.21)*Math.cos(wz*.17));colors.push(tint.r,tint.g,tint.b);}
  for(let z=0;z<n;z++)for(let x=0;x<n;x++){const wx=-h+x*2,wz=-h+z*2,dx=Math.max(0,Math.abs(wx+1)-(h-CORNER_RADIUS)),dz=Math.max(0,Math.abs(wz+1)-(h-CORNER_RADIUS));if(Math.hypot(dx,dz)>CORNER_RADIUS)continue;const a=z*(n+1)+x,b=a+1,c=a+n+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function buildArena(){
  const group=new THREE.Group();group.name='emberfall-island';
  const stone=new THREE.MeshStandardMaterial({color:0xb6af9d,map:stoneTexture(),roughness:.91,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const rock=new THREE.MeshStandardMaterial({color:0x8a8679,roughness:.93,...rockTextures(),normalScale:new THREE.Vector2(.35,.35)});
  const wood=new THREE.MeshStandardMaterial({color:0x86542f,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x453f35,roughness:.75}),moss=new THREE.MeshStandardMaterial({color:0x697849,roughness:.94});
  const glow=new THREE.MeshStandardMaterial({color:0xffd891,emissive:0xffb04a,emissiveIntensity:1.2,roughness:.5});
  const ground=new THREE.Mesh(terrainGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.name='shared-island-terrain';ground.receiveShadow=true;group.add(ground);
  const road=new THREE.Mesh(roadGeometry(),stone);road.name='stone-road-network';road.receiveShadow=true;group.add(road);
  const box=(size:[number,number,number],at:[number,number,number],material:THREE.Material,yaw=0,shadow=false)=>{
    const geometry=material===rock?new THREE.BoxGeometry(...size,3,3,3):new THREE.BoxGeometry(...size);
    if(material===rock){const p=geometry.getAttribute('position');for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),edge=Math.abs(x)>size[0]*.49&&Math.abs(z)>size[2]*.49;
      // A small bevel stays inside the shared contact envelope; roof undersides stay planar.
      const inset=edge?Math.min(.12,Math.min(size[0],size[2])*.08):0;p.setXYZ(i,x-Math.sign(x)*inset,y,z-Math.sign(z)*inset);}
      geometry.computeVertexNormals();}
    const m=new THREE.Mesh(geometry,material);m.position.set(...at);m.rotation.y=yaw;m.castShadow=shadow;m.receiveShadow=true;group.add(m);return m;};
  for(const w of WALLS){
    if(w.style==='tree')continue;
    const material=w.style==='rail'||w.style==='boundary'?wood:rock;
    const block=box([w.width,w.height,w.depth],[w.x,(w.base??0)+w.height/2,w.z],material,w.yaw??0,w.style==='tunnel');block.userData.collider=w;
    if(w.style==='rail'||w.style==='boundary'){
      const longX=w.width>w.depth,length=longX?w.width:w.depth;
      for(let d=-length/2;d<=length/2;d+=4){const at=toWorld(longX?d:0,longX?0:d,w);box([.25,w.height+.1,.25],[at.x,(w.base??0)+(w.height+.1)/2,at.z],dark,w.yaw??0);}
    }else if(w.style==='rock'&&!(w.base??0))box([w.width*.9,.07,w.depth*.9],[w.x,w.height+.035,w.z],moss,w.yaw??0);
  }
  // Lantern housings use emissive faces rather than additional shadow lights.
  for(const bridge of BRIDGES)for(const x of [-20,24])for(const side of [-1,1]){const z=bridge.z+side*5.5;box([.2,1.8,.2],[x,bridge.height+.9,z],dark);box([.42,.55,.42],[x,bridge.height+1.8,z],glow);box([.55,.12,.55],[x,bridge.height+2.1,z],dark);}
  for(const pad of BOOST_PADS){
    const p:number[]=[],uv:number[]=[];const corners=[[-pad.width/2,-pad.depth/2],[-pad.width/2,pad.depth/2],[pad.width/2,-pad.depth/2],[pad.width/2,pad.depth/2]];
    for(const i of [0,1,2,2,1,3]){const c=corners[i]!,v=toWorld(c[0]!,c[1]!,pad);p.push(v.x,groundHeight(v.x,v.z)+.015,v.z);uv.push(c[0]!/pad.width+.5,c[1]!/pad.depth+.5);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();
    const m=new THREE.Mesh(g,new THREE.ShaderMaterial({side:THREE.DoubleSide,uniforms:{},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec2 vUv;void main(){float edge=step(.04,vUv.x)*step(vUv.x,.96)*step(.06,vUv.y)*step(vUv.y,.94);float arrow=step(abs(vUv.x-.5),.28)*step(.35,fract(vUv.y*3.-abs(vUv.x-.5)*2.));gl_FragColor=vec4(mix(vec3(.09,.25,.19),vec3(.95,.72,.24),max(1.-edge,arrow)),1.);\n#include <colorspace_fragment>\n}'}));m.name='boost-pad-'+pad.id;group.add(m);
  }
  batchStatic(group);return group;
}
