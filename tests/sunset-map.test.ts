import {describe,it,expect} from 'vitest';
import {ROADS,BRIDGES,TUNNEL,TREES,BOOST_PADS,LAKE,groundHeight,earthHeight,terrainHeight,validateRoadGraph,toWorld} from '../shared/src/arena.js';
import {triangleHeight} from '../shared/src/roads.js';
import {moveKart,NEUTRAL,resolveCeilings} from '../shared/src/movement.js';
import {CONFIG,DT} from '../shared/src/config.js';
import {clearShot} from '../shared/src/aim.js';
import {wallHit,terrainHit} from '../server/src/collisions/projectile.js';
import {roadGeometry,terrainGeometry} from '../client/src/maps/arena.js';
import {stepBoostPads} from '../server/src/simulation/boost-pads.js';
import {duel,advance} from './helpers.js';
import type {KartState} from '../shared/src/types.js';
const clamp=(n:number)=>Math.max(-1,Math.min(1,n));
function follow(k:KartState,points:typeof ROADS[number]['samples']){
  let index=0,maxError=0;
  for(let tick=0;tick<2400;tick++){
    let closest=index,best=Infinity;
    for(let j=Math.max(0,index-2);j<Math.min(points.length,index+9);j++){const p=points[j]!,d=Math.hypot(k.x-p.x,k.z-p.z);if(d<best){best=d;closest=j;}}
    index=Math.max(index,closest);maxError=Math.max(maxError,best);
    const end=points.at(-1)!;if(index>=points.length-3&&Math.hypot(k.x-end.x,k.z-end.z)<1.3)return{arrived:true,maxError};
    let target=index;while(target<points.length-1&&Math.hypot(k.x-points[target]!.x,k.z-points[target]!.z)<5)target++;
    const p=points[target]!,heading=Math.atan2(p.x-k.x,p.z-k.z),error=Math.atan2(Math.sin(heading-k.yaw),Math.cos(heading-k.yaw)),speed=Math.hypot(k.vx,k.vz);
    moveKart(k,{...NEUTRAL,throttle:speed<10? .4:0,steer:clamp(error*2.5)});
    expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x,k.z,k.y)-1e-7);expect(k.vy).toBeLessThanOrEqual(CONFIG.maxJumpVelocity);
  }
  return{arrived:false,maxError};
}
describe('driveable sunset road graph',()=>{
  it('connects every edge with consistent width and continuous elevation',()=>{expect(validateRoadGraph()).toEqual([]);for(const road of ROADS)for(let i=1;i<road.samples.length;i++){const a=road.samples[i-1]!,b=road.samples[i]!;expect(b.width).toBeGreaterThanOrEqual(10);expect(b.width).toBeLessThanOrEqual(14);expect(Math.abs(b.y-a.y)/Math.hypot(b.x-a.x,b.z-a.z)).toBeLessThan(.17);}});
  it.each(ROADS.flatMap(road=>[false,true].map(reverse=>({road,reverse}))))('drives $road.id in reverse=$reverse without teleportation',({road,reverse})=>{
    const points=reverse?[...road.samples].reverse():road.samples,a=points[0]!,b=points[1]!,k={x:a.x,z:a.z,y:a.y,yaw:Math.atan2(b.x-a.x,b.z-a.z),vx:0,vy:0,vz:0};
    const result=follow(k,points);expect(result.arrived,JSON.stringify({road:road.id,reverse,k,result})).toBe(true);expect(result.maxError).toBeLessThan(3.5);
  });
  it('drives the entire six-turn coastal loop without resetting the kart between junctions',()=>{
    const first=ROADS[0]!,a=first.samples[0]!,b=first.samples[1]!,k={x:a.x,z:a.z,y:a.y,yaw:Math.atan2(b.x-a.x,b.z-a.z),vx:0,vy:0,vz:0};
    for(const road of ROADS.slice(0,6)){const result=follow(k,road.samples);expect(result.arrived,road.id).toBe(true);expect(result.maxError).toBeLessThan(3.5);}
    expect(Math.hypot(k.x-a.x,k.z-a.z)).toBeLessThan(1.3);
  });
  it('renders exactly the shared road triangles with upward-facing surfaces',()=>{
    const geometry=roadGeometry(),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');let index=0;
    for(const road of ROADS)for(const t of road.triangles)for(const v of [t.a,t.b,t.c]){expect(positions.getX(index)).toBeCloseTo(v.x,4);expect(positions.getY(index)).toBeCloseTo(v.y,5);expect(positions.getZ(index)).toBeCloseTo(v.z,4);expect(normals.getY(index++)).toBeGreaterThan(.9);}geometry.dispose();
  });
  it('matches terrain mesh interpolation along the lake shore and coastal hills',()=>{
    const geometry=terrainGeometry(),p=geometry.getAttribute('position'),indices=geometry.index!;
    for(const point of [{x:17,z:12},{x:-9,z:0},{x:-57,z:-35},{x:13,z:57}]){
      let height:number|null=null;for(let i=0;i<indices.count;i+=3){const vertex=(j:number)=>{const id=indices.getX(i+j);return{x:p.getX(id),y:p.getY(id),z:p.getZ(id)};};height=triangleHeight({a:vertex(0),b:vertex(1),c:vertex(2),bridge:false},point.x,point.z);if(height!==null)break;}
      expect(height).not.toBeNull();expect(height).toBeCloseTo(earthHeight(point.x,point.z),6);
    }geometry.dispose();
  });
});
describe('bridge, tunnel and weapon collision integration',()=>{
  it.each(BRIDGES)('supports both directions across $id without bounce or falling',bridge=>{
    for(const dir of [-1,1]){const x=bridge.x-dir*(bridge.width/2+3),k={x,z:bridge.z,y:groundHeight(x,bridge.z),yaw:dir*Math.PI/2,vx:dir*12,vy:0,vz:0};
      for(let i=0;i<400&&dir*(k.x-bridge.x)<bridge.width/2+3;i++){moveKart(k,{...NEUTRAL,throttle:.4});expect(k.vy).toBe(0);expect(k.y).toBeCloseTo(groundHeight(k.x,k.z,k.y),7);}
      expect(dir*(k.x-bridge.x)).toBeGreaterThan(bridge.width/2);
    }
  });
  it('keeps the lake exposed below bridge decks and stops swept shots at their actual slab',()=>{
    expect(terrainHeight(4,-7)).toBe(LAKE.bottom);expect(groundHeight(4,-7)).toBeCloseTo(1.2);expect(groundHeight(4,-7,-1)).toBe(LAKE.bottom);
    expect(clearShot({x:-5,y:.3,z:-7},{x:5,y:.3,z:-7},.05)).toBe(true);
    expect(wallHit({x:4,y:2,z:-7},{x:4,y:.3,z:-7},.1)).not.toBeNull();expect(terrainHit({x:4,y:.3,z:-7},{x:4,y:-2,z:-7},.1)).not.toBeNull();
  });
  it('drives through the tunnel at kart clearance and constrains jumps below its roof',()=>{
    const start=toWorld(0,-TUNNEL.depth/2-2,TUNNEL),k={...start,y:0,yaw:TUNNEL.yaw,vx:0,vy:0,vz:0};
    for(let i=0;i<90;i++){moveKart(k,{...NEUTRAL,throttle:1});expect(k.y).toBe(0);expect(k.vy).toBe(0);}expect(k.z).toBeGreaterThan(TUNNEL.z+TUNNEL.depth/2);
    Object.assign(k,{x:TUNNEL.x,z:TUNNEL.z,y:3,vy:4});resolveCeilings(k);expect(k.y).toBeCloseTo(TUNNEL.clearance-CONFIG.kartHeight);expect(k.vy).toBe(0);
  });
  it('places every collidable tree on the authoritative ground',()=>{for(const t of TREES.filter(t=>t.solid))expect(earthHeight(t.x,t.z)).toBeGreaterThanOrEqual(0);});
});
describe('authoritative boost pad and pickup lifecycle',()=>{
  it.each(BOOST_PADS)('activates pad $id only on entry, expires, and cannot stack',pad=>{
    const {world,a}=duel();Object.assign(a,{x:pad.x,y:pad.y,z:pad.z});stepBoostPads(world);expect(a.boostUntil).toBeCloseTo(pad.duration);expect(world.events.filter(e=>e.kind==='boost')).toHaveLength(1);
    world.time=2;stepBoostPads(world);expect(a.boostUntil).toBe(pad.duration);a.x+=10;stepBoostPads(world);a.x=pad.x;stepBoostPads(world);expect(a.boostUntil).toBe(pad.duration);
    a.x+=10;world.time=pad.cooldown+.1;stepBoostPads(world);a.x=pad.x;stepBoostPads(world);expect(a.boostUntil).toBeCloseTo(world.time+pad.duration);
    a.x+=10;stepBoostPads(world);a.x=pad.x;a.boostUntil=world.time+5;world.time+=pad.cooldown;stepBoostPads(world);expect(a.boostUntil).toBeGreaterThan(world.time+pad.duration);
  });
  it('does not activate pads for dead or airborne players, and resets pad state on a new match',()=>{
    const {world,a}=duel(),pad=BOOST_PADS[0]!;Object.assign(a,{x:pad.x,y:pad.y,z:pad.z,health:0});stepBoostPads(world);expect(a.boostUntil).toBe(0);a.health=100;a.y+=2;stepBoostPads(world);expect(a.boostUntil).toBe(0);a.y=pad.y;stepBoostPads(world);expect(a.boostUntil).toBeGreaterThan(0);
    world.start();Object.assign(a,{x:pad.x,y:pad.y,z:pad.z});stepBoostPads(world);expect(a.boostUntil).toBeCloseTo(pad.duration);
  });
  it('awards a reachable road pickup once and respawns it after ten seconds',()=>{
    const {world,a,b}=duel(),box=world.pickups.find(p=>Math.abs(p.y-1.2)<.001)!;world.pickups=[box];Object.assign(a,{x:box.x,y:box.y,z:box.z});b.x=60;b.z=-20;
    world.step();expect(box.active).toBe(false);expect(a.weapon).not.toBeNull();Object.assign(a,{x:60,y:0,z:0});advance(world,9.9);expect(box.active).toBe(false);advance(world,.15);expect(box.active).toBe(true);
  });
});
