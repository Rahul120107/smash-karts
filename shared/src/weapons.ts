import type { ProjectileKind, WeaponId } from './types.js';
export interface WeaponDefinition {
  activation: 'single' | 'burst' | 'release';
  label: string; hint: string; ammo: number; cooldown: number; color: number;
  kind?: ProjectileKind; damage: number; speed: number; lifetime: number; radius: number;
  blast: number; duration: number; spread: number[]; turnRate: number;
  aimAssist?: { range: number; cone: number; maxCorrection: number; maxLeadSeconds: number; spread: number };
  launchVelocityY?: number;
  inheritedVelocity?: number;
  elevation?: number;
  mineSpacing?: number;
  sequenceTimeout?: number;
  orbit?: { radius: number; speed: number; count: number; ballRadius: number; hitCooldown: number; knockback: number };
  contactRange?: number;
}
const base = { activation: 'single' as const, damage: 0, speed: 0, lifetime: 0, radius: 0, blast: 0, duration: 0, spread: [0], turnRate: 0 };
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  machineGun: { ...base, activation: 'burst', label: 'Machine gun', hint: 'Tap SPACE · complete assisted burst', ammo: 30, cooldown: 0.105, color: 0xffdd63, kind: 'bullet', damage: 12, speed: 76, lifetime: 1.1, radius: 0.12,
    aimAssist: { range: 28, cone: 0.52, maxCorrection: 0.52, maxLeadSeconds: 0.4, spread: 0.014 } },
  rocket: { ...base, activation: 'burst', inheritedVelocity: 1, label: 'Rocket launcher', hint: 'Tap SPACE · three consecutive rockets', ammo: 3, cooldown: 0.65, color: 0xff804c, kind: 'rocket', damage: 72, speed: 32, lifetime: 3, radius: 0.3, blast: 5.5 },
  homing: { ...base, activation: 'burst', inheritedVelocity: 1, label: 'Homing missile', hint: 'SPACE · two seeking missiles', ammo: 2, cooldown: 0.85, color: 0xf6a5ff, kind: 'homing', damage: 65, speed: 25, lifetime: 5, radius: 0.3, blast: 4.5, turnRate: 8 },
  mine: { ...base, activation: 'burst', mineSpacing: 1.8, sequenceTimeout: 8, label: 'Proximity mine', hint: 'Tap SPACE · three spaced mines / drive to deploy', ammo: 3, cooldown: 0.6, color: 0xff6076, kind: 'mine', damage: 85, lifetime: 22, radius: 0.55, blast: 5 },
  bomb: { ...base, activation: 'release', inheritedVelocity: .45, label: 'Lob bomb', hint: 'Hold SPACE to aim · release to throw', ammo: 1, cooldown: 0.75, color: 0xedeae0, kind: 'bomb', damage: 90, speed: 13, lifetime: 1.6, radius: 0.48, blast: 6, launchVelocityY: 9 },
  shield: { ...base, label: 'Invincibility', hint: 'SPACE · protected contact attack for 5s', ammo: 1, cooldown: 0.2, color: 0x67d5ff, duration: 5, damage: 100, contactRange: 1.95 },
  boost: { ...base, label: 'Speed boost', hint: 'Tap SPACE · 55% faster for 4 seconds', ammo: 1, cooldown: 0.5, color: 0x72ffc1, duration: 4 },
  scatter: { ...base, label: 'Scatter blaster', hint: 'Tap SPACE · five-projectile spread', ammo: 1, cooldown: 0.55, color: 0xffcf83, kind: 'pellet', damage: 22, speed: 48, lifetime: 0.9, radius: 0.2, spread: [-0.2, -0.1, 0, 0.1, 0.2] },
  cannon: { ...base, activation: 'burst', inheritedVelocity: 1, elevation: Math.atan2(9, 26), label: 'Siege cannon', hint: 'Tap SPACE · four ballistic cannonballs', ammo: 4, cooldown: 0.8, color: 0xffc69b, kind: 'cannonball', damage: 78, speed: 26, lifetime: 4, radius: 0.44, blast: 5, launchVelocityY: 9 },
  bullets: { ...base, activation: 'burst', label: 'Heavy bullets', hint: 'Tap SPACE · complete assisted volley', ammo: 3, cooldown: 0.3, color: 0xffb84b, kind: 'slug', damage: 45, speed: 64, lifetime: 1.1, radius: 0.18,
    aimAssist: { range: 32, cone: 0.48, maxCorrection: 0.48, maxLeadSeconds: 0.5, spread: 0.018 } },
  blastMissile: { ...base, inheritedVelocity: 1, label: 'Blast missile', hint: 'Tap SPACE · slow missile, wide explosion', ammo: 1, cooldown: 0.9, color: 0xff747c, kind: 'blastMissile', damage: 140, speed: 19, lifetime: 4, radius: 0.55, blast: 10 },
  orbit: { ...base, label: 'Orbit Ram', hint: 'Tap SPACE · rotating impact attack for 6s', ammo: 1, cooldown: 0.4, color: 0xd7a4ff, duration: 6, damage: 38, contactRange: 3.7, orbit: { radius: 2.3, speed: 10, count: 3, ballRadius: .55, hitCooldown: .5, knockback: 6 } },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
