# Gameplay and Render readiness audit

Audit date: 2026-10-11. Existing React/Vite/Three.js/Node/ws TypeScript monorepo preserved. No database, accounts, progression, cosmetics, or unrelated gameplay features added.

## Findings and fixes

| Finding | Fix and evidence |
|---|---|
| Bomb collisions reversed both horizontal components and ignored vertical contacts, allowing bombs to pass through obstacle tops. | Swept wall contacts now return a face normal. Bombs preserve tangential velocity, reflect inward velocity, and advance the remainder of the timestep. Side-impact and obstacle-top regressions pass; fuse/area damage tests remain covered. |
| Camera aiming points could enter a wall; the previous 20% minimum clipping distance and subsequent smoothing could put the camera inside obstacles. | Clip aiming and camera rays from an anchor above the kart, then clip the final smoothed camera position. Boundary, obstacle, and unobstructed camera regressions pass. |
| Joining an active match after a middle player departed could reuse another player's spawn index. | Active-match joins choose a spawn far from living players, as respawns already do. Regression verifies separation. |
| Old socket callbacks could overwrite a new connection or restore room snapshots after leaving. Pending room requests could race with leave acknowledgement. | Callbacks require the current socket; snapshots require matching room membership. Room actions wait for acknowledgement. Mock-transport regressions and real browser rejoin tests cover recovery. |
| An open transport that stopped receiving messages left clients predicting without authoritative updates. | Browser heartbeat watchdog clears state and retries after roughly 14 seconds of silence. Tests cover silence and healthy heartbeat replies. |
| Shutdown immediately terminated connections without notifying players. Binding failure could leave simulation timers running. | Idempotent bounded shutdown sends code 1012, stops loops, drains/terminates sockets, and closes HTTP. Timers start only after successful binding. Real WS shutdown/port-reuse tests pass. |
| A separately hosted frontend lacked a backend-root URL configuration; root `.env` was not shared with Vite. | `VITE_SERVER_URL`, root env loading, protocol conversion/validation, and Render build checks added. Real HTTPS static-site/WSS tests use separate origins and a local TLS termination proxy. |
| Production origins were optional and useful lifecycle logs were sparse. | Production configuration requires exact origins; HTTP CORS and WS upgrade checks share the allowlist. Health remains accessible without Origin. Structured lifecycle/error logs and backend-only serving mode added. |
| Menu/background rendering continued at full animation speed. | Idle menu rendering is capped at 20 Hz and hidden-tab rendering at 4 Hz. Active gameplay retains its normal render loop. |

## Gameplay coverage

| System | Executed evidence |
|---|---|
| Driving | Shared movement tests cover acceleration/top speed, braking/reverse, coasting, speed-dependent steering, drift momentum, wall separation, kart momentum exchange, ramps/airborne landing, and identical prediction/server trajectories. Actual W/Space browser inputs verify driving and weapon collection/use. |
| Weapons | Parameterized equip/ammo/cooldown/dead-player tests cover all eight definitions. Machine gun damage and swept hits; rocket impact/blast; homing acquisition/steering/close targets/missing targets; mine arming/enemy trigger/expiry; bomb gravity/bounce/fuse; shield duration/protection; actual boost movement; five-pellet scatter and multi-hit damage. |
| Combat | Blast radius/falloff and wall occlusion, owned-projectile disconnect cleanup, authoritative health, exactly-once elimination credit, self-elimination rules, respawn/protection, timer finish/freeze, and replay reset tested. Two-browser scenarios verify all eight weapons and synchronized elimination/respawn. |
| Pickups | Atomic ownership under contention, random equipment, retained unspent ammo, vertical proximity, shared disappearance, and timed respawn covered by tests. |
| Authority | Clients send validated sequenced inputs only. Invalid elimination claims, payloads, message floods, stale input neutralization, queue limits, ammo/cooldowns, non-host starts, membership, and capacity checked. No production fixture/cheat endpoint added. |
| Rooms | Creation/join, invalid codes, repeated-code collision, room isolation, host transfer, empty-room removal, inactive lobby/completed-match eviction, start/end/replay tested. |
| Networking | Real multi-peer snapshots/combat, prediction reconciliation, 100 ms interpolation, 120 ms browser latency scenario, abrupt disconnect/fresh-identity rejoin, browser automatic recovery, restart notices, CORS, allowed/rejected/missing WS origins, and backpressure event serialization tested. |
| Assets/effects/audio | Built procedural geometry and synthesized audio require no external asset downloads. Browser tests initialize WebGL and exercise pickup/fire/explosion/damage/respawn effects; secure-origin test checks asset responses and page errors. Audible quality is not assessed by automated tests. |

## Deployment architecture and validation

`render.yaml` declares a Static Site and one Node Web Service, both built from repository root. The server compiles shared code into `dist`, uses `PORT`, binds publicly in production, exposes GET/HEAD `/health`, and runs with `SERVE_CLIENT=false`. TLS terminates at Render; the browser URL resolves to WSS. Required deployment URL values are supplied through environment settings, not committed credentials.

The Blueprint has been parsed and validated locally against Render's published [JSON schema](https://render.com/schema/render.yaml.json). Account-specific Blueprint acceptance and provisioning have not been tested. See [README.md](README.md) for exact commands, variables, Blueprint/manual creation steps, GitHub preparation, two-device acceptance checks, and troubleshooting.

The compiled production smoke test launches the actual Node entry with production env values and eight independent real WebSocket clients. It verifies health/CORS, configured port/binding, backend-only mode, all eight memberships, concurrent inputs, pickup/weapon use, identical same-tick players/projectiles/pickups, timer completion, replay, host transfer, fresh session rejoin, and graceful close code 1012. No server fixture access is used in this smoke test. On Windows a local IPC harness invokes the registered SIGTERM handler; real Render/Linux signal delivery remains unverified.

## Local performance

Synthetic three-minute, eight-player continuous-rearming combat workload: 639 ms total simulation time, 0.146 ms p95 tick/snapshot cost, 63 peak projectiles, 10,199-byte average snapshots, 22 eliminations. Estimated outbound payload is 1,594 KiB/s per eight-player room, excluding WebSocket/TLS overhead. Measurements are from this development machine and do not establish Render CPU/memory capacity or a browser frame-rate guarantee.

An initial eight-browser attempt at 1280×800 with software WebGL timed out during the sixth client's startup (five clients had joined). A follow-up at 640×720 with idle menu throttling reached all eight clients and recorded 2–3 animation frames/second per client, but exceeded the 120-second test budget during reporting. The final load scenario allows 240 seconds and closes contexts concurrently. This local software-rendering workload does not establish smooth GPU performance; full-resolution play across eight physical devices still requires hosted acceptance testing. The final executed load result is recorded in `PROGRESS.md`.

## Executed checks

- Baseline: production build, 58 unit/integration tests, four browser scenarios passed before edits.
- Updated builds: `npm run build` passes client/backend compilation and TypeScript checking.
- `npm run check`: passed both production builds, TypeScript, **99 unit/integration tests across nine files**, **all seven Chromium browser scenarios**, and compiled eight-client production smoke. Final backend path-validation change was rebuilt and its unit/integration regression suite passed again.
- Final eight-browser functional scenario passed at 640×720. Software-WebGL animation cadence was approximately **2 frames/second per client**; this does not verify smooth performance on physical GPUs/devices.
- Separate HTTPS/WSS browser test and automatic browser rejoin passed.
- Compiled eight-client production smoke passed.
- `npm audit`: zero vulnerabilities.
- `render.yaml`: passed current official JSON schema validation locally.
- Invalid production startup configuration and a missing Render frontend backend URL are rejected by compiled/startup/build smoke checks.
- Exact `npm run start:server` command verified with production environment: `/health` returned 200 and the backend-only root returned 404. Development launch was restored and verified afterward.

## Remaining limits

No actual Render deployment, Render-account validation, GitHub push, real WAN latency/loss measurement, or cross-device GPU acceptance test was performed. There is no configured Git remote. The single authoritative process stores rooms in memory: last-player departure deletes the room; backend restart/deploy discards all rooms and scores. Reconnection grants a new temporary identity and zero score. Rolling deployment can briefly overlap processes and does not migrate rooms. Keep one steady-state instance and deploy between matches.

Room capacity remains configurable to 16 for compatibility, but the audited target is eight; the arena has eight initial spawn positions. Prediction has no historical projectile rewind. Desktop keyboard input and WebGL are required. Direct interactive reference-game inspection and exact reproduction of Smash Karts mechanics are not claimed.

## Changed files

- Deployment/tooling: `.env.example`, `.gitignore`, `.node-version`, `render.yaml`, `package.json`, `package-lock.json`, `client/vite.config.ts`, `scripts/production-smoke.mjs`.
- Client: `client/src/networking/connection.ts`, `client/src/networking/url.ts`, `client/src/game/camera.ts`, `client/src/game/scene.ts`.
- Backend: `server/src/config.ts`, `server/src/index.ts`, `server/src/networking/server.ts`, `server/src/collisions/projectile.ts`, `server/src/weapons/projectiles.ts`, `server/src/simulation/simulation.ts`.
- Tests: `tests/connection.test.ts`, `tests/deployment.test.ts`, `tests/combat.test.ts`, `tests/network.test.ts`, `tests/rooms.test.ts`, `tests/browser/game.spec.ts`, `tests/browser/render.spec.ts`.
- Documentation: `README.md`, `PROGRESS.md`, `AUDIT.md`.
