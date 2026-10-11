export const CONFIG = {
  tickRate: 60, snapshotRate: 20, matchDuration: 180, capacity: 8,
  maxHealth: 100, respawnDelay: 2.5, spawnProtection: 2,
  pickupDelay: 7, kartRadius: 0.85, maxQueue: 18, inputTimeout: 0.25,
  acceleration: 29, braking: 45, reverseAcceleration: 19,
  maxSpeed: 21, reverseSpeed: 8, boostMultiplier: 1.55, steering: 2.55,
  gravity: 24, roomIdleSeconds: 600,
  maxYawRate: 2.3, maxJumpVelocity: 6.5, terminalVelocity: 22,
  groundTolerance: 0.055, groundSnapDistance: 0.2, rampJumpSpeed: 10,
  maxStepHeight: 0.18, kartRestitution: 0.1, wallRestitution: 0.08,
  recoveryHeight: 12,
} as const;
export const DT = 1 / CONFIG.tickRate;
export const COLORS = [0xff7046, 0x50c9ef, 0xf5c747, 0xac86ee, 0x65d6a0, 0xef79b2, 0xa3c4e2, 0xe69e4b];
