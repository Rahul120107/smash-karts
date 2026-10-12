import type { Vec3 } from './types.js';
import { WEAPONS } from './weapons.js';

/** World-space orbit phase is independent of steering, and identical on server and client. */
export function orbitPosition(kart: Vec3, time: number, index: number): Vec3 {
  const orbit=WEAPONS.orbit.orbit!, phase=time*orbit.speed+index*Math.PI*2/orbit.count;
  return { x:kart.x+Math.sin(phase)*orbit.radius,y:kart.y+.65,z:kart.z+Math.cos(phase)*orbit.radius };
}
