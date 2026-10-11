export const CONFIG = {
  tickRate: 60, snapshotRate: 20, matchDuration: 180, capacity: 8,
  maxHealth: 100, respawnDelay: 2.5, spawnProtection: 2,
  pickupDelay: 7, kartRadius: 0.85, maxQueue: 18, inputTimeout: 0.25,
  acceleration: 29, braking: 45, reverseAcceleration: 19,
  maxSpeed: 21, reverseSpeed: 8, boostMultiplier: 1.55, steering: 2.55,
  gravity: 24, roomIdleSeconds: 600,
} as const;
export const DT = 1 / CONFIG.tickRate;
export const COLORS = [0xff7046, 0x50c9ef, 0xf5c747, 0xac86ee, 0x65d6a0, 0xef79b2, 0xa3c4e2, 0xe69e4b];
