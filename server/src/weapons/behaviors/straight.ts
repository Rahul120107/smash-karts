import type {PlayerState,WeaponId} from '../../../../shared/src/types.js';
import type {CombatWorld} from '../../simulation/world.js';
import {spawnProjectiles} from '../spawn.js';
/** Grouped bullets, rockets, the slow Nuke, and the retained scatter extension never track. */
export function straightAttack(world:CombatWorld,p:PlayerState,weapon:WeaponId){p.aimTarget=null;return spawnProjectiles(world,p,weapon);}
