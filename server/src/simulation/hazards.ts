import { insideLava, LAVA } from '../../../shared/src/arena.js';
import { eliminate } from '../combat/damage.js';
import type { CombatWorld } from './world.js';

export const ENVIRONMENT_ID = 'environment';
/** Crossing above lava is safe; falling into it is not a self-inflicted weapon attack. */
export function stepLavaHazard(world: CombatWorld) {
  for (const p of world.players.values()) {
    if (p.health > 0 && insideLava(p.x, p.z) && p.y <= LAVA.surface + .35) eliminate(world, p, ENVIRONMENT_ID);
  }
}
