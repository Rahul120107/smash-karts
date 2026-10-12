import type { GameEvent, Pickup, PlayerState, Projectile } from '../../../shared/src/types.js';
export interface CombatWorld {
  time: number; players: Map<string, PlayerState>; projectiles: Map<number, Projectile>;
  matchId?: number;
  pickups: Pickup[]; random: () => number;
  nextProjectileId(): number;
  emit(event: Omit<GameEvent, 'id' | 'at'>): void;
}
