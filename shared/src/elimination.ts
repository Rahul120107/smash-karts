import type { GameEvent } from './types.js';

export const NOTIFICATIONS = { duration: 3.2, feedDuration: 5 };
/** Plain text only: strip control/bidi characters and angle brackets before rendering. */
export function sanitizeName(name: string): string { return name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/g,'').trim(); }
export function eliminationNotice(event: GameEvent, self: string): { message: string; death: boolean } | null {
  if(event.kind!=='elimination')return null;
  const killer=event.killerId??event.player,victim=event.victimId??event.target;
  const weapon=event.weaponName??'Unknown weapon';
  if(victim===self)return {death:true,message:killer==='environment'?'You fell into the water!':`You were smashed by ${sanitizeName(event.killerName??'Player')} using ${weapon}!`};
  if(killer===self && victim!==self)return {death:false,message:`You smashed ${sanitizeName(event.victimName??'Player')} using ${weapon}!`};
  return null;
}
