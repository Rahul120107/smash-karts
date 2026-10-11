import type { ProjectileKind, WeaponId } from './types.js';
export interface WeaponDefinition {
  activation: 'single' | 'burst';
  label: string; hint: string; ammo: number; cooldown: number; color: number;
  kind?: ProjectileKind; damage: number; speed: number; lifetime: number; radius: number;
  blast: number; duration: number; spread: number[]; turnRate: number;
  aimAssist?: { range: number; cone: number; maxCorrection: number; maxLeadSeconds: number; spread: number };
  launchVelocityY?: number;
  contactRange?: number;
}
const base = { activation: 'single' as const, damage: 0, speed: 0, lifetime: 0, radius: 0, blast: 0, duration: 0, spread: [0], turnRate: 0 };
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  machineGun: { ...base, activation: 'burst', label: 'Machine gun', hint: 'Tap SPACE · complete assisted burst', ammo: 30, cooldown: 0.105, color: 0xffdd63, kind: 'bullet', damage: 12, speed: 76, lifetime: 1.1, radius: 0.12,
    aimAssist: { range: 28, cone: 0.52, maxCorrection: 0.38, maxLeadSeconds: 0.4, spread: 0.014 } },
  rocket: { ...base, label: 'Rocket launcher', hint: 'Tap SPACE · one rocket per press', ammo: 3, cooldown: 0.65, color: 0xff804c, kind: 'rocket', damage: 72, speed: 32, lifetime: 3, radius: 0.3, blast: 5.5 },
  homing: { ...base, label: 'Homing missile', hint: 'SPACE · seeks nearest enemy ahead', ammo: 2, cooldown: 0.85, color: 0xf6a5ff, kind: 'homing', damage: 65, speed: 25, lifetime: 5, radius: 0.3, blast: 4.5, turnRate: 8 },
  mine: { ...base, label: 'Proximity mine', hint: 'Tap SPACE · place one of three mines', ammo: 3, cooldown: 0.6, color: 0xff6076, kind: 'mine', damage: 85, lifetime: 22, radius: 0.55, blast: 5 },
  bomb: { ...base, label: 'Lob bomb', hint: 'Tap SPACE · throw with a 1.6s fuse', ammo: 1, cooldown: 0.75, color: 0xedeae0, kind: 'bomb', damage: 90, speed: 13, lifetime: 1.6, radius: 0.48, blast: 6, launchVelocityY: 9 },
  shield: { ...base, label: 'Invincibility', hint: 'SPACE · protected contact attack for 5s', ammo: 1, cooldown: 0.2, color: 0x67d5ff, duration: 5, damage: 100, contactRange: 1.95 },
  boost: { ...base, label: 'Speed boost', hint: 'Tap SPACE · 55% faster for 4 seconds', ammo: 1, cooldown: 0.5, color: 0x72ffc1, duration: 4 },
  scatter: { ...base, label: 'Scatter blaster', hint: 'Tap SPACE · five-projectile spread', ammo: 1, cooldown: 0.55, color: 0xffcf83, kind: 'pellet', damage: 22, speed: 48, lifetime: 0.9, radius: 0.2, spread: [-0.2, -0.1, 0, 0.1, 0.2] },
  cannon: { ...base, label: 'Old cannon', hint: 'Tap SPACE · one of four heavy cannonballs', ammo: 4, cooldown: 0.8, color: 0xffc69b, kind: 'cannonball', damage: 78, speed: 26, lifetime: 4, radius: 0.44, blast: 5, launchVelocityY: 3.5 },
  bullets: { ...base, label: 'Heavy bullets', hint: 'Tap SPACE · straight shot, no aim assist', ammo: 3, cooldown: 0.3, color: 0xffb84b, kind: 'slug', damage: 45, speed: 64, lifetime: 1.1, radius: 0.18 },
  blastMissile: { ...base, label: 'Blast missile', hint: 'Tap SPACE · slow missile, wide explosion', ammo: 1, cooldown: 0.9, color: 0xff747c, kind: 'blastMissile', damage: 140, speed: 19, lifetime: 4, radius: 0.55, blast: 10 },
  orbit: { ...base, label: 'Orbit ram', hint: 'Tap SPACE · rotating contact attack for 5s', ammo: 1, cooldown: 0.4, color: 0xd7a4ff, duration: 5, damage: 100, contactRange: 2.6 },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
