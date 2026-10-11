import { clearShot } from '../../../shared/src/aim.js';
import { distance } from '../../../shared/src/math.js';
import { WEAPONS } from '../../../shared/src/weapons.js';
import type { PlayerState } from '../../../shared/src/types.js';
import type { CombatWorld } from '../simulation/world.js';
import { damage } from './damage.js';

const shieldFeedback = new WeakMap<CombatWorld, { time: number; next: Map<string, number> }>();
const FEEDBACK_INTERVAL = .15;

/** Server-owned durations, proximity and unobstructed contact; no client hit declarations. */
export function stepContactAttacks(world: CombatWorld): void {
  let feedback = shieldFeedback.get(world);
  if (!feedback || world.time < feedback.time) {
    feedback = { time: world.time, next: new Map() }; shieldFeedback.set(world, feedback);
  }
  feedback.time = world.time;
  for (const [pair, next] of feedback.next) if (next <= world.time) feedback.next.delete(pair);
  const hits: { target: PlayerState; amount: number; attacker: string }[] = [];
  for (const attacker of world.players.values()) {
    if (attacker.health <= 0) continue;
    const weapon = (attacker.orbitUntil ?? 0) > world.time ? 'orbit' : attacker.shieldUntil > world.time ? 'shield' : null;
    if (!weapon) continue;
    const definition = WEAPONS[weapon], origin = { x: attacker.x, y: attacker.y + 0.65, z: attacker.z };
    for (const target of world.players.values()) {
      if (target.id === attacker.id || target.health <= 0 || target.invulnerableUntil > world.time) continue;
      const center = { x: target.x, y: target.y + 0.65, z: target.z };
      if (distance(origin, center) > definition.contactRange! || !clearShot(origin, center, 0)) continue;
      if (target.shieldUntil > world.time) {
        // Sustained protected contact needs a pulse, not 60 effects per second.
        // Only zero-damage feedback is throttled; newly vulnerable targets hit immediately.
        const pair = `${attacker.id}\0${target.id}`;
        if ((feedback.next.get(pair) ?? 0) > world.time + 1e-9) continue;
        feedback.next.set(pair, world.time + FEEDBACK_INTERVAL);
      }
      hits.push({ target, amount: definition.damage, attacker: attacker.id });
    }
  }
  // Resolve contacts from the same tick together; room insertion order must not
  // decide which of two unprotected contact attackers gets to deal damage.
  for (const hit of hits) damage(world, hit.target, hit.amount, hit.attacker);
}
