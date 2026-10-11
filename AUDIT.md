# Gameplay, physics and Render readiness audit

Audit date: 2026-10-11. Existing React/Vite/Three.js/Node/ws TypeScript monorepo preserved. No database, accounts, progression, cosmetics, or unrelated gameplay features added.

## Gameplay upgrade findings

| Finding | Fix and executed evidence |
|---|---|
| Entering a ramp through its vertical side converted a 2.6-unit floor discontinuity into 156 units/second upward velocity; the old kart exceeded 266 units after two seconds. Grounded motion also stored slope correction in ballistic velocity, then failed its own ground-contact check. | Shared movement now resolves ramp sides horizontally, separates supported terrain height from ballistic velocity, bounds crest launches/falls, and lands without rebound. Flat driving, ramp-side contact, slow ascent/descent, edge falls, repeated impacts, eight-kart pileups, 10,000 steering steps, recovery and client/server agreement pass automated regressions. No rigid-body mass/inertia exists in this upright arcade solver. |
| A timestep straddling the triangular crest could average out the approach slope and produce a weak/missing jump. | Use the greatest of the two previous approach grades. All 64 tested starting alignments produce the expected launch impulse and land; real-browser jump checks exercise authoritative snapshots and local prediction. |
| Input generation was inside the render loop, so delayed animation frames could stop packets and trigger the server timeout. | Sampling/prediction/send batching now uses a separate timer. A real browser regression pauses animation frames and verifies continued authoritative movement and acknowledged key release. Browser weapon fixtures also wait for actual input acknowledgements and compare event IDs, rather than assuming a 150 ms wait or comparing rounded wire timestamps to full-precision server time. |
| Local prediction only considered walls/terrain and could drive through another kart before the next correction. | Predict horizontal contacts against disposable remote-body copies with at most 100 ms extrapolation. Reconciliation retains server ownership and snapshots are never mutated; contact/prediction regressions pass. |
| Machine-gun fire had no targeting assistance. | Server selects visible living, unprotected enemies within a 28-unit range and 0.52-radian forward half-cone, favors direction, computes velocity lead, limits correction, and adds small spread. Bullet sweeps/range/damage remain authoritative. Tests cover target switching, wall/ramp occlusion, lead, misses after a direction change, ammo/cooldowns, range boundaries and forged client claims. Two real WebSocket clients receive the same target and health result. |
| Individual particle meshes and continuously rendered menu backgrounds competed for GPU time during multi-window tests. | Static geometry is merged by material. Effects have fixed pools of 512 particles, 256 tyre marks and 16 rings with at most three effect draw calls. Static menu/lobby/results views redraw on scene, phase or resize changes. Slow foreground matches reduce raster resolution and use contact shadows. Pool/cleanup/batching regressions and real-browser idle/resize checks cover these controls. |
| Audio did not distinguish actual tyre slip or bound overlapping combat sounds. | Persistent engine/harmonic/tyre sources start once. Smoothed speed/load/slip parameters gate tyres to grounded sliding; combat has a 12-voice budget and contact rate limit. Profile/lifecycle tests cover silent parked/straight/airborne tyres, source reuse, cleanup and activation deduplication. Audible quality requires human listening. |

New procedural kart silhouettes, steering wheels/turrets, asphalt grain, paint, cargo props, trees/sky, glowing pickups, tracers/smoke, sparks/explosions, shield pulses, tyre smoke/marks and respawn rings are original. The responsive UI refresh includes health, speed/slip, weapon/ammo, targeting feedback, live standings, kill feed, urgent countdown, menus/lobby/results and connection indicators. Browser screenshots were inspected at desktop, 640-pixel and 390-pixel widths; a compact health-label wrapping issue was fixed.

Render configuration is unchanged: backend `plan: free`, one Node process, frontend free Static Site. The unchanged Blueprint passed the current official JSON schema. No dependency or stack replacement was needed. The user reports the initial game is deployed; this upgrade is being verified locally and has not been pushed/deployed by this work.

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
| Menu/background rendering continued at full animation speed. | An initial 20 Hz cap was superseded by static menu/lobby/results views with redraws on scene/phase/resize changes. Hidden gameplay rendering is capped at 4 Hz; active gameplay keeps its animation loop and independent input timer. |

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

Synthetic three-minute, eight-player continuous-rearming combat workload: **510 ms** total, **0.123 ms** p95 tick/snapshot cost, **36** peak projectiles, **6,538-byte** average snapshots, **55** eliminations. Estimated outbound payload is **1,022 KiB/s** per eight-player room, excluding transport overhead. These development-machine measurements do not establish Render capacity.

Two early upgrade load runs exceeded the 240-second budget: the first during startup, the second after reaching eight players and completing assertions/report generation. Static idle views and foreground quality controls brought the eight-browser scenario within budget; the final full-suite load case passed in about **72 seconds** at 640×720. It recorded **31–112 draw calls**, **7,100–10,352 triangles** per measured view and approximately **1 animation frame/second** per client under eight concurrent software-WebGL windows. This is a constrained software-rendering functional stress test, not a smooth-performance claim. Physical-device/GPU and hosted eight-player acceptance remain required.

## Executed checks

- Baseline: production build, 58 unit/integration tests, four browser scenarios passed before edits.
- Updated builds: `npm run build` passes client/backend compilation and TypeScript checking.
- `npm run check`: passed both production builds, TypeScript, **129 unit/integration tests across thirteen files**, **all ten Chromium browser scenarios**, and compiled eight-client production smoke. The final run completed successfully in sequence after the physics, input-clock, rendering and fixture synchronization fixes.
- Final eight-browser functional scenario passed at 640×720. Software-WebGL animation cadence was approximately **1 frame/second per client**; this does not verify smooth performance on physical GPUs/devices.
- Separate HTTPS/WSS browser test and automatic browser rejoin passed.
- Compiled eight-client production smoke passed.
- `npm audit`: zero vulnerabilities.
- `render.yaml`: passed current official JSON schema validation locally.
- Invalid production startup configuration and a missing Render frontend backend URL are rejected by compiled/startup/build smoke checks.
- Exact `npm run start:server` command verified with production environment: `/health` returned 200 and the backend-only root returned 404. Development launch was restored and verified afterward.

## Remaining limits

The user reports the initial game is already deployed. This upgrade has not been deployed by this work; Render-account validation, GitHub push, real WAN latency/loss measurement and cross-device GPU acceptance testing remain pending. A GitHub origin is configured; this upgrade has not been pushed by this work. The single authoritative process stores rooms in memory: last-player departure deletes the room; backend restart/deploy discards all rooms and scores. Reconnection grants a new temporary identity and zero score. Rolling deployment can briefly overlap processes and does not migrate rooms. Keep one steady-state instance and deploy between matches.

Room capacity remains configurable to 16 for compatibility, but the audited target is eight; the arena has eight initial spawn positions. Prediction has no historical projectile rewind. Desktop keyboard input and WebGL are required. Direct interactive reference-game inspection and exact reproduction of Smash Karts mechanics are not claimed.

## Files changed in this upgrade

- Shared dynamics/combat contracts: `shared/src/config.ts`, `movement.ts`, `types.ts`, `weapons.ts`, new `aim.ts`.
- Authoritative backend: `server/src/simulation/simulation.ts`, `server/src/weapons/activate.ts`, `projectiles.ts`.
- Renderer/models: `client/src/game/scene.ts`, new `game/batch.ts`, `maps/arena.ts`, `vehicles/kart.ts`, `weapons/visuals.ts`.
- Prediction/input delivery: `client/src/networking/prediction.ts` and the independent input timer in `game/scene.ts`.
- Effects/audio: `client/src/effects/particles.ts`, `audio.ts`, new `driving-audio.ts`.
- UI: `client/src/main.tsx`, `ui/Hud.tsx`, new `ui/upgrade.css`; existing menu/lobby/results behavior is preserved.
- Regressions: new `tests/stability.test.ts`, `aim.test.ts`, `effects.test.ts`, `audio.test.ts`; updated `prediction.test.ts`, `network.test.ts`, `browser/game.spec.ts`.
- Documentation: `README.md`, `AUDIT.md`, `PROGRESS.md`.

`render.yaml`, runtime dependencies, deployment scripts, and environment contracts are unchanged. The official Blueprint schema check passed with the free backend and free Static Site.
