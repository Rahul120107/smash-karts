export const CONFIG = {
  tickRate: 60, snapshotRate: 20, matchDuration: 180, capacity: 8,
  maxHealth: 100, respawnDelay: 2.5, spawnProtection: 2,
  pickupDelay: 10, kartRadius: 0.85, maxQueue: 18, inputTimeout: 0.25,
  acceleration: 29, braking: 45, reverseAcceleration: 19,
  maxSpeed: 21, reverseSpeed: 8, boostMultiplier: 1.55, steering: 2.55,
  gravity: 24, roomIdleSeconds: 600,
  maxYawRate: 2.3, maxJumpVelocity: 6.5, terminalVelocity: 22,
  groundTolerance: 0.055, groundSnapDistance: 0.2, rampJumpSpeed: 10,
  maxStepHeight: 0.18, kartRestitution: 0.1, wallRestitution: 0.08,
  recoveryHeight: 12,
  kartMass: 180, wheelbase: 1.7, steeringResponse: 11,
  lowSpeedSteerAngle: 0.55, highSpeedSteerAngle: 0.13,
  roadGrip: 8, driftGrip: 1.7, turnGrip: 17, driftTurnGrip: 4,
  airControl: 0.15,
} as const;
export const DT = 1 / CONFIG.tickRate;
export const COLORS = [0xf44349, 0x369bff, 0x9bef37, 0x9861f5, 0xffd344];
