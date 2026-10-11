import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { BRIDGE, groundHeight, PALMS, TUNNEL, WALLS } from '../shared/src/arena.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { clearShot } from '../shared/src/aim.js';
import { moveKart, NEUTRAL, resolveCeilings, resolveWalls } from '../shared/src/movement.js';
import { wallContact, wallHit } from '../server/src/collisions/projectile.js';
import { clipCameraRay } from '../client/src/game/camera.js';
import { animateSuspension, newSuspension } from '../client/src/vehicles/animation.js';
import { TropicalEnvironment } from '../client/src/maps/tropical.js';
import { kartShell } from '../client/src/vehicles/kart.js';
import { buildArena } from '../client/src/maps/arena.js';
const kart=(x=0,z=-54)=>({x,y:groundHeight(x,z),z,yaw:0,vx:0,vy:0,vz:0,yawRate:0});

describe('shared tropical routes and finite-height collisions',()=>{
  it('drives through the tunnel without a hidden roof wall or lost ground contact',()=>{
    const k=kart();let crossed=false;
    for(let i=0;i<180;i++){moveKart(k,{...NEUTRAL,throttle:1});expect(k.x).toBe(0);expect(k.y).toBe(0);expect(k.vy).toBe(0);if(k.z>TUNNEL.z+TUNNEL.depth/2)crossed=true;}
    expect(crossed).toBe(true);
    const a={x:0,y:.8,z:-53},b={x:0,y:.8,z:-32};expect(clearShot(a,b)).toBe(true);expect(wallHit(a,b,.1)).toBeNull();
  });
  it('blocks roof and cliff shots with the correct vertical bounds and bounce normal',()=>{
    const a={x:0,y:2,z:TUNNEL.z},b={x:0,y:8,z:TUNNEL.z};
    expect(clearShot(a,b)).toBe(false);expect(wallHit(a,b,.1)).toBeCloseTo((4-.1-2)/6);
    const contact=wallContact(a,b,.1)!;expect(contact.normal).toEqual({x:0,y:-1,z:0});
    expect(clearShot({x:-12,y:.8,z:-43},{x:0,y:.8,z:-43})).toBe(false);
  });
  it('clamps ceiling jumps vertically without an artificial lateral launch',()=>{
    const k={...kart(0,-43),y:3.5,vy:6,vx:8,vz:12};resolveCeilings(k);
    expect(k.y).toBe(TUNNEL.clearance-CONFIG.kartHeight);expect(k.vy).toBe(0);expect(k.vx).toBe(8);expect(k.vz).toBe(12);
    moveKart(k,NEUTRAL);expect(k.y+CONFIG.kartHeight).toBeLessThan(TUNNEL.clearance);expect(Math.hypot(k.vx,k.vz)).toBeLessThan(15);
  });
  it('drives over the bridge deck and both approaches with bounded, predictable landings',()=>{
    const k=kart(BRIDGE.x,-BRIDGE.depth/2-7);let onDeck=false,landed=false;
    for(let i=0;i<180;i++){
      moveKart(k,{...NEUTRAL,throttle:1});
      expect(Number.isFinite(k.y)).toBe(true);expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x,k.z));expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity);
      if(Math.abs(k.z)<3){onDeck=true;expect(k.y).toBeCloseTo(3);}
      if(k.z>BRIDGE.depth/2&&k.y===0)landed=true;
    }
    expect(onDeck).toBe(true);expect(landed).toBe(true);
  });
  it('keeps bridge rails and solid palm trunks collision-aligned at their actual heights',()=>{
    const k=kart(BRIDGE.x-BRIDGE.width/2+.05,0);resolveWalls(k);expect(k.x).toBeGreaterThanOrEqual(37+CONFIG.kartRadius-1e-6);expect(k.y).toBe(3);
    for(const palm of PALMS){const trunk=WALLS.find(w=>w.style==='tree'&&w.x===palm.x&&w.z===palm.z)!;expect(trunk.width).toBe(.45);const state=kart(palm.x,palm.z);resolveWalls(state);expect(Math.hypot(state.x-palm.x,state.z-palm.z)).toBeGreaterThan(CONFIG.kartRadius);}
  });
  it('clips the camera against the tunnel roof and bridge heightfield',()=>{
    const clipped=clipCameraRay({x:0,y:1.2,z:-43},{x:0,y:7,z:-46});expect(clipped.y).toBeLessThan(3.7);expect(clipped.y).toBeGreaterThan(3);
    const rampClip=clipCameraRay({x:41,y:1.2,z:-13},{x:41,y:2,z:0});expect(rampClip.z).toBeLessThan(-5);
  });
});
describe('bounded original island rendering and independent suspension',()=>{
  it('renders curved shortcut road surfaces with upward-facing triangles',()=>{
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})});
    try{
      const arena=buildArena();let roadVertices=0;
      arena.traverse(o=>{if(o instanceof THREE.Mesh){const positions=o.geometry.getAttribute('position'),normals=o.geometry.getAttribute('normal');if(o.material instanceof THREE.MeshStandardMaterial&&o.material.map)for(let i=0;i<positions.count;i+=3)if([0,1,2].every(j=>Math.abs(positions.getY(i+j)-.022)<1e-7)){for(const j of [0,1,2]){expect(normals.getY(i+j)).toBeCloseTo(1);roadVertices++;}}o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){(m as THREE.MeshStandardMaterial).map?.dispose();m.dispose();}}});
      expect(roadVertices).toBe(288);
    }finally{vi.unstubAllGlobals();}
  });
  it('faces the aerodynamic body surfaces outward so the car shell is visible',()=>{
    const geometry=kartShell([[-1,.6,.2],[1,.6,.2]]),normal=geometry.getAttribute('normal');
    expect(normal.getX(0)).toBeGreaterThan(0);expect(normal.getZ(60)).toBeLessThan(0);expect(normal.getZ(90)).toBeGreaterThan(0);geometry.dispose();
  });
  it('uses instancing, a bounded environmental pool and quality adaptation',()=>{
    const env=new TropicalEnvironment();let instances=0,objects=0;env.group.traverse(o=>{objects++;if(o instanceof THREE.InstancedMesh)instances++;});
    expect(instances).toBe(8);expect(objects).toBeLessThan(30);
    expect(env.group.getObjectByName('ocean')).toBeDefined();expect(env.group.getObjectByName('waterfall')).toBeDefined();expect(env.group.getObjectByName('river-ford')).toBeDefined();
    env.update(30,new THREE.Vector3(50,5,-12),true);
    const pools=env.group.children.filter(o=>o instanceof THREE.InstancedMesh&&!o.frustumCulled);expect(pools).toHaveLength(2);expect(pools.every(p=>!p.visible)).toBe(true);
    env.update(30,new THREE.Vector3(50,5,-12),false);expect(pools.every(p=>p.visible)).toBe(true);
    env.group.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if(o instanceof THREE.InstancedMesh)o.dispose();}});
  });
  it('compresses and settles on landing without mutating the physics state',()=>{
    const state=newSuspension(),air={...kart(-8,0),y:1,vy:-6,vz:15},before={...air};
    animateSuspension(state,air,DT);expect(air).toEqual(before);
    const landed={...air,y:0,vy:0};expect(animateSuspension(state,landed,DT).landing).toBe(6);expect(state.offset).toBeLessThan(0);
    for(let i=0;i<300;i++)animateSuspension(state,landed,DT);
    expect(Math.abs(state.offset)).toBeLessThan(.001);expect(Number.isFinite(state.roll)).toBe(true);expect(landed.y).toBe(0);
  });
  it('limits cornering roll and braking pitch even after a long frame',()=>{
    const state=newSuspension();for(let i=0;i<1000;i++)animateSuspension(state,{...kart(-8,0),vx:i%2?6:-6,vz:i%2?21:0,yawRate:2.3},.5);
    expect(Math.abs(state.roll)).toBeLessThanOrEqual(.095);expect(Math.abs(state.pitch)).toBeLessThanOrEqual(.07);expect(Math.abs(state.offset)).toBeLessThanOrEqual(.12);
  });
});
