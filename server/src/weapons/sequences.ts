import type { PlayerState, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { activate } from './activate.js';

/** A press starts a whole pickup attack. Release/latency never interrupts its ammo sequence. */
export class AttackSequences {
  private active = new Map<string, WeaponId>();
  begin(world: CombatWorld, player: PlayerState): boolean {
    if (this.active.has(player.id)) return false;
    const weapon = player.weapon;
    if (!weapon || !activate(world, player)) return false;
    if (player.weapon === weapon && player.ammo > 0) this.active.set(player.id, weapon);
    player.attacking = this.active.has(player.id); return true;
  }
  step(world: CombatWorld, player: PlayerState): void {
    const weapon = this.active.get(player.id);
    if (!weapon) return;
    if (player.health <= 0 || player.weapon !== weapon || player.ammo <= 0) { this.cancel(player); return; }
    if (world.time + 1e-9 >= player.nextFire) activate(world, player);
    if (player.weapon !== weapon || player.ammo <= 0) this.cancel(player);
  }
  cancel(player: PlayerState): void { this.active.delete(player.id); player.attacking = false; }
  clear(): void { this.active.clear(); }
}
