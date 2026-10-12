import { insideLake, LAKE } from '../../../shared/src/arena.js';
import { eliminate } from '../combat/damage.js';
import type { CombatWorld } from './world.js';

export const ENVIRONMENT_ID = 'environment';
/** Crossing above lava is safe; falling into it is not a self-inflicted weapon attack. */
export function stepWaterHazard(world: CombatWorld) {
  for (const p of world.players.values()) {
    if (p.health > 0 && insideLake(p.x, p.z) && p.y <= LAKE.surface + .35) eliminate(world, p, ENVIRONMENT_ID);
  }
}
