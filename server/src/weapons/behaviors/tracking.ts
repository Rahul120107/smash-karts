import { clearShot, weaponAim } from '../../../../shared/src/aim.js';
import type {PlayerState} from '../../../../shared/src/types.js';
import {WEAPONS} from '../../../../shared/src/weapons.js';
import type {CombatWorld} from '../../simulation/world.js';
import {spawnProjectiles} from '../spawn.js';
export function machineGunAttack(world:CombatWorld,p:PlayerState){return spawnProjectiles(world,p,'machineGun',{assisted:weaponAim(p,world.players.values(),world.time,'machineGun')});}
export function homingAttack(world:CombatWorld,p:PlayerState){
  let target:string|null=null,best=36;
  for(const k of world.players.values()){
    const dx=k.x-p.x,dz=k.z-p.z,d=Math.hypot(dx,dz);
    if(k.id===p.id||k.health<=0||k.invulnerableUntil>world.time||d>=best||(dx*Math.sin(p.yaw)+dz*Math.cos(p.yaw))/Math.max(d,.1)<-.15)continue;
    if(!clearShot({x:p.x,y:p.y+.85,z:p.z},{x:k.x,y:k.y+.65,z:k.z},WEAPONS.homing.radius))continue;
    best=d;target=k.id;
  }
  return spawnProjectiles(world,p,'homing',{target});
}
