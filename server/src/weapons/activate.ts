import { WEAPONS } from '../../../shared/src/weapons.js';
import type { PlayerState, Vec3, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import {machineGunAttack,homingAttack} from './behaviors/tracking.js';
import {straightAttack} from './behaviors/straight.js';
import {lobberAttack} from './behaviors/lobbers.js';
import {trapAttack} from './behaviors/traps.js';
import {starAttack,boostAttack,orbitAttack} from './behaviors/power-ups.js';
type Handler=(world:CombatWorld,player:PlayerState,weapon:WeaponId)=>Vec3|void|false;
const handlers:Record<WeaponId,Handler>={machineGun:machineGunAttack,rocket:straightAttack,homing:homingAttack,mine:trapAttack,bomb:lobberAttack,shield:starAttack,boost:boostAttack,scatter:straightAttack,cannon:lobberAttack,bullets:straightAttack,blastMissile:straightAttack,orbit:orbitAttack,fakeLootBox:trapAttack};
export function activate(world:CombatWorld,player:PlayerState):boolean{
  const weapon=player.weapon;if(!weapon||player.health<=0||player.ammo<(WEAPONS[weapon].projectilesPerUse??1)||world.time+1e-9<player.nextFire)return false;
  player.nextFire=world.time+WEAPONS[weapon].cooldown;
  const result=handlers[weapon](world,player,weapon);if(result===false)return false;
  player.ammo-=WEAPONS[weapon].projectilesPerUse??1;player.weaponPhase='FIRING';
  const muzzle=result??{x:player.x,y:player.y+.85,z:player.z};
  world.emit({kind:'fire',player:player.id,weapon,...muzzle,yaw:player.yaw});
  if(player.ammo<=0)player.weapon=null;
  return true;
}