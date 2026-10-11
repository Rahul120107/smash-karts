import type { WeaponId } from '../../../shared/src/types.js';
export interface FiringSound { wave: OscillatorType; from: number; to: number; duration: number; volume: number; noiseHz?: number }
/** Original synthesized timbres; no external audio assets or repeated engine source starts. */
export const FIRING_SOUNDS: Record<WeaponId, FiringSound> = {
  machineGun: { wave: 'square', from: 220, to: 35, duration: .085, volume: .2 },
  bullets: { wave: 'square', from: 380, to: 60, duration: .13, volume: .28 },
  rocket: { wave: 'sawtooth', from: 170, to: 42, duration: .24, volume: .3, noiseHz: 1400 },
  homing: { wave: 'triangle', from: 420, to: 110, duration: .28, volume: .28, noiseHz: 1900 },
  cannon: { wave: 'triangle', from: 72, to: 35, duration: .38, volume: .5, noiseHz: 1200 },
  bomb: { wave: 'triangle', from: 145, to: 260, duration: .22, volume: .23, noiseHz: 300 },
  mine: { wave: 'sine', from: 510, to: 170, duration: .18, volume: .22 },
  blastMissile: { wave: 'sawtooth', from: 95, to: 25, duration: .42, volume: .45, noiseHz: 750 },
  shield: { wave: 'sine', from: 580, to: 1400, duration: .24, volume: .24 },
  orbit: { wave: 'triangle', from: 330, to: 880, duration: .3, volume: .26 },
  boost: { wave: 'sawtooth', from: 110, to: 320, duration: .3, volume: .24 },
  scatter: { wave: 'square', from: 260, to: 80, duration: .19, volume: .3, noiseHz: 1800 },
};
