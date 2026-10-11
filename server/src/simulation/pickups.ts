import { CONFIG } from '../../../shared/src/config.js';
import { WEAPONS, WEAPON_IDS } from '../../../shared/src/weapons.js';
import type { CombatWorld } from './world.js';

export function collectPickups(world: CombatWorld): void {
  for (const box of world.pickups) {
    if (box.availableAt > world.time) continue;
    for (const player of world.players.values()) {
      // Retain a weapon until it is spent; driving over a box won't replace unused ammunition.
      if (player.health <= 0 || player.weapon !== null || Math.abs(player.y - box.y) > 1.8) continue;
      if (Math.hypot(player.x - box.x, player.z - box.z) > 1.6) continue;
      const id = WEAPON_IDS[Math.min(WEAPON_IDS.length - 1, Math.floor(world.random() * WEAPON_IDS.length))]!;
      player.weapon = id; player.ammo = WEAPONS[id].ammo; player.nextFire = world.time + 0.12;
      box.availableAt = world.time + CONFIG.pickupDelay;
      world.emit({ kind: 'pickup', player: player.id, weapon: id, x: box.x, y: box.y + 0.8, z: box.z });
      break; // Collection and ownership happen atomically in a single simulation tick.
    }
  }
}
