export type WeaponId = 'machineGun' | 'rocket' | 'homing' | 'mine' | 'bomb' | 'shield' | 'boost' | 'scatter' | 'cannon' | 'bullets' | 'blastMissile' | 'orbit' | 'fakeLootBox';
export type ProjectileKind = 'bullet' | 'rocket' | 'homing' | 'mine' | 'bomb' | 'pellet' | 'cannonball' | 'slug' | 'blastMissile' | 'fakeBox';
export type WeaponPhase = 'IDLE' | 'EQUIPPED' | 'AIMING' | 'CHARGING' | 'FIRING' | 'COOLDOWN' | 'EXPIRED';
export interface Vec3 { x: number; y: number; z: number }
export interface Input { seq: number; throttle: number; steer: number; fire: boolean; drift: boolean; firePress?: number; fireHeld?: boolean }
export interface KartState extends Vec3 { yaw: number; vx: number; vz: number; vy: number; yawRate?: number }
export interface PlayerState extends KartState {
  id: string; name: string; color: number; health: number; score: number; deaths: number;
  weapon: WeaponId | null; ammo: number; nextFire: number; shieldUntil: number; boostUntil: number;
  invulnerableUntil: number; respawnAt: number; ack: number;
  aimTarget?: string | null;
  attacking?: boolean;
  orbitUntil?: number;
  charging?: boolean;
  chargeStartedAt?: number;
  chargeRatio?: number;
  weaponPhase?: WeaponPhase;
}
export interface Projectile extends Vec3 {
  id: number; kind: ProjectileKind; owner: string; vx: number; vy: number; vz: number;
  radius: number; damage: number; blast: number; expires: number; armedAt: number; target: string | null;
  maxRange?: number; travelled?: number; origin?: Vec3;
  weapon?: WeaponId;
  ownerName?: string;
  blockedAtSpawn?: boolean;
}
export interface Pickup extends Vec3 { id: number; active: boolean; availableAt: number }
export type EffectKind = 'fire' | 'explosion' | 'hit' | 'pickup' | 'pickupSpawn' | 'shield' | 'shieldImpact' | 'boost' | 'elimination' | 'impact' | 'collision' | 'respawn' | 'weaponExpired';
export interface GameEvent extends Vec3 { id: number; kind: EffectKind; at: number; player: string; weapon?: WeaponId; radius?: number; target?: string; pickupId?: number; yaw?: number;
  killerId?: string; killerName?: string; victimId?: string; victimName?: string; weaponName?: string; matchId?: number; matchEventId?: string;
}
export interface Snapshot {
  winnerIds?: string[];
  code: string; host: string; phase: 'lobby' | 'playing' | 'finished'; tick: number; time: number;
  remaining: number; duration: number; capacity: number; players: PlayerState[]; projectiles: Projectile[];
  pickups: Pickup[]; events: GameEvent[];
}
export type ClientMessage =
  | { type: 'create'; name: string }
  | { type: 'join'; name: string; code: string }
  | { type: 'start' | 'leave' }
  | { type: 'input'; commands: Input[] }
  | { type: 'ping'; at: number };
export type ServerMessage =
  | { type: 'welcome'; id: string; code: string }
  | { type: 'snapshot'; state: Snapshot }
  | { type: 'error'; message: string }
  | { type: 'left' }
  | { type: 'pong'; at: number };
