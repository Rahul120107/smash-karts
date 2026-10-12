import { describe, expect, it } from 'vitest';
import { serverConfig } from '../server/src/config.js';
import { websocketUrl } from '../client/src/networking/url.js';
import { clipCameraRay } from '../client/src/game/camera.js';
import { wallSegment } from '../shared/src/wall-collision.js';
import { ARENA_SIZE, WALLS } from '../shared/src/arena.js';

describe('deployment configuration', () => {
  it('uses local defaults and production PORT with public binding', () => {
    expect(serverConfig({})).toMatchObject({ port: 3001, host: '0.0.0.0', duration: 180, capacity: 8, serveClient: true });
    expect(serverConfig({ NODE_ENV: 'production', PORT: '10000', HOST: 'localhost', ALLOWED_ORIGINS: 'https://game.example/', SERVE_CLIENT: 'false' }))
      .toMatchObject({ port: 10000, host: '0.0.0.0', allowedOrigins: ['https://game.example'], serveClient: false });
  });
  it.each([{ PORT: '0' }, { ROOM_CAPACITY: '1' }, { ROOM_CAPACITY: '9' }, { ROOM_CAPACITY: '16' }, { MATCH_SECONDS: '5.5' }, { SERVE_CLIENT: 'yes' }, { NODE_ENV: 'production' },
    { ALLOWED_ORIGINS: '*' }, { ALLOWED_ORIGINS: 'https://game.example/path' }, { ALLOWED_ORIGINS: 'https://user:pass@game.example' }])('rejects invalid environment %j', env => {
    expect(() => serverConfig(env)).toThrow();
  });
  it.each([['https://backend.example', 'wss://backend.example/ws'], ['https://backend.example/ws', 'wss://backend.example/ws'],
    ['wss://backend.example/ws', 'wss://backend.example/ws']])('converts %s into a secure browser endpoint', (url, expected) => {
    expect(websocketUrl({ protocol: 'https:', host: 'frontend.example' }, url)).toBe(expected);
  });
  it('uses the development proxy and preserves the legacy URL override', () => {
    expect(websocketUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
    expect(websocketUrl({ protocol: 'https:', host: 'frontend.example' }, 'https://ignored.example', 'wss://legacy.example/ws')).toBe('wss://legacy.example/ws');
  });
  it.each(['http://backend.example', 'ws://backend.example/ws', 'ftp://backend.example', 'bad URL', 'https://backend.example/path', 'https://backend.example?token=abc'])('rejects unsafe production endpoint %s', url => {
    expect(() => websocketUrl({ protocol: 'https:', host: 'frontend.example' }, url)).toThrow();
  });
});

describe('follow camera wall protection', () => {
  const clear = (anchor: { x: number; y: number; z: number }, desired: typeof anchor) => {
    const clipped = clipCameraRay(anchor, desired);
    for (const w of WALLS) expect(wallSegment(anchor, clipped, w)).toBeNull();
    return clipped;
  };
  it('keeps aiming outside a boundary when facing directly into it', () => {
    expect(clear({ x: ARENA_SIZE / 2 - 1.85, y: 1.2, z: 10 }, { x: ARENA_SIZE / 2 - 0.05, y: 1.2, z: 10 }).x).toBeLessThan(ARENA_SIZE / 2 - 1);
  });
  it('clips the smoothed camera position when its interpolation crosses an obstacle', () => {
    expect(clear({ x: 21, y: .8, z: 14 }, { x: 27, y: 1, z: 14 }).x).toBeLessThan(23.1);
  });
  it('allows an unobstructed follow camera', () => {
    const desired = { x: 60, y: 6.1, z: 18 }; expect(clear({ x: 60, y: 1.2, z: 27 }, desired)).toEqual(desired);
  });
});
