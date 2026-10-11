import type { ProjectileKind, WeaponId } from './types.js';
export interface WeaponDefinition {
  label: string; hint: string; ammo: number; cooldown: number; color: number;
  kind?: ProjectileKind; damage: number; speed: number; lifetime: number; radius: number;
  blast: number; duration: number; spread: number[]; turnRate: number;
  aimAssist?: { range: number; cone: number; maxCorrection: number; maxLeadSeconds: number; spread: number };
}
const base = { damage: 0, speed: 0, lifetime: 0, radius: 0, blast: 0, duration: 0, spread: [0], turnRate: 0 };
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  machineGun: { ...base, label: 'Machine gun', hint: 'Hold SPACE · assisted rapid fire', ammo: 30, cooldown: 0.105, color: 0xffdd63, kind: 'bullet', damage: 12, speed: 76, lifetime: 1.1, radius: 0.12,
    aimAssist: { range: 28, cone: 0.52, maxCorrection: 0.38, maxLeadSeconds: 0.4, spread: 0.014 } },
  rocket: { ...base, label: 'Rocket launcher', hint: 'SPACE · blast on impact', ammo: 3, cooldown: 0.65, color: 0xff804c, kind: 'rocket', damage: 72, speed: 32, lifetime: 3, radius: 0.3, blast: 5.5 },
  homing: { ...base, label: 'Homing missile', hint: 'SPACE · seeks nearest enemy ahead', ammo: 2, cooldown: 0.85, color: 0xf6a5ff, kind: 'homing', damage: 65, speed: 25, lifetime: 5, radius: 0.3, blast: 4.5, turnRate: 8 },
  mine: { ...base, label: 'Proximity mine', hint: 'SPACE · drop behind you', ammo: 3, cooldown: 0.6, color: 0xff6076, kind: 'mine', damage: 85, lifetime: 22, radius: 0.55, blast: 5 },
  bomb: { ...base, label: 'Lob bomb', hint: 'SPACE · throw with a 1.6s fuse', ammo: 3, cooldown: 0.75, color: 0xedeae0, kind: 'bomb', damage: 90, speed: 13, lifetime: 1.6, radius: 0.4, blast: 6 },
  shield: { ...base, label: 'Shield', hint: 'SPACE · absorb damage for 5 seconds', ammo: 1, cooldown: 0.2, color: 0x67d5ff, duration: 5 },
  boost: { ...base, label: 'Speed boost', hint: 'SPACE · 55% faster for 4 seconds', ammo: 2, cooldown: 0.5, color: 0x72ffc1, duration: 4 },
  scatter: { ...base, label: 'Scatter cannon', hint: 'SPACE · five-shot fan', ammo: 5, cooldown: 0.55, color: 0xffcf83, kind: 'pellet', damage: 22, speed: 48, lifetime: 0.9, radius: 0.2, spread: [-0.2, -0.1, 0, 0.1, 0.2] },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
