import type { PlayerState, Vec3, WeaponId } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { activate } from './activate.js';
import { WEAPONS } from '../../../shared/src/weapons.js';

/** Automatic bursts are server owned; a short buffer makes near-cooldown taps reliable. */
export class AttackSequences {
  private active = new Map<string, { weapon: WeaponId; expires: number; lastMine?: Vec3 }>();
  private charging = new Set<string>();
  private pending = new Map<string, { weapon: WeaponId; until: number }>();
  begin(world: CombatWorld, player: PlayerState): boolean {
    if (this.active.has(player.id) || this.charging.has(player.id)) return false;
    const weapon = player.weapon;
    if (!weapon || player.health <= 0 || player.ammo <= 0) return false;
    if (WEAPONS[weapon].activation === 'release') {
      if (player.nextFire > world.time) return false;
      this.charging.add(player.id); player.charging = true; return true;
    }
    if (player.nextFire > world.time + 1e-9) {
      if (player.nextFire - world.time <= .12) this.pending.set(player.id, { weapon, until: world.time + .12 });
      return false;
    }
    this.pending.delete(player.id);
    if (!activate(world, player)) {
      if (weapon !== 'mine') return false;
      // An obstructed mine mount waits for a safe deployment position without spending ammo.
      this.active.set(player.id,{weapon,expires:world.time+WEAPONS.mine.sequenceTimeout!});
      player.attacking=true;return true;
    }
    if (WEAPONS[weapon].activation === 'burst' && player.weapon === weapon && player.ammo > 0) this.active.set(player.id, { weapon, expires: world.time + (WEAPONS[weapon].sequenceTimeout ?? WEAPONS[weapon].ammo * WEAPONS[weapon].cooldown + 1), ...(weapon === 'mine' ? { lastMine: { x: player.x, y: player.y, z: player.z } } : {}) });
    player.attacking = this.active.has(player.id); return true;
  }
  release(world: CombatWorld, player: PlayerState): void {
    if (!this.charging.delete(player.id)) return;
    player.charging = false;
    if (player.health > 0 && player.weapon && WEAPONS[player.weapon].activation === 'release') activate(world, player);
  }
  step(world: CombatWorld, player: PlayerState): void {
    const queued = this.pending.get(player.id);
    if (queued) {
      if (player.health <= 0 || player.weapon !== queued.weapon || world.time > queued.until + 1e-9) this.pending.delete(player.id);
      else if (world.time + 1e-9 >= player.nextFire) this.begin(world, player);
    }
    if (player.charging && (!player.weapon || WEAPONS[player.weapon].activation !== 'release')) { this.cancel(player); return; }
    const sequence = this.active.get(player.id);
    if (!sequence) return;
    const { weapon } = sequence;
    if (player.health <= 0 || player.weapon !== weapon || player.ammo <= 0) { this.cancel(player); return; }
    if (world.time > sequence.expires) { this.cancel(player); return; }
    if (world.time + 1e-9 >= player.nextFire) {
      if (sequence.lastMine && Math.hypot(player.x - sequence.lastMine.x, player.z - sequence.lastMine.z) < WEAPONS.mine.mineSpacing!) return;
      if (activate(world, player) && weapon === 'mine') sequence.lastMine = { x: player.x, y: player.y, z: player.z };
    }
    if (player.weapon !== weapon || player.ammo <= 0) this.cancel(player);
  }
  cancel(player: PlayerState): void { this.active.delete(player.id); this.pending.delete(player.id); this.charging.delete(player.id); player.attacking = false; player.charging = false; }
  clear(): void { this.active.clear(); this.pending.clear(); this.charging.clear(); }
}
