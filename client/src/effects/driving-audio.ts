import { drivingTelemetry } from '../../../shared/src/movement.js';
import type { KartState } from '../../../shared/src/types.js';

/** Slip is measured from velocity relative to the chassis, never from the drift key. */
export function drivingSoundProfile(kart: KartState, previousSpeed: number, dt: number) {
  const { speed, slip, sliding, grounded } = drivingTelemetry(kart);
  const acceleration = Math.max(-1, Math.min(1, (speed - previousSpeed) / Math.max(dt, 1 / 120) / 20));
  return {
    speed,
    engineHz: 38 + speed * 3.8 + Math.max(0, acceleration) * 13,
    engineVolume: 0.045 + Math.min(1, speed / 24) * 0.075 + Math.max(0, acceleration) * 0.025,
    tyreVolume: grounded && sliding ? Math.min(0.2, slip * speed / 35) : 0,
    tyreHz: 650 + Math.min(1, slip) * 1150,
  };
}
