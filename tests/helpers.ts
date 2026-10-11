import { Simulation } from '../server/src/simulation/simulation.js';
import { DT } from '../shared/src/config.js';
import { WEAPONS } from '../shared/src/weapons.js';
import type { WeaponId } from '../shared/src/types.js';
export function duel() {
  const world = new Simulation(180, () => 0);
  const a = world.addPlayer('a', 'Alpha'), b = world.addPlayer('b', 'Bravo'); world.start();
  Object.assign(a, { x: -8, y: 0, z: 0, yaw: 0, invulnerableUntil: 0 });
  Object.assign(b, { x: -8, y: 0, z: 8, yaw: Math.PI, invulnerableUntil: 0 });
  return { world, a, b };
}
export function equip(player: ReturnType<typeof duel>['a'], id: WeaponId) { player.weapon = id; player.ammo = WEAPONS[id].ammo; player.nextFire = 0; }
export function advance(world: Simulation, seconds: number) { for (let i = 0; i < Math.ceil(seconds / DT); i++) world.step(); }
