import type { ServerOptions } from './networking/server.js';

export function serverConfig(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  const integer = (name: string, fallback: number, lo: number, hi: number) => {
    if (env[name] === undefined) return fallback;
    const value = Number(env[name]);
    if (!Number.isInteger(value) || value < lo || value > hi) throw new Error(`${name} must be an integer between ${lo} and ${hi}.`);
    return value;
  };
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean).map(origin => {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error(`Invalid ALLOWED_ORIGINS entry: ${origin}`); }
    if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash || url.username || url.password)
      throw new Error('ALLOWED_ORIGINS must contain exact HTTP(S) origins, without paths or wildcards.');
    return url.origin;
  });
  if (env.NODE_ENV === 'production' && !allowedOrigins?.length) throw new Error('Set ALLOWED_ORIGINS to the deployed frontend origin in production.');
  if (env.SERVE_CLIENT !== undefined && !['true', 'false'].includes(env.SERVE_CLIENT)) throw new Error('SERVE_CLIENT must be true or false.');
  return { port: integer('PORT', 3001, 1, 65535), host: env.NODE_ENV === 'production' ? '0.0.0.0' : env.HOST ?? '0.0.0.0',
    capacity: integer('ROOM_CAPACITY', 8, 2, 8), duration: integer('MATCH_SECONDS', 180, 5, 3600),
    allowedOrigins, serveClient: env.SERVE_CLIENT !== 'false' };
}
