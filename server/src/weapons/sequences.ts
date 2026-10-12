import type { PlayerState, Vec3, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { activate } from './activate.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
interface Sequence {weapon:WeaponId;expires:number;nextAt:number;lastMine?:Vec3}
/** Activation edges and released charges create server-owned, absolute-deadline sequences. */
export class AttackSequences {
  private active=new Map<string,Sequence>();
  private charging=new Map<string,{weapon:WeaponId;start:number}>();
  private pending=new Map<string,{weapon:WeaponId;until:number}>();
  private spent=new Map<string,WeaponId>();
  begin(world:CombatWorld,p:PlayerState):boolean{
    if(this.active.has(p.id)||this.charging.has(p.id))return false;
    const weapon=p.weapon;if(!weapon||p.health<=0||p.ammo<=0)return false;
    const w=WEAPONS[weapon];
    if(w.activation==='release'){
      if(p.nextFire>world.time)return false;
      this.charging.set(p.id,{weapon,start:world.time});p.charging=true;p.chargeStartedAt=world.time;p.chargeRatio=0;p.weaponPhase=weapon==='cannon'?'CHARGING':'AIMING';return true;
    }
    if(p.nextFire>world.time+1e-9){if(p.nextFire-world.time<=.12)this.pending.set(p.id,{weapon,until:world.time+.12});return false;}
    p.chargeRatio=0;return this.start(world,p,weapon);
  }
  private start(world:CombatWorld,p:PlayerState,weapon:WeaponId):boolean{
    this.pending.delete(p.id);const w=WEAPONS[weapon];
    const fired=activate(world,p);if(!fired&&weapon!=='mine')return false;
    if(fired)this.spent.set(p.id,weapon);
    const automatic=w.activation==='burst'||weapon==='cannon';
    if(automatic&&p.weapon===weapon&&p.ammo>0){
      this.active.set(p.id,{weapon,nextAt:p.nextFire,expires:world.time+(w.sequenceTimeout??w.ammo/(w.projectilesPerUse??1)*w.cooldown+1),...(weapon==='mine'&&fired?{lastMine:{x:p.x,y:p.y,z:p.z}}:{})});
    }
    p.attacking=this.active.has(p.id);p.weaponPhase=p.attacking||w.duration>0?'FIRING':p.weapon?'EQUIPPED':'COOLDOWN';return fired||weapon==='mine';
  }
  release(world:CombatWorld,p:PlayerState):void{
    const charge=this.charging.get(p.id);if(!charge)return;
    this.charging.delete(p.id);p.charging=false;
    if(p.health<=0||p.weapon!==charge.weapon){this.cancel(p);return;}
    p.chargeRatio=Math.max(0,Math.min(1,(world.time-charge.start)/(WEAPONS[charge.weapon].charge?.maxSeconds??1)));
    this.start(world,p,charge.weapon);
  }
  step(world:CombatWorld,p:PlayerState):void{
    const charge=this.charging.get(p.id);
    if(charge){if(p.health<=0||p.weapon!==charge.weapon){this.cancel(p);return;}p.chargeRatio=Math.min(1,(world.time-charge.start)/(WEAPONS[charge.weapon].charge?.maxSeconds??1));}
    const queued=this.pending.get(p.id);
    if(queued){if(p.health<=0||p.weapon!==queued.weapon||world.time>queued.until+1e-9)this.pending.delete(p.id);else if(world.time+1e-9>=p.nextFire)this.begin(world,p);}
    const sequence=this.active.get(p.id);
    if(!sequence){
      if(p.weapon&&!p.charging)p.weaponPhase=world.time<p.nextFire?'COOLDOWN':'EQUIPPED';
      else if(p.weaponPhase==='COOLDOWN'&&world.time+1e-9>=p.nextFire){p.weaponPhase='EXPIRED';const weapon=this.spent.get(p.id);if(weapon)world.emit({kind:'weaponExpired',player:p.id,weapon,x:p.x,y:p.y+.7,z:p.z});this.spent.delete(p.id);}
      return;
    }
    const {weapon}=sequence,w=WEAPONS[weapon];
    if(p.health<=0||p.weapon!==weapon||p.ammo<=0||world.time>sequence.expires){this.cancel(p);return;}
    for(let shots=0;shots<4&&world.time+1e-9>=sequence.nextAt;shots++){
      if(sequence.lastMine&&Math.hypot(p.x-sequence.lastMine.x,p.z-sequence.lastMine.z)<w.mineSpacing!)return;
      p.nextFire=sequence.nextAt;
      if(!activate(world,p)){sequence.nextAt=world.time+w.cooldown;return;}
      this.spent.set(p.id,weapon);sequence.nextAt+=w.cooldown;p.nextFire=sequence.nextAt;
      if(weapon==='mine')sequence.lastMine={x:p.x,y:p.y,z:p.z};
      if(p.weapon!==weapon||p.ammo<=0){this.active.delete(p.id);p.attacking=false;p.weaponPhase='COOLDOWN';break;}
    }
  }
  cancel(p:PlayerState):void{this.active.delete(p.id);this.pending.delete(p.id);this.charging.delete(p.id);this.spent.delete(p.id);p.attacking=false;p.charging=false;p.chargeStartedAt=undefined;p.chargeRatio=0;p.weaponPhase=p.weapon?'EQUIPPED':'EXPIRED';}
  clear():void{this.active.clear();this.pending.clear();this.charging.clear();this.spent.clear();}
}