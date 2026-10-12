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
  projectilesPerUse?: number;
  durationBurst?: number;
  splashDamage?: number;
  armingDelay?: number;
  triggerRadius?: number;
  charge?: { maxSeconds: number; minSpeed: number; maxSpeed: number; elevation: number };
  falloff?: { start: number; end: number; minimum: number };
  speedMultiplier?: number;
  damageReduction?: number;
  orbit?: { radius: number; speed: number; count: number; ballRadius: number; hitCooldown: number; knockback: number };
  contactRange?: number;
}
const base = { activation: 'single' as const, damage: 0, speed: 0, lifetime: 0, radius: 0, blast: 0, duration: 0, spread: [0], turnRate: 0 };
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  machineGun: { ...base, activation: 'burst', label: 'Machine gun', hint: 'Tap SPACE · automatic 6.5-second tracking burst', ammo: 166,durationBurst:6.5, cooldown: 6.5/165, color: 0xffdd63, kind: 'bullet', damage: 1.25, speed: 76, lifetime: 1.1, radius: 0.12,falloff:{start:6,end:28,minimum:.35},
    aimAssist: { range: 28, cone: 0.52, maxCorrection: 0.52, maxLeadSeconds: 0.4, spread: 0.014 } },
  rocket: { ...base, activation: 'burst', inheritedVelocity: 1, label: 'Rocket launcher', hint: 'Tap SPACE · three consecutive rockets', ammo: 3, cooldown: 0.65, color: 0xff804c, kind: 'rocket', damage: 50,splashDamage:25, speed: 32, lifetime: 3, radius: 0.3, blast: 5.5 },
  homing: { ...base, activation: 'burst', inheritedVelocity: 1, label: 'Homing missile', hint: 'SPACE · two seeking missiles', ammo: 2, cooldown: 0.85, color: 0xf6a5ff, kind: 'homing', damage: 65, speed: 25, lifetime: 5, radius: 0.3, blast: 4.5, turnRate: 8 },
  mine: { ...base, activation: 'burst', mineSpacing: 1.8, sequenceTimeout: 8, label: 'Proximity mine', hint: 'Tap SPACE · three spaced rear mines / drive to deploy', ammo: 3, cooldown: 0.6, color: 0xff6076, kind: 'mine', damage: 100,splashDamage:40,armingDelay:.7,triggerRadius:2, lifetime: 22, radius: 0.55, blast: 5 },
  bomb: { ...base, activation: 'release', inheritedVelocity: .45, label: 'Lob-Grenuke', hint: 'Hold SPACE to aim · release to throw', ammo: 1, cooldown: 0.75, color: 0xe7633d, kind: 'bomb', damage: 100,splashDamage:80,armingDelay:.25,triggerRadius:2, speed: 13, lifetime: 3, radius: 0.48, blast: 6, launchVelocityY: 9,charge:{maxSeconds:1.2,minSpeed:13,maxSpeed:23,elevation:Math.atan2(9,13)} },
  shield: { ...base, label: 'Invincibility Star', hint: 'SPACE · protection, contact attack and speed for 5s', ammo: 1, cooldown: 0.2, color: 0xffe870, duration: 5, damage: 100, contactRange: 1.95,speedMultiplier:1.45 },
  boost: { ...base, label: 'Speed boost', hint: 'Tap SPACE · 55% faster for 4 seconds', ammo: 1, cooldown: 0.5, color: 0x72ffc1, duration: 4 },
  scatter: { ...base, label: 'Scatter blaster', hint: 'Tap SPACE · five-projectile spread', ammo: 1, cooldown: 0.55, color: 0xffcf83, kind: 'pellet', damage: 22, speed: 48, lifetime: 0.9, radius: 0.2, spread: [-0.2, -0.1, 0, 0.1, 0.2] },
  cannon: { ...base, activation: 'release', inheritedVelocity: 1, elevation: Math.atan2(9, 26), label: 'Siege cannon', hint: 'Hold SPACE for range · release four cannonballs', ammo: 4, cooldown: 0.8, color: 0xffc69b, kind: 'cannonball', damage: 78, speed: 26, lifetime: 4, radius: 0.44, blast: 5, launchVelocityY: 9,charge:{maxSeconds:1.2,minSpeed:26,maxSpeed:42,elevation:Math.atan2(9,26)} },
  bullets: { ...base, activation: 'burst', label: 'Standard bullets', hint: 'Tap SPACE · nine straight three-projectile rounds', ammo: 27,projectilesPerUse:3, cooldown: 0.3, color: 0xffb84b, kind: 'slug', damage: 7, speed: 64, lifetime: 1.1, radius: 0.12,spread:[-.025,0,.025],falloff:{start:12,end:64,minimum:.55} },
  blastMissile: { ...base, inheritedVelocity: 1, label: 'Nuke', hint: 'Tap SPACE · slow straight missile, wide explosion', ammo: 1, cooldown: 0.9, color: 0xff747c, kind: 'blastMissile', damage: 100,splashDamage:50, speed: 19, lifetime: 4, radius: 0.55, blast: 10 },
  orbit: { ...base, label: 'Orbit Ram', hint: 'Tap SPACE · five spiked orbs, impact attack for 6s', ammo: 1, cooldown: 0.4, color: 0xd7a4ff, duration: 6, damage: 38, contactRange: 3.7,speedMultiplier:1.25,damageReduction:.1, orbit: { radius: 2.3, speed: 10, count: 5, ballRadius: .55, hitCooldown: .5, knockback: 6 } },
  fakeLootBox: { ...base,label:'Fake Loot Box',hint:'Tap SPACE · disguised rear contact trap',ammo:1,cooldown:.6,color:0xffd367,kind:'fakeBox',damage:100,splashDamage:20,armingDelay:.7,triggerRadius:1.6,lifetime:22,radius:.6,blast:1.8 },
};
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
