import { describe, expect, it } from 'vitest';
import { ARENA_SIZE, arenaClamp, CROSSINGS, groundHeight, insideLava, LAVA, PICKUP_POSITIONS, PLATFORMS, SPAWNS, toLocal, WALLS } from '../shared/src/arena.js';
import { CONFIG, DT } from '../shared/src/config.js';
import { moveKart, NEUTRAL, resolveWalls } from '../shared/src/movement.js';
import { clearShot } from '../shared/src/aim.js';
import { Simulation } from '../server/src/simulation/simulation.js';
import { ENVIRONMENT_ID, stepLavaHazard } from '../server/src/simulation/hazards.js';
import { damage } from '../server/src/combat/damage.js';
import { advance, duel, equip } from './helpers.js';

describe('proportional symmetrical island definition', () => {
  it('mirrors inner barriers, crossings, platforms and pickups across both axes', () => {
    for (const set of [WALLS.filter(w=>w.style==='barrier'), CROSSINGS, PLATFORMS, PICKUP_POSITIONS]) for (const p of set) {
      expect(set.some(q=>q.x===-p.x&&q.z===p.z)).toBe(true);
      expect(set.some(q=>q.x===p.x&&q.z===-p.z)).toBe(true);
    }
    expect(LAVA.x).toBe(0);expect(LAVA.z).toBe(0);expect(LAVA.width).toBe(LAVA.depth);
    expect(LAVA.width/ARENA_SIZE).toBeGreaterThan(.12);expect(LAVA.width/ARENA_SIZE).toBeLessThan(.18);
    expect(CROSSINGS).toHaveLength(8);expect(WALLS.filter(w=>w.style==='barrier')).toHaveLength(12);
  });
  it('keeps eight spawns and every pickup off lava and outside actual collision volumes', () => {
    expect(SPAWNS).toHaveLength(8);
    for(const point of [...SPAWNS,...PICKUP_POSITIONS]) {
      expect(insideLava(point.x,point.z)).toBe(false);
      const k={...point,y:groundHeight(point.x,point.z),yaw:0,vx:0,vy:0,vz:0};resolveWalls(k);expect(k.x).toBe(point.x);expect(k.z).toBe(point.z);
      for(const w of WALLS){const p=toLocal(point.x,point.z,w);expect(Math.abs(p.x)>w.width/2+CONFIG.kartRadius||Math.abs(p.z)>w.depth/2+CONFIG.kartRadius).toBe(true);}
    }
  });
  it('does not leave obsolete tunnel, forest or central-block occlusion', () => {
    expect(clearShot({x:0,y:1,z:-12},{x:0,y:1,z:12},.1)).toBe(true);
    expect(groundHeight(0,-43)).toBe(1.2); // new north deck, never an old tunnel
    expect(WALLS.every(w=>['barrier','rail','boundary','tunnel'].includes(w.style!))).toBe(true);
  });
  it('contains boosted airborne karts at rounded corners', () => {
    const k={x:54,y:4,z:54,yaw:Math.PI/4,vx:25,vy:0,vz:25};
    for(let i=0;i<180;i++){moveKart(k,{...NEUTRAL,throttle:1},true);expect(arenaClamp(k.x,k.z,1+CONFIG.kartRadius)).toEqual({x:k.x,z:k.z});expect(k.y).toBeGreaterThanOrEqual(groundHeight(k.x,k.z));}
  });
  it('never launches a kart when it crosses the 12 cm lava curb at full boost', () => {
    const k={x:-12,y:0,z:8.6,yaw:Math.PI/2,vx:CONFIG.maxSpeed*CONFIG.boostMultiplier,vy:0,vz:0};
    for(let i=0;i<50;i++){moveKart(k,{...NEUTRAL,throttle:1},true);expect(k.vy).toBe(0);expect(k.y).toBeLessThanOrEqual(LAVA.curbHeight);}
  });
  it.each(SPAWNS)('offers a safe initial pickup route from $x,$z', spawn => {
    const k={...spawn,y:0,vx:0,vy:0,vz:0};let touched=false;
    for(let i=0;i<300;i++){
      moveKart(k,{...NEUTRAL,throttle:1});expect(insideLava(k.x,k.z)).toBe(false);
      touched ||= PICKUP_POSITIONS.some(p=>Math.hypot(k.x-p.x,k.z-p.z)<1.6&&Math.abs(k.y-p.y)<1.8);
    }
    expect(touched).toBe(true);
  });
});
describe('authoritative lava hazard and preserved match lifecycle', () => {
  it('falls into a real pit and emits one environmental death without awarding any score', () => {
    const {world,a,b}=duel();Object.assign(a,{x:0,z:0,y:0,invulnerableUntil:20,shieldUntil:20});
    advance(world,.4);expect(a.health).toBe(0);expect(a.deaths).toBe(1);expect(a.score).toBe(0);expect(b.score).toBe(0);expect(a.y).toBeLessThan(0);
    const event=world.events.find(e=>e.kind==='elimination')!;expect(event.player).toBe(ENVIRONMENT_ID);expect(event.target).toBe(a.id);
    stepLavaHazard(world);expect(a.deaths).toBe(1);expect(world.events.filter(e=>e.kind==='elimination')).toHaveLength(1);
    const respawnAt=a.respawnAt;while(world.time+DT<respawnAt-1e-9)world.step();expect(a.health).toBe(0);
    world.step();expect(a.health).toBe(100);expect(insideLava(a.x,a.z)).toBe(false);expect(a.y).toBe(groundHeight(a.x,a.z));
  });
  it('does not kill a kart jumping above the lava or standing at its rim', () => {
    const {world,a}=duel();Object.assign(a,{x:0,z:0,y:1,vy:4});advance(world,.2);expect(a.health).toBe(100);
    Object.assign(a,{x:8.6,z:0,y:LAVA.curbHeight,vy:0});advance(world,1);expect(a.health).toBe(100);expect(a.y).toBe(LAVA.curbHeight);
  });
  it('retains weapon self-immunity independently of environmental elimination', () => {
    const {world,a}=duel();equip(a,'rocket');damage(world,a,999,a.id);expect(a.health).toBe(100);
    Object.assign(a,{x:0,z:0,y:LAVA.bottom});stepLavaHazard(world);expect(a.health).toBe(0);
  });
  it('starts a new match with safe spawns and all pickup locations reset', () => {
    const {world,a}=duel(),box=world.pickups[0]!;Object.assign(a,{x:box.x,y:box.y,z:box.z});world.step();expect(world.pickups[0]!.active).toBe(false);
    world.start();expect(world.pickups.every(p=>p.active&&p.availableAt===0)).toBe(true);expect(a.health).toBe(100);expect(a.deaths).toBe(0);expect(insideLava(a.x,a.z)).toBe(false);
  });
  it('completes a three-minute eight-player simulation with valid floor contacts and synchronized pickup states', () => {
    const world=new Simulation(180,()=>.5);for(let i=0;i<8;i++)world.addPlayer(String(i),`Racer ${i}`);world.start();
    for(let tick=1;tick<=180*CONFIG.tickRate;tick++){
      for(const p of world.players.values())world.enqueue(p.id,[{...NEUTRAL,seq:tick,throttle:1,steer:Math.sin(tick/80+Number(p.id))*.7,drift:tick%180<30,fire:tick%120===1}]);
      world.step();for(const p of world.players.values())expect(p.y).toBeGreaterThanOrEqual(groundHeight(p.x,p.z)-1e-8);
    }
    expect(world.phase).toBe('finished');expect(world.time).toBe(180);expect(world.players.size).toBe(8);
    const state=world.snapshot('CHECK','0',8);expect(state.pickups).toHaveLength(PICKUP_POSITIONS.length);expect(state.remaining).toBe(0);
  });
});
