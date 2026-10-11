import { startServer } from './networking/server.js';
function integerEnv(name: string, fallback: number, lo: number, hi: number) {
  const value = process.env[name]; if (value === undefined) return fallback;
  const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < lo || parsed > hi) throw new Error(`${name} must be an integer between ${lo} and ${hi}.`);
  return parsed;
}
const server = await startServer({ port: integerEnv('PORT', 3001, 1, 65535), host: process.env.HOST ?? '0.0.0.0',
  duration: integerEnv('MATCH_SECONDS', 180, 5, 3600), capacity: integerEnv('ROOM_CAPACITY', 8, 2, 16),
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) });
console.log(`Crossfire Karts listening on http://localhost:${server.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
