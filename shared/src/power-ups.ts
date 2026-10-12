import {CONFIG} from './config.js';
import {WEAPONS} from './weapons.js';
import type {PlayerState} from './types.js';
/** Simultaneous effects choose the strongest speed multiplier; they never multiply. */
export function speedMultiplier(p:PlayerState,time:number){return Math.max(1,time<p.boostUntil?CONFIG.boostMultiplier:1,time<p.shieldUntil?WEAPONS.shield.speedMultiplier!:1,time<(p.orbitUntil??0)?WEAPONS.orbit.speedMultiplier!:1);}
