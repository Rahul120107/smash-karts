import type {PlayerState,WeaponId} from '../../../../shared/src/types.js';
import type {CombatWorld} from '../../simulation/world.js';
import {spawnProjectiles} from '../spawn.js';
/** Released charge determines velocity; the sequence retains charge while heading follows the kart. */
export function lobberAttack(world:CombatWorld,p:PlayerState,weapon:WeaponId){return spawnProjectiles(world,p,weapon);}
