import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG, DT } from '../shared/src/config.js';
import { launchDirection, weaponMuzzle } from '../shared/src/weapon-physics.js';
import { WEAPONS } from '../shared/src/weapons.js';
import { NEUTRAL } from '../shared/src/movement.js';
import { createWeaponMount } from '../client/src/weapons/mounts.js';
import { activate } from '../server/src/weapons/activate.js';
import { stepProjectiles } from '../server/src/weapons/projectiles.js';
import { duel, equip } from './helpers.js';
import { damage, eliminate, explode } from '../server/src/combat/damage.js';
import { stepContactAttacks } from '../server/src/combat/contact.js';
import { orbitPosition } from '../shared/src/orbit.js';
import { eliminationNotice, sanitizeName } from '../shared/src/elimination.js';

describe('authoritative mounts and visible attachments', () => {
  it.each([0, Math.PI/2, Math.PI, -Math.PI/2, .73, -2.18])('matches the Three.js muzzle at yaw %s, including airborne motion', yaw => {
    for (const weapon of ['machineGun','bullets','rocket','homing','cannon','blastMissile','scatter','bomb','mine'] as const) {
      const { world, a, b } = duel(); b.x=30; world.random=()=>.5;
      Object.assign(a,{ yaw, y: 4, vx: 12, vz: -7, vy: 3 }); equip(a,weapon);
      const pitch = WEAPONS[weapon].elevation ?? (weapon==='bomb' ? Math.atan2(9,13) : 0);
      const direction=launchDirection(yaw,pitch), expected=weaponMuzzle(a,weapon,direction);
      const root = new THREE.Group(), attachment=createWeaponMount(weapon);
      root.position.set(a.x,a.y,a.z); root.rotation.y=yaw; root.add(attachment.group); attachment.group.rotation.order='YXZ'; attachment.group.rotation.x=-pitch; root.updateMatrixWorld(true);
      const tip=attachment.muzzle.getWorldPosition(new THREE.Vector3());
      expect(tip.x).toBeCloseTo(expected.x,9); expect(tip.y).toBeCloseTo(expected.y,9); expect(tip.z).toBeCloseTo(expected.z,9);
      activate(world,a); const projectile=[...world.projectiles.values()][0]!;
      expect(projectile.x).toBeCloseTo(tip.x,9); expect(projectile.z).toBeCloseTo(tip.z,9);
      const front=(tip.x-a.x)*Math.sin(yaw)+(tip.z-a.z)*Math.cos(yaw);
      if(weapon==='mine') expect(front).toBeLessThan(-1.5); else {expect(front).toBeGreaterThan(1.4); expect(projectile.y).toBeCloseTo(tip.y,9);}
      if(weapon!=='mine') {
        const inherited=WEAPONS[weapon].inheritedVelocity??0;
        expect((projectile.vx-a.vx*inherited)*Math.sin(yaw)+(projectile.vz-a.vz*inherited)*Math.cos(yaw)).toBeGreaterThan(0);
      }
    }
  });
  it.each([1,-1])('launches ahead while driving/reversing and steering with drift (%s)', throttle => {
    const {world,a,b}=duel(); b.x=30; equip(a,'cannon'); a.yaw=.47; a.vx=8;a.vz=14;
    world.enqueue(a.id,[{...NEUTRAL,seq:1,throttle,steer:1,drift:true,firePress:1}]); world.step();
    const fire=world.events.find(e=>e.kind==='fire')!, tip=weaponMuzzle(a,'cannon',launchDirection(a.yaw,WEAPONS.cannon.elevation));
    expect(fire.x).toBeCloseTo(tip.x,8);expect(fire.z).toBeCloseTo(tip.z,8);
  });
  it('a boosted kart cannot overtake its own cannonball immediately after launch',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'cannon');a.vz=CONFIG.maxSpeed*CONFIG.boostMultiplier; activate(world,a);
    const shot=[...world.projectiles.values()][0]!; const first=shot.z;
    expect(shot.vz-a.vz).toBeCloseTo(WEAPONS.cannon.speed,9);
    world.time+=DT;stepProjectiles(world); expect(shot.z-a.vz*DT).toBeGreaterThan(first);
  });
});

describe('complete sequences and release input',()=>{
  it('scatter pellets share one physical muzzle while their velocity directions diverge',()=>{
    const {world,a}=duel();equip(a,'scatter');activate(world,a);const shots=[...world.projectiles.values()];
    expect(shots).toHaveLength(5);expect(new Set(shots.map(p=>`${p.x},${p.y},${p.z}`)).size).toBe(1);expect(new Set(shots.map(p=>p.vx)).size).toBe(5);
  });
  it('an obstructed muzzle emits sparks at its actual wall impact and cannot shoot through it',()=>{
    const {world,a,b}=duel();Object.assign(a,{x:15,z:20});Object.assign(b,{x:15,z:25});equip(a,'machineGun');activate(world,a);stepProjectiles(world);
    expect(world.projectiles.size).toBe(0);expect(b.health).toBe(100);expect(world.events.find(e=>e.kind==='impact')).toMatchObject({weapon:'machineGun',player:a.id});
  });
  it.each(['rocket','homing','bullets','cannon','machineGun'] as const)('%s spends the complete pickup once, after key release',weapon=>{
    const {world,a,b}=duel();b.x=30;equip(a,weapon);const events=new Map<number,number>();
    world.enqueue(a.id,[{...NEUTRAL,seq:1,firePress:1,fireHeld:false}]);
    for(let tick=0;tick<240;tick++){world.step();for(const e of world.events)if(e.kind==='fire')events.set(e.id,e.at);}
    expect(events.size).toBe(WEAPONS[weapon].ammo);expect(a.ammo).toBe(0);expect(a.attacking).toBe(false);
    const times=[...events.values()];for(let i=1;i<times.length;i++)expect(times[i]!-times[i-1]!).toBeGreaterThanOrEqual(WEAPONS[weapon].cooldown-1e-9);
  });
  it('mine sequence waits for movement, never overlaps mines and cancels safely on timeout',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'mine');world.attacks.begin(world,a);
    for(let i=0;i<90;i++){world.time+=DT;world.attacks.step(world,a);}expect(a.ammo).toBe(2);
    for(let i=0;i<2;i++){a.z+=2;world.time+=.7;world.attacks.step(world,a);}
    expect(a.ammo).toBe(0);const mines=[...world.projectiles.values()];expect(mines.length).toBe(3);
    for(let i=0;i<mines.length;i++)for(let j=i+1;j<mines.length;j++)expect(Math.hypot(mines[i]!.x-mines[j]!.x,mines[i]!.z-mines[j]!.z)).toBeGreaterThanOrEqual(WEAPONS.mine.mineSpacing!);
    equip(a,'mine');a.z+=3;world.attacks.begin(world,a);world.time+=9;world.attacks.step(world,a);expect(a.attacking).toBe(false);expect(a.ammo).toBe(2);
  });
  it('bomb aims during a held input, fires on release, and cancels a stale charge',()=>{
    const {world,a,b}=duel();b.x=30;equip(a,'bomb');world.enqueue(a.id,[{...NEUTRAL,seq:1,firePress:1,fireHeld:true}]);world.step();
    expect(a.charging).toBe(true);expect(world.projectiles.size).toBe(0);
    world.enqueue(a.id,[{...NEUTRAL,seq:2,firePress:1,fireHeld:false}]);world.step();expect(a.charging).toBe(false);expect(a.ammo).toBe(0);expect(world.projectiles.size).toBe(1);
    equip(a,'bomb');world.enqueue(a.id,[{...NEUTRAL,seq:3,firePress:2,fireHeld:true}]);world.step();
    for(let i=0;i<100;i++)world.step();expect(a.charging).toBe(false);expect(a.ammo).toBe(1);
  });
});

describe('orbit contact, impulse and expiration',()=>{
  it('visible sphere contacts damage once per cooldown, apply knockback, exclude the owner, and expire',()=>{
    const {world,a,b}=duel();equip(a,'orbit');activate(world,a);
    const place=()=>{const point=orbitPosition(a,world.time,0);Object.assign(b,{x:point.x,y:point.y-.65,z:point.z});};place();
    stepContactAttacks(world);expect(b.health).toBe(62);expect(a.health).toBe(100);expect(Math.hypot(b.vx,b.vz)).toBeCloseTo(6);
    for(let i=0;i<25;i++){world.time+=DT;place();stepContactAttacks(world);}expect(b.health).toBe(62);
    world.time=.6;place();stepContactAttacks(world);expect(b.health).toBe(24);
    world.time=a.orbitUntil!;place();stepContactAttacks(world);expect(b.health).toBe(24);expect(a.score).toBe(0);
  });
  it('accounts for enemy movement and orbit rotation between ticks',()=>{
    const {world,a,b}=duel();equip(a,'orbit');activate(world,a);
    Object.assign(b,{x:a.x+1.5,z:a.z+2.3});stepContactAttacks(world);expect(b.health).toBe(100);
    world.time+=DT;Object.assign(b,{x:a.x+1,z:a.z+2.3});stepContactAttacks(world);expect(b.health).toBe(62);
  });
});

describe('server elimination attribution',()=>{
  it('direct bullet collision attributes the original shooter and weapon',()=>{
    const {world,a,b}=duel();b.health=1;world.random=()=>.5;equip(a,'machineGun');activate(world,a);a.name='Changed';a.weapon=null;
    for(let i=0;i<12;i++){world.time+=DT;stepProjectiles(world);}
    expect(world.events.find(e=>e.kind==='elimination')).toMatchObject({killerName:'Alpha',victimName:'Bravo',weapon:'machineGun',weaponName:'Machine gun'});
  });
  it('homing changes direction no faster than its configured angular rate',()=>{
    const {world,a,b}=duel();b.z=18;b.x=-4;equip(a,'homing');activate(world,a);const missile=[...world.projectiles.values()][0]!;
    const velocity={x:missile.vx,y:missile.vy,z:missile.vz},speed=Math.hypot(velocity.x,velocity.y,velocity.z);world.time+=DT;stepProjectiles(world);
    const nextSpeed=Math.hypot(missile.vx,missile.vy,missile.vz),cos=(velocity.x*missile.vx+velocity.y*missile.vy+velocity.z*missile.vz)/speed/nextSpeed;
    expect(nextSpeed).toBeCloseTo(speed,8);expect(Math.acos(Math.min(1,cos))).toBeLessThanOrEqual(WEAPONS.homing.turnRate*DT+1e-8);
  });
  it('a steep homing launch preserves speed when its target is exactly behind its velocity',()=>{
    const {world,a,b}=duel();equip(a,'homing');activate(world,a);const missile=[...world.projectiles.values()][0]!;
    Object.assign(b,{x:-4,y:10.35,z:0,vx:0,vy:0,vz:0});
    Object.assign(missile,{x:0,y:20,z:0,vx:10,vy:22.5,vz:0,target:b.id});
    const speed=Math.hypot(missile.vx,missile.vy,missile.vz);world.time+=DT;stepProjectiles(world);
    const nextSpeed=Math.hypot(missile.vx,missile.vy,missile.vz),cos=(10*missile.vx+22.5*missile.vy)/speed/nextSpeed;
    expect(world.projectiles.has(missile.id)).toBe(true);expect(nextSpeed).toBeCloseTo(speed,8);
    expect(Math.acos(Math.min(1,cos))).toBeLessThanOrEqual(WEAPONS.homing.turnRate*DT+1e-8);
  });
  it.each(['cannon','rocket','homing','mine','bomb','blastMissile'] as const)('%s retains its original owner and weapon after pickup consumption',weapon=>{
    const {world,a,b}=duel();a.name='Rahul';b.name='Shashank';equip(a,weapon);activate(world,a);
    const p=[...world.projectiles.values()][0]!;a.weapon='boost';a.name='Changed';b.health=1;Object.assign(p,{x:b.x,y:b.y+.65,z:b.z});explode(world,p);explode(world,p);
    const kills=world.events.filter(e=>e.kind==='elimination');expect(kills).toHaveLength(1);expect(a.score).toBe(1);expect(b.deaths).toBe(1);
    expect(kills[0]).toMatchObject({killerId:a.id,killerName:'Rahul',victimId:b.id,victimName:'Shashank',weapon,matchId:world.matchId});expect(kills[0]!.matchEventId).toMatch(/^1:\d+$/);
    expect(eliminationNotice(kills[0]!,a.id)?.message).toBe(`You smashed Shashank using ${kills[0]!.weaponName}!`);
    expect(eliminationNotice(kills[0]!,b.id)?.message).toBe(`You were smashed by Rahul using ${kills[0]!.weaponName}!`);
  });
  it('nonlethal and owner hits award no elimination, duplicates cannot award credit twice',()=>{
    const {world,a,b}=duel();damage(world,b,12,a.id,'machineGun');damage(world,a,100,a.id,'rocket');expect(world.events.filter(e=>e.kind==='elimination')).toHaveLength(0);
    damage(world,b,100,a.id,'bullets');damage(world,b,100,a.id,'cannon');eliminate(world,b,a.id,'rocket');expect(a.score).toBe(1);expect(b.deaths).toBe(1);
    expect(world.events.find(e=>e.kind==='elimination')?.weapon).toBe('bullets');
  });
  it('orbit kills identify Orbit Ram, and environmental deaths give no false player credit',()=>{
    const {world,a,b}=duel();equip(a,'orbit');activate(world,a);b.z=2.3;b.health=38;stepContactAttacks(world);
    expect(world.events.find(e=>e.kind==='elimination')).toMatchObject({killerId:a.id,victimId:b.id,weapon:'orbit',weaponName:WEAPONS.orbit.label});
    eliminate(world,a,'environment');expect(b.score).toBe(0);expect(eliminationNotice(world.events.at(-1)!,a.id)?.message).toBe('You fell into the lava!');
    expect(sanitizeName('<Rahul>\u202e\u0000')).toBe('Rahul');
  });
});
