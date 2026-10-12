import type { PlayerState, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { activate } from './activate.js';
import { WEAPONS } from '../../../shared/src/weapons.js';

/** Automatic bursts are server owned; a short buffer makes near-cooldown taps reliable. */
export class AttackSequences {
  private active = new Map<string, WeaponId>();
  private pending = new Map<string, { weapon: WeaponId; until: number }>();
  begin(world: CombatWorld, player: PlayerState): boolean {
    if (this.active.has(player.id)) return false;
    const weapon = player.weapon;
    if (!weapon || player.health <= 0 || player.ammo <= 0) return false;
    if (player.nextFire > world.time + 1e-9) {
      if (player.nextFire - world.time <= .12) this.pending.set(player.id, { weapon, until: world.time + .12 });
      return false;
    }
    this.pending.delete(player.id);
    if (!activate(world, player)) return false;
    if (WEAPONS[weapon].activation === 'burst' && player.weapon === weapon && player.ammo > 0) this.active.set(player.id, weapon);
    player.attacking = this.active.has(player.id); return true;
  }
  step(world: CombatWorld, player: PlayerState): void {
    const queued = this.pending.get(player.id);
    if (queued) {
      if (player.health <= 0 || player.weapon !== queued.weapon || world.time > queued.until + 1e-9) this.pending.delete(player.id);
      else if (world.time + 1e-9 >= player.nextFire) this.begin(world, player);
    }
    const weapon = this.active.get(player.id);
    if (!weapon) return;
    if (player.health <= 0 || player.weapon !== weapon || player.ammo <= 0) { this.cancel(player); return; }
    if (world.time + 1e-9 >= player.nextFire) activate(world, player);
    if (player.weapon !== weapon || player.ammo <= 0) this.cancel(player);
  }
  cancel(player: PlayerState): void { this.active.delete(player.id); this.pending.delete(player.id); player.attacking = false; }
  clear(): void { this.active.clear(); this.pending.clear(); }
}
