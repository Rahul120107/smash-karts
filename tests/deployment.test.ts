import { describe, expect, it } from 'vitest';
import { serverConfig } from '../server/src/config.js';
import { websocketUrl } from '../client/src/networking/url.js';
import { clipCameraRay } from '../client/src/game/camera.js';
import { segmentBox } from '../shared/src/math.js';
import { WALLS } from '../shared/src/arena.js';

describe('deployment configuration', () => {
  it('uses local defaults and production PORT with public binding', () => {
    expect(serverConfig({})).toMatchObject({ port: 3001, host: '0.0.0.0', duration: 180, capacity: 8, serveClient: true });
    expect(serverConfig({ NODE_ENV: 'production', PORT: '10000', HOST: 'localhost', ALLOWED_ORIGINS: 'https://game.example/', SERVE_CLIENT: 'false' }))
      .toMatchObject({ port: 10000, host: '0.0.0.0', allowedOrigins: ['https://game.example'], serveClient: false });
  });
  it.each([{ PORT: '0' }, { ROOM_CAPACITY: '1' }, { MATCH_SECONDS: '5.5' }, { SERVE_CLIENT: 'yes' }, { NODE_ENV: 'production' },
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
    for (const w of WALLS) expect(segmentBox(anchor, clipped, { x: w.x - w.width / 2, y: 0, z: w.z - w.depth / 2 },
      { x: w.x + w.width / 2, y: w.height, z: w.z + w.depth / 2 })).toBeNull();
    return clipped;
  };
  it('keeps aiming outside a boundary when facing directly into it', () => {
    expect(clear({ x: 34.15, y: 1.2, z: 10 }, { x: 35.95, y: 1.2, z: 10 }).x).toBeLessThan(34.7);
  });
  it('clips the smoothed camera position when its interpolation crosses an obstacle', () => {
    expect(clear({ x: -4, y: 1.2, z: 0 }, { x: 5, y: 6.1, z: 0 }).x).toBeLessThan(-2.8);
  });
  it('allows an unobstructed follow camera', () => {
    const desired = { x: -8, y: 6.1, z: 18 }; expect(clear({ x: -8, y: 1.2, z: 27 }, desired)).toEqual(desired);
  });
});
