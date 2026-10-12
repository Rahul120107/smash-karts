import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAVA, PLATFORMS, RAMPS, toWorld, toLocal, WALLS, groundHeight } from '../shared/src/arena.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { clearShot } from '../shared/src/aim.js';
import { moveKart, NEUTRAL, resolveWalls } from '../shared/src/movement.js';
import { wallContact, wallHit } from '../server/src/collisions/projectile.js';
import { clipCameraRay } from '../client/src/game/camera.js';
import { animateSuspension, newSuspension } from '../client/src/vehicles/animation.js';
import { IslandBackdrop, WATERFALL_SITES } from '../client/src/maps/island-backdrop.js';
import { kartShell } from '../client/src/vehicles/kart.js';
import { buildArena, floorOutline } from '../client/src/maps/arena.js';
const kart=(x=-12,z=0)=>({x,y:groundHeight(x,z),z,yaw:0,vx:0,vy:0,vz:0,yawRate:0});

describe('reference-shaped island routes and rendering',()=>{
  it.each(RAMPS)('does not misclassify boosted ascent through the tapered mouth at $x,$z as a side impact',r=>{
    const start=toWorld(0,-r.depth/2-.01,r),yaw=r.yaw??0;
    const k={...kart(start.x,start.z),yaw,vx:Math.sin(yaw)*CONFIG.maxSpeed*CONFIG.boostMultiplier,vz:Math.cos(yaw)*CONFIG.maxSpeed*CONFIG.boostMultiplier};let peak=0;
    for(let i=0;i<90;i++){moveKart(k,{...NEUTRAL,throttle:1},true);peak=Math.max(peak,k.y);expect(toLocal(k.x,k.z,r).x).toBeCloseTo(0,7);expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity);}
    expect(peak).toBeGreaterThanOrEqual(r.height);
  });
  it.each(PLATFORMS)('drives both approaches of the platform at $x,$z',r=>{
    const start=toWorld(0,-r.depth/2-2,r),k={...kart(start.x,start.z),yaw:r.yaw??0};let onDeck=false,landed=false;
    for(let i=0;i<220;i++){
      moveKart(k,{...NEUTRAL,throttle:1});expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x,k.z)-1e-8);expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity);
      onDeck ||= k.y>=r.height;landed ||= onDeck&&k.y===0;
    }
    expect(onDeck).toBe(true);expect(landed).toBe(true);
  });
  it('blocks rays and kart contacts using the rotated boundary rather than its AABB',()=>{
    const w=WALLS.find(w=>w.yaw)!;const a={...toWorld(-2,0,w),y:.8},b={...toWorld(2,0,w),y:.8};
    expect(clearShot(a,b)).toBe(false);expect(wallHit(a,b,.1)).not.toBeNull();
    const contact=wallContact(a,b,.1)!;expect(contact.normal.x).toBeCloseTo(-Math.cos(w.yaw!));expect(contact.normal.z).toBeCloseTo(Math.sin(w.yaw!));
    const state={...kart(w.x,w.z),y:0};resolveWalls(state);expect(Math.hypot(state.x-w.x,state.z-w.z)).toBeGreaterThan(CONFIG.kartRadius);
  });
  it('clips the camera against a visible low barrier and elevated ramp',()=>{
    const clipped=clipCameraRay({x:15,y:.8,z:19},{x:15,y:1,z:25});expect(clipped.z).toBeLessThan(21.1);
    const r=RAMPS[0]!,rampClip=clipCameraRay({x:r.x,y:.6,z:-25},{x:r.x,y:.6,z:0});expect(rampClip.z).toBeLessThan(-13);
  });
  it('has a real floor opening, traversable curb and no obsolete stone block',()=>{
    expect(floorOutline().holes).toHaveLength(1);expect(groundHeight(0,0)).toBe(LAVA.bottom);expect(groundHeight(8.6,0)).toBe(LAVA.curbHeight);
    expect(WALLS.some(w=>w.x===0&&w.z===0)).toBe(false);
    const arena=buildArena();let meshes=0;arena.traverse(o=>{if(o instanceof THREE.Mesh){meshes++;o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});expect(meshes).toBeLessThan(25);
  });
  it('keeps the scenic horizon batched, outside combat routes and present in compatibility mode',()=>{
    const env=new IslandBackdrop();expect(env.group.getObjectByName('ocean')).toBeDefined();expect(env.group.getObjectByName('distant-islands')).toBeInstanceOf(THREE.InstancedMesh);
    const falls=env.group.getObjectByName('distant-waterfalls')!;expect(falls.children).toHaveLength(1);
    const clouds=env.group.getObjectByName('drifting-clouds') as THREE.InstancedMesh;expect(clouds.count).toBe(96);
    const initial=clouds.instanceMatrix.array.slice();env.update(20,new THREE.Vector3(),false);expect(clouds.instanceMatrix.array).not.toEqual(initial);
    expect((env.group.getObjectByName('waterfall-mist') as THREE.Points).geometry.getAttribute('position').count).toBe(256);
    for (const site of WATERFALL_SITES) {expect(Math.hypot(site.x,site.z)-site.radius*1.4).toBeGreaterThan(112);expect(site.height).toBeGreaterThanOrEqual(66);}
    // No far-away shadow casters; no unbounded emitters or extra collidable scenery.
    let draws=0;env.group.traverse(o=>{expect(o.castShadow).toBe(false);if(o instanceof THREE.Mesh||o instanceof THREE.Points)draws++;});expect(draws).toBeLessThanOrEqual(13);
    const lava=env.group.getObjectByName('lava') as THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;expect(lava.position.y).toBe(LAVA.surface);
    env.update(30,new THREE.Vector3(),true);expect(lava.material.uniforms.time!.value).toBe(30);
    expect(falls.visible).toBe(true);expect(clouds.visible).toBe(true);expect(env.group.getObjectByName('waterfall-mist')!.visible).toBe(false);
    env.group.traverse(o=>{if(o instanceof THREE.Mesh||o instanceof THREE.Points){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();if(o instanceof THREE.InstancedMesh)o.dispose();}});
  });
});
describe('preserved sporty karts and independent suspension',()=>{
  it('faces the aerodynamic body surfaces outward so the car shell is visible',()=>{
    const geometry=kartShell([[-1,.6,.2],[1,.6,.2]]),normal=geometry.getAttribute('normal');
    expect(normal.getX(0)).toBeGreaterThan(0);expect(normal.getZ(60)).toBeLessThan(0);expect(normal.getZ(90)).toBeGreaterThan(0);geometry.dispose();
  });
  it('compresses and settles on landing without mutating the physics state',()=>{
    const state=newSuspension(),air={...kart(-12,0),y:1,vy:-6,vz:15},before={...air};
    animateSuspension(state,air,DT);expect(air).toEqual(before);
    const landed={...air,y:0,vy:0};expect(animateSuspension(state,landed,DT).landing).toBe(6);expect(state.offset).toBeLessThan(0);
    for(let i=0;i<300;i++)animateSuspension(state,landed,DT);
    expect(Math.abs(state.offset)).toBeLessThan(.001);expect(Number.isFinite(state.roll)).toBe(true);expect(landed.y).toBe(0);
  });
  it('limits cornering roll and braking pitch even after a long frame',()=>{
    const state=newSuspension();for(let i=0;i<1000;i++)animateSuspension(state,{...kart(-12,0),vx:i%2?6:-6,vz:i%2?21:0,yawRate:2.3},.5);
    expect(Math.abs(state.roll)).toBeLessThanOrEqual(.095);expect(Math.abs(state.pitch)).toBeLessThanOrEqual(.07);expect(Math.abs(state.offset)).toBeLessThanOrEqual(.12);
  });
});
