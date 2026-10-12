import type {PlayerState,WeaponId} from '../../../../shared/src/types.js';
import type {CombatWorld} from '../../simulation/world.js';
import {spawnProjectiles} from '../spawn.js';
/** Rear mounts use the driver's current deck height, preserving bridge deployment. */
export function trapAttack(world:CombatWorld,p:PlayerState,weapon:WeaponId){return spawnProjectiles(world,p,weapon,{rear:true});}
