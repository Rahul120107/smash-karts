import type {PlayerState} from '../../../../shared/src/types.js';
import {WEAPONS} from '../../../../shared/src/weapons.js';
import type {CombatWorld} from '../../simulation/world.js';
export function starAttack(world:CombatWorld,p:PlayerState){p.shieldUntil=world.time+WEAPONS.shield.duration;world.emit({kind:'shield',player:p.id,weapon:'shield',x:p.x,y:p.y+.7,z:p.z});}
export function boostAttack(world:CombatWorld,p:PlayerState){p.boostUntil=world.time+WEAPONS.boost.duration;world.emit({kind:'boost',player:p.id,weapon:'boost',x:p.x,y:p.y+.7,z:p.z});}
export function orbitAttack(world:CombatWorld,p:PlayerState){p.orbitUntil=world.time+WEAPONS.orbit.duration;}
export function expirePowerUps(world:CombatWorld,p:PlayerState){
  for(const [key,weapon] of [['shieldUntil','shield'],['boostUntil','boost'],['orbitUntil','orbit']] as const){
    const until=p[key]??0;if(until<=0||until>world.time)continue;
    p[key]=0;world.emit({kind:'weaponExpired',player:p.id,weapon,x:p.x,y:p.y+.7,z:p.z});
    if(!p.weapon&&!p.attacking)p.weaponPhase='EXPIRED';
  }
}
