import {describe,it,expect,vi,afterEach} from 'vitest';
import * as THREE from 'three';
import {WEAPONS,WEAPON_IDS} from '../shared/src/weapons.js';
import {CONFIG,DT} from '../shared/src/config.js';
import {NEUTRAL,moveKart} from '../shared/src/movement.js';
import {speedMultiplier} from '../shared/src/power-ups.js';
import {launchProfile,weaponMuzzle,launchDirection} from '../shared/src/weapon-physics.js';
import {groundHeight} from '../shared/src/arena.js';
import {Simulation} from '../server/src/simulation/simulation.js';
import {GameplayRecorder} from '../server/src/simulation/diagnostics.js';
import {activate} from '../server/src/weapons/activate.js';
import {stepProjectiles} from '../server/src/weapons/projectiles.js';
import {damage} from '../server/src/combat/damage.js';
import {expirePowerUps} from '../server/src/weapons/behaviors/power-ups.js';
import {Prediction} from '../client/src/networking/prediction.js';
import {createOrbitVisual,updateOrbitVisual} from '../client/src/weapons/orbit-visual.js';
import {createProjectile} from '../client/src/weapons/visuals.js';
import {advance,duel,equip} from './helpers.js';

afterEach(()=>vi.unstubAllGlobals());
describe('historical reference calibration, not measured live-game parity',()=>{
  it.each(['standing','forward','reverse','left','right','drift','airborne','ramp'] as const)('all thirteen categories accept a deliberate activation while %s',state=>{
    for(const weapon of WEAPON_IDS){
      const {world,a,b}=duel();b.x=30;b.z=45;world.pickups=[];equip(a,weapon);
      const steer=state==='left'?1:state==='right'||state==='drift'?-1:0,throttle=state==='standing'?0:state==='reverse'?-1:1;
      if(state!=='standing'){a.vz=state==='reverse'?-5:12;}
      if(state==='airborne'){a.y=3;a.vy=2;}
      if(state==='ramp')Object.assign(a,{x:-10,z:-43,y:groundHeight(-10,-43),yaw:Math.PI/2,vx:12,vz:0});
      world.enqueue(a.id,[{...NEUTRAL,seq:1,throttle,steer,drift:state==='drift',firePress:1,fireHeld:false}]);world.step();
      const launch=world.events.find(e=>e.kind==='fire'&&e.weapon===weapon)!;
      expect(launch,`${weapon}/${state}`).toBeDefined();expect(a.ammo).toBe(WEAPONS[weapon].ammo-(WEAPONS[weapon].projectilesPerUse??1));expect(a.health).toBe(100);
      for(const p of world.projectiles.values()){expect([p.x,p.y,p.z,p.vx,p.vy,p.vz].every(Number.isFinite)).toBe(true);expect(p.owner).toBe(a.id);expect(p.weapon).toBe(weapon);}
      if(WEAPONS[weapon].kind){const profile=launchProfile(weapon,a.chargeRatio),tip=weaponMuzzle(a,weapon,launchDirection(a.yaw,profile.elevation));expect(launch.x).toBeCloseTo(tip.x,7);expect(launch.z).toBeCloseTo(tip.z,7);}
    }
  });
  it('fires exactly 166 MG rounds over 6.5 seconds without accumulating tick rounding',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'machineGun');const fires=new Map<number,{id:number;at:number}>();
    world.enqueue(a.id,[{...NEUTRAL,seq:1,firePress:1,fireHeld:false}]);
    for(let i=0;i<440;i++){world.step();for(const e of world.events)if(e.kind==='fire')fires.set(e.id,e);}
    expect(fires.size).toBe(166);
    expect([...fires.values()].at(-1)!.at-[...fires.values()][0]!.at).toBeCloseTo(6.5,8);
    expect(a.ammo).toBe(0);expect(a.attacking).toBe(false);
  });
  it('spends 27 straight bullets in nine three-projectile rounds, with no target lock',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'bullets');const rounds:number[]=[];
    world.attacks.begin(world,a);rounds.push(world.projectiles.size);
    for(let i=1;i<180;i++){world.time+=DT;const before=world.projectiles.size;world.attacks.step(world,a);if(world.projectiles.size>before)rounds.push(world.projectiles.size-before);}
    expect(rounds).toEqual(Array(9).fill(3));expect(a.ammo).toBe(0);
    for(const p of world.projectiles.values()){expect(p.target).toBeNull();expect(p.vy).toBe(0);}
    expect(a.aimTarget).toBeNull();
  });
  it('rejects an incomplete standard-bullet group without creating projectiles',()=>{
    const {world,a}=duel();equip(a,'bullets');a.ammo=2;
    expect(activate(world,a)).toBe(false);expect(a.ammo).toBe(2);expect(world.projectiles.size).toBe(0);
  });
  it('turns while releasing a charged four-cannonball salvo and preserves its charge',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'cannon');world.attacks.begin(world,a);
    world.time=.9;world.attacks.step(world,a);expect(a.charging).toBe(true);expect(a.chargeRatio).toBeCloseTo(.75);
    expect(world.projectiles.size).toBe(0);world.attacks.release(world,a);
    const speed=launchProfile('cannon',.75).speed,shots=[...world.projectiles.values()];
    for(let i=1;i<4;i++){a.yaw=i*Math.PI/2;world.time=i*.8+.9;world.attacks.step(world,a);shots.push([...world.projectiles.values()].at(-1)!);}
    expect(shots).toHaveLength(4);expect(a.ammo).toBe(0);
    for(let i=0;i<4;i++){expect(Math.hypot(shots[i]!.vx,shots[i]!.vz)).toBeCloseTo(speed,7);expect(shots[i]!.vy).toBeCloseTo(launchProfile('cannon',.75).vertical,7);}
    expect(shots[1]!.vx).toBeGreaterThan(0);expect(shots[2]!.vz).toBeLessThan(0);
  });
  it.each(['cannon','bomb'] as const)('%s charge increases the actual ballistic range and uses the shared muzzle',weapon=>{
    const ranges:number[]=[];
    for(const charge of [0,1]){
      const {world,a,b}=duel();b.x=30;Object.assign(a,{x:-23,z:0});equip(a,weapon);a.chargeRatio=charge;activate(world,a);
      const p=[...world.projectiles.values()][0]!,profile=launchProfile(weapon,charge),muzzle=weaponMuzzle(a,weapon,launchDirection(a.yaw,profile.elevation));
      expect(p.x).toBeCloseTo(muzzle.x,8);expect(p.y).toBeCloseTo(muzzle.y,8);expect(p.z).toBeCloseTo(muzzle.z,8);
      const time=(p.vy+Math.sqrt(p.vy*p.vy+2*CONFIG.gravity*p.y))/CONFIG.gravity;
      ranges.push(p.vz*time);
      world.time+=DT;stepProjectiles(world);expect(p.y).toBeCloseTo(muzzle.y+profile.vertical*DT-.5*CONFIG.gravity*DT*DT,8);
    }
    expect(ranges[1]).toBeGreaterThan(ranges[0]!*1.5);
  });
});

describe('distinct explosive behavior and delayed ownership',()=>{
  it('grenuke survives ordinary ground landing and detonates exactly at its fuse',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'bomb');activate(world,a);const p=[...world.projectiles.values()][0]!;
    Object.assign(p,{x:60,z:0,y:p.radius+.01,vx:0,vz:0,vy:-2});world.time=.1;stepProjectiles(world);
    expect(world.projectiles.has(p.id)).toBe(true);expect(world.events.some(e=>e.kind==='explosion')).toBe(false);
    world.time=p.expires;stepProjectiles(world);expect(world.projectiles.has(p.id)).toBe(false);expect(world.events.filter(e=>e.kind==='explosion')).toHaveLength(1);
    stepProjectiles(world);expect(world.events.filter(e=>e.kind==='explosion')).toHaveLength(1);expect(a.health).toBe(100);
  });
  it('grenuke detonates on swept direct impact before arming, with original weapon attribution',()=>{
    const {world,a,b}=duel();equip(a,'bomb');activate(world,a);const p=[...world.projectiles.values()][0]!;
    Object.assign(p,{x:60,z:0,y:.65,vx:0,vz:1000,vy:0});world.time=DT;stepProjectiles(world);
    expect(b.health).toBe(0);expect(a.health).toBe(100);expect(world.events.find(e=>e.kind==='elimination')).toMatchObject({killerId:a.id,victimId:b.id,weapon:'bomb'});
  });
  it('an armed grounded grenuke triggers on nearby enemies without requiring direct overlap',()=>{
    const {world,a,b}=duel();equip(a,'bomb');activate(world,a);const p=[...world.projectiles.values()][0]!;
    Object.assign(p,{x:b.x+1.8,z:b.z,y:p.radius,vx:0,vz:0,vy:0});world.time=p.armedAt+.01;stepProjectiles(world);
    expect(world.projectiles.size).toBe(0);expect(b.health).toBeLessThan(100);expect(b.health).toBeGreaterThan(0);
  });
  it.each(['mine','fakeLootBox'] as const)('%s arms behind a bridge kart, never hurts its owner, and retains departed attribution',weapon=>{
    const {world,a,b}=duel();Object.assign(a,{x:0,z:-7,y:1.2,yaw:Math.PI/2});Object.assign(b,{x:30,z:45});equip(a,weapon);activate(world,a);
    const p=[...world.projectiles.values()][0]!;expect(p.x).toBeLessThan(a.x);expect(p.y-p.radius).toBeCloseTo(groundHeight(p.x,p.z,a.y)+.03,8);
    Object.assign(b,{x:p.x,z:p.z,y:1.2});world.time=.5;stepProjectiles(world);expect(b.health).toBe(100);
    world.removePlayer(a.id);world.time=p.armedAt+.01;stepProjectiles(world);
    expect(b.health).toBe(0);expect(world.events.find(e=>e.kind==='elimination')).toMatchObject({killerId:'a',killerName:'Alpha',victimId:'b',weapon});
    stepProjectiles(world);expect(b.deaths).toBe(1);
  });
});

describe('power-up physics and original instanced models',()=>{
  it('mace has five stable collision centers in exactly two instanced visual draws',()=>{
    const group=createOrbitVisual();expect(group.children).toHaveLength(2);
    for(const t of [0,.8,5.9]){updateOrbitVisual(group,t);for(const child of group.children){const mesh=child as THREE.InstancedMesh;expect(mesh.count).toBe(5);for(let i=0;i<5;i++){const m=new THREE.Matrix4();mesh.getMatrixAt(i,m);const center=new THREE.Vector3().setFromMatrixPosition(m);expect(Math.hypot(center.x,center.z)).toBeCloseTo(WEAPONS.orbit.orbit!.radius,6);expect(center.y).toBe(0);}}}
  });
  it('mace mitigates ordinary damage, while Star contact ignores that mitigation',()=>{
    const {world,a,b}=duel();equip(b,'orbit');activate(world,b);damage(world,b,10,a.id,'rocket');expect(b.health).toBe(91);
    damage(world,b,100,a.id,'shield');expect(b.health).toBe(0);
  });
  it('Star and mace use bounded non-stacking speed effects and authoritative expirations',()=>{
    const {world,a}=duel();equip(a,'shield');activate(world,a);equip(a,'orbit');activate(world,a);
    expect(speedMultiplier(a,world.time)).toBe(1.45);a.boostUntil=2;expect(speedMultiplier(a,world.time)).toBe(CONFIG.boostMultiplier);
    world.time=5;expirePowerUps(world,a);expect(a.shieldUntil).toBe(0);expect(speedMultiplier(a,world.time)).toBe(1.25);
    world.time=6;expirePowerUps(world,a);expect(speedMultiplier(a,world.time)).toBe(1);
    expirePowerUps(world,a);expect(world.events.filter(e=>e.kind==='weaponExpired'&&e.weapon==='shield')).toHaveLength(1);expect(world.events.filter(e=>e.kind==='weaponExpired'&&e.weapon==='orbit')).toHaveLength(1);
  });
  it.each(['shield','orbit'] as const)('%s movement prediction agrees with server movement while steering',weapon=>{
    const {world,a,b}=duel();b.x=30;Object.assign(a,{x:60,z:-20,yaw:0});equip(a,weapon);activate(world,a);const prediction=new Prediction();prediction.reconcile(world.snapshot('TEST',a.id,8),a.id);
    for(let seq=1;seq<=70;seq++){const input={...NEUTRAL,seq,throttle:1,steer:.05};prediction.step(input,a,world.time+DT);world.enqueue(a.id,[input]);world.step();expect(prediction.kart!.x).toBeCloseTo(a.x,7);expect(prediction.kart!.z).toBeCloseTo(a.z,7);}
  });
  it('all ten projectile categories have original bounded renderable geometry',()=>{
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(){}})})});
    for(const kind of new Set(WEAPON_IDS.map(w=>WEAPONS[w].kind).filter(Boolean))){const model=createProjectile(kind!);expect(model.children.length).toBeGreaterThan(0);expect(model.children.length).toBeLessThanOrEqual(8);model.traverse(o=>{if(o instanceof THREE.Mesh)expect(o.geometry.attributes.position!.count).toBeLessThan(4000);});}
  });
});

describe('developer-only reproducible mechanics instrumentation',()=>{
  it('bounded recorder preserves chronological order without entering public snapshots',()=>{
    const recorder=new GameplayRecorder(3);for(let i=0;i<7;i++)recorder.record(i,'sample',{i});expect(recorder.export().map(s=>s.time)).toEqual([4,5,6]);expect(()=>new GameplayRecorder(0)).toThrow();
    const world=new Simulation(180,()=>.5,recorder),a=world.addPlayer('a','Alpha'),b=world.addPlayer('b','Bravo');world.start();Object.assign(a,{x:60,z:0,invulnerableUntil:0});Object.assign(b,{x:60,z:8,invulnerableUntil:0});damage(world,b,7,a.id,'bullets');
    expect(recorder.export().find(s=>s.kind==='damage')?.data).toMatchObject({amount:7,healthBefore:100,healthAfter:93});
    expect(JSON.stringify(world.snapshot('TEST',a.id,8))).not.toMatch(/diagnostics|healthBefore|steeringInput/);
    expect(new Simulation().diagnostics).toBeUndefined();
  });
});
