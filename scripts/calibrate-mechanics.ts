import {writeFile} from 'node:fs/promises';
import {Simulation} from '../server/src/simulation/simulation.js';
import {GameplayRecorder} from '../server/src/simulation/diagnostics.js';
import {WEAPONS,WEAPON_IDS} from '../shared/src/weapons.js';
import {CONFIG,DT} from '../shared/src/config.js';
import {NEUTRAL} from '../shared/src/movement.js';
import {Prediction} from '../client/src/networking/prediction.js';
import type {WeaponId} from '../shared/src/types.js';

// Trusted offline fixtures only; nothing adds a public weapon, teleport or debug protocol.
function fixture(){const recorder=new GameplayRecorder(8192),world=new Simulation(180,()=>.5,recorder),a=world.addPlayer('a','Calibration'),b=world.addPlayer('b','Moving target');world.start();world.pickups=[];Object.assign(a,{x:-23,z:0,y:0,invulnerableUntil:0});Object.assign(b,{x:30,z:45,y:0,invulnerableUntil:0});return {world,a,b,recorder};}
function attack(weapon:WeaponId){
  const {world,a,recorder}=fixture();a.weapon=weapon;a.ammo=WEAPONS[weapon].ammo;
  for(let tick=0;tick<480;tick++){
    const held=WEAPONS[weapon].activation==='release'&&tick<60;
    if(weapon==='mine'&&tick>0&&tick%50===0)a.z-=2;
    world.enqueue(a.id,[{...NEUTRAL,seq:tick+1,firePress:1,fireHeld:held}]);world.step();
  }
  const records=recorder.export(),fires=records.filter(s=>s.kind==='event'&&s.data.kind==='fire'),projectiles=records.filter(s=>s.kind==='projectile');
  return {weapon,configuredAmmo:WEAPONS[weapon].ammo,rounds:fires.length,projectiles:projectiles.length,firstFire:fires[0]?.time,lastFire:fires.at(-1)?.time,intervals:fires.slice(1).map((s,i)=>Number((s.time-fires[i]!.time).toFixed(6))),remainingAmmo:a.ammo,launchSamples:projectiles.slice(0,4).map(s=>s.data),events:records.filter(s=>s.kind==='event'&&['weaponExpired','hit','elimination','explosion'].includes(String(s.data.kind))).map(s=>({time:s.time,...s.data}))};
}
const handling=fixture(),corrections:unknown[]=[],prediction=new Prediction(s=>corrections.push(s));prediction.reconcile(handling.world.snapshot('CAL',handling.a.id,8),handling.a.id);
Object.assign(handling.a,{x:60,z:-40});prediction.reconcile(handling.world.snapshot('CAL',handling.a.id,8),handling.a.id);
for(let tick=0;tick<180;tick++){const command={...NEUTRAL,seq:tick+1,throttle:tick<90?1:-1,steer:tick>120?.25:0};prediction.step(command,handling.a,handling.world.time+DT);handling.world.enqueue(handling.a.id,[command]);handling.world.step();if(tick%3===0)prediction.reconcile(handling.world.snapshot('CAL',handling.a.id,8),handling.a.id);}
const report={generatedAt:new Date().toISOString(),classification:'Crossfire measurements only; no external frame recording comparison',tickRate:CONFIG.tickRate,weapons:WEAPON_IDS.map(attack),vehicleSamples:handling.recorder.export().filter(s=>s.kind==='vehicle'),corrections};
const scenarios:{name:string;samples:ReturnType<GameplayRecorder['export']>}[]=[];
for(const name of ['wall-impact','ramp-traversal','moving-target'] as const){
  const {world,a,b,recorder}=fixture();
  if(name==='wall-impact')Object.assign(a,{x:62,z:0,yaw:Math.PI/2,vx:18});
  if(name==='ramp-traversal')Object.assign(a,{x:-14,z:-43,yaw:Math.PI/2,vx:21});
  if(name==='moving-target'){Object.assign(b,{x:-21.5,z:8,yaw:0});a.weapon='machineGun';a.ammo=WEAPONS.machineGun.ammo;}
  for(let tick=0;tick<120;tick++){world.enqueue(a.id,[{...NEUTRAL,seq:tick+1,throttle:name==='moving-target'?0:1,firePress:name==='moving-target'?1:0}]);if(name==='moving-target')world.enqueue(b.id,[{...NEUTRAL,seq:tick+1,throttle:.15}]);world.step();}
  scenarios.push({name,samples:recorder.export()});
}
Object.assign(report,{scenarios});
await writeFile('docs/mechanics-calibration.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({weapons:report.weapons.map(({weapon,rounds,projectiles,remainingAmmo,firstFire,lastFire})=>({weapon,rounds,projectiles,remainingAmmo,firstFire,lastFire})),vehicleSamples:report.vehicleSamples.length,corrections:corrections.length},null,2));
