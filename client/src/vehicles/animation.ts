import { clamp } from '../../../shared/src/math.js';
import { drivingTelemetry } from '../../../shared/src/movement.js';
import type { KartState } from '../../../shared/src/types.js';

export interface SuspensionState { offset: number; velocity: number; previousForward: number; previousVy: number; grounded: boolean; pitch: number; roll: number }
export const newSuspension = (): SuspensionState => ({ offset: 0, velocity: 0, previousForward: 0, previousVy: 0, grounded: true, pitch: 0, roll: 0 });
/** Damped visual spring is deliberately isolated from authoritative kart position/velocity. */
export function animateSuspension(state: SuspensionState, kart: KartState, dt: number) {
  const telemetry = drivingTelemetry(kart), step = clamp(dt, 0.001, 0.05);
  const acceleration = clamp((telemetry.forward - state.previousForward) / step, -45, 35);
  const landing = telemetry.grounded && !state.grounded ? clamp(-state.previousVy, 0, 22) : 0;
  if (landing) state.velocity -= landing * 0.08;
  state.velocity += (-110 * state.offset - 19 * state.velocity) * step;
  state.offset = clamp(state.offset + state.velocity * step, -0.12, 0.08);
  const mix = 1 - Math.exp(-9 * step);
  state.pitch += (clamp(acceleration * .0018, -.07, .055) - state.pitch) * mix;
  state.roll += (clamp(-(kart.yawRate ?? 0) * telemetry.forward * .0025 - telemetry.lateral * .003, -.095, .095) - state.roll) * mix;
  state.previousForward = telemetry.forward; state.previousVy = kart.vy; state.grounded = telemetry.grounded;
  return { ...telemetry, landing };
}
