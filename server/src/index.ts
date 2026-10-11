import { startServer } from './networking/server.js';
import { serverConfig } from './config.js';
const options = serverConfig();
const server = await startServer({ ...options, logger: entry => console.log(JSON.stringify({ at: new Date().toISOString(), ...entry })) });
console.log(`Crossfire Karts listening on ${options.host}:${server.port}`);
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  console.log(`Received ${signal}; closing game connections.`);
  void server.close().catch(error => { console.error('Shutdown failed:', error); process.exitCode = 1; });
});
