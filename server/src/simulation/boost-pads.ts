import { BOOST_PADS, toLocal } from '../../../shared/src/arena.js';
import type { CombatWorld } from './world.js';
interface PadState {match:number;inside:Set<string>;cooldowns:Map<string,number>}
const states=new WeakMap<CombatWorld,PadState>();
/** Entry-triggered, server-owned boosts share existing steering, VFX and prediction. */
export function stepBoostPads(world:CombatWorld){
  let state=states.get(world);if(!state||state.match!==(world.matchId??0)){state={match:world.matchId??0,inside:new Set(),cooldowns:new Map()};states.set(world,state);}
  const inside=new Set<string>();
  for(const p of world.players.values())if(p.health>0)for(const pad of BOOST_PADS){const at=toLocal(p.x,p.z,pad),key=`${p.id}:${pad.id}`;if(Math.abs(at.x)>pad.width/2||Math.abs(at.z)>pad.depth/2||Math.abs(p.y-pad.y)>.4)continue;inside.add(key);if(state.inside.has(key)||(state.cooldowns.get(key)??0)>world.time||p.boostUntil>world.time)continue;p.boostUntil=world.time+pad.duration;state.cooldowns.set(key,world.time+pad.cooldown);world.emit({kind:'boost',player:p.id,x:p.x,y:p.y+.7,z:p.z});}
  state.inside=inside;
  for(const [key,until] of state.cooldowns)if(until<=world.time)state.cooldowns.delete(key);
}
