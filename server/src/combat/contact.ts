import { clearShot } from '../../../shared/src/aim.js';
import { distance, segmentSphere } from '../../../shared/src/math.js';
import { CONFIG, DT } from '../../../shared/src/config.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import { orbitPosition } from '../../../shared/src/orbit.js';
import type { PlayerState, Vec3 } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { damage } from './damage.js';

interface Contacts { time: number; match: number; next: Map<string,number>; previous: Map<string,Vec3> }
const contacts = new WeakMap<CombatWorld,Contacts>();

/** Swept orbiting spheres, per-target cooldowns, and a bounded server impulse. */
export function stepContactAttacks(world: CombatWorld): void {
  let state=contacts.get(world);
  if(!state || world.time<state.time || state.match!==(world.matchId??0)) {
    state={time:world.time,match:world.matchId??0,next:new Map(),previous:new Map()};contacts.set(world,state);
  }
  const dt=Math.max(0,Math.min(DT,world.time-state.time));state.time=world.time;
  for(const [key,until] of state.next)if(until<=world.time)state.next.delete(key);
  const hits: {target:PlayerState;attacker:PlayerState;weapon:'orbit'|'shield'}[]=[];
  for(const attacker of world.players.values()) {
    if(attacker.health<=0)continue;
    const weapon=(attacker.orbitUntil??0)>world.time?'orbit':attacker.shieldUntil>world.time?'shield':null;
    if(!weapon)continue;
    const origin={x:attacker.x,y:attacker.y+.65,z:attacker.z},definition=WEAPONS[weapon];
    for(const target of world.players.values()) {
      if(target.id===attacker.id || target.health<=0 || target.invulnerableUntil>world.time)continue;
      const center={x:target.x,y:target.y+.65,z:target.z};
      if(distance(origin,center)>definition.contactRange! || !clearShot(origin,center,0))continue;
      const protectedTarget=target.shieldUntil>world.time;
      const pair=`${weapon}:${attacker.id}:${target.id}:${protectedTarget?'shield':'hit'}`;
      if((state.next.get(pair)??0)>world.time+1e-9)continue;
      if(weapon==='orbit') {
        const orbit=definition.orbit!;
        const old=state.previous.get(attacker.id),otherOld=state.previous.get(target.id);
        const previous=dt>0 && old && distance(old,attacker)<2 ? old : attacker;
        const otherPrevious=dt>0 && otherOld && distance(otherOld,target)<2 ? otherOld : target;
        let contact=false;
        for(let i=0;i<orbit.count;i++) {
          const now=orbitPosition(attacker,world.time,i),before=orbitPosition(previous,world.time-dt,i);
          // Relative sweep accounts for both karts' movement, as well as orbital rotation.
          const relativeBefore={x:before.x+(target.x-otherPrevious.x),y:before.y+(target.y-otherPrevious.y),z:before.z+(target.z-otherPrevious.z)};
          if(segmentSphere(relativeBefore,now,center,CONFIG.kartRadius+orbit.ballRadius)!==null && clearShot(origin,now,orbit.ballRadius) && clearShot(now,center,0)){contact=true;break;}
        }
        if(!contact)continue;
      }
      state.next.set(pair,world.time+(protectedTarget ? .15 : weapon==='orbit'?definition.orbit!.hitCooldown:0));
      hits.push({target,attacker,weapon});
    }
  }
  // Capture attacks before damage, so simultaneous lethal contacts remain symmetric.
  for(const {target,attacker,weapon} of hits) {
    const health=target.health;
    damage(world,target,WEAPONS[weapon].damage,attacker.id,weapon,attacker.name);
    if(weapon==='orbit' && target.health>0 && target.health<health) {
      const dx=target.x-attacker.x,dz=target.z-attacker.z,d=Math.hypot(dx,dz)||1,impulse=WEAPONS.orbit.orbit!.knockback;
      target.vx+=dx/d*impulse;target.vz+=dz/d*impulse;
      const speed=Math.hypot(target.vx,target.vz),limit=CONFIG.maxSpeed*CONFIG.boostMultiplier;
      if(speed>limit){target.vx*=limit/speed;target.vz*=limit/speed;}
    }
  }
  state.previous.clear();for(const p of world.players.values())state.previous.set(p.id,{x:p.x,y:p.y,z:p.z});
}
