# Progress log

## Foundation and movement
- Inspected empty workspace; Node 24 and npm available. Initialized Git.
- Created TypeScript workspaces and repeatable install/build/dev/test scripts.
- Shared arena and movement implement forward/reverse/braking, steering, lateral grip/drift, kart/wall collisions, gravity, and ramps.
- Corrected acceleration/grip coupling after a movement test caught slow acceleration.

## Multiplayer, weapons, and combat
- Implemented validated control-only WebSocket protocol and authoritative 60 Hz simulation, 20 Hz snapshots.
- Implemented room codes, join/create, host transfer, lobby/start/finish/replay, disconnect/idle cleanup.
- Implemented all eight weapons, swept projectiles, homing acquisition, armed proximity mines, ballistic bouncing bombs, splash falloff/occlusion, shields, boosts, ammo/cooldowns, and cleanup.
- Implemented atomic random pickups and respawn delay, health, eliminations, scores, respawns, protection, and match timer.

## Client and integration
- Built procedural Three.js arena/karts/pickups/projectiles, follow camera, effects, damage feedback, synthesized sounds, HUD, minimap, lobby, and results.
- Implemented input prediction/reconciliation, remote interpolation, bounded projectile extrapolation, reconnection handling, and event deduplication across room changes.
- Production build and TypeScript checking pass.
- Dependency audit reports zero vulnerabilities after updating Vitest.
- Initial 47 unit/integration tests passed; regression for close-range homing increased this to 48, all passed.
- Two-session browser flow passed: create/join, actual keyboard driving, pickup collection, weapon activation, timer/finish, replay, and leaving.
- Invalid room and server-disconnection browser test passed.
- Browser weapon sweep exposed close-range homing overshoot; fixed approach steering and added passing server regression.
- All four browser scenarios passed: full two-player flow, eight weapon categories plus elimination/respawn, 120 ms simulated round-trip delay, invalid room/disconnection feedback.
- Prediction/interpolation tests passed. Eight simultaneous real WebSocket clients passed, including capacity refusal for a ninth player.
- Snapshot optimization rounds wire values and sends new effects per client; the authoritative simulation retains full precision. Regression tests pass.
- Synthetic three-minute, eight-player heavy-combat benchmark: 598 ms total, 0.136 ms p95 tick/snapshot cost, 63 peak projectiles, ~10 KB average snapshot. Estimated outbound payload ~1.5 MiB/s/room under continuous weapon rearming.
- `npm run check` passed after snapshot optimization: production build, 58 unit/integration tests, all four browser scenarios.
- Real message-flood test verifies policy disconnect and preservation/host transfer for the other room member.
- A boost test verifies increased actual server movement speed, in addition to duration/expiry.
- Compiled production Node entry point smoke test passed: `/health` and built client served with HTTP 200.
- Fixed sound-button focus interfering with keyboard controls. Rebuilt and reran the two-browser flow: driving immediately after audio toggle, collecting/firing, finish, replay, and leave all passed.
- Final dependency audit: zero vulnerabilities. Development client endpoint returned HTTP 200; server `/health` returned `ok: true`.

## Final integration
- Implementation and required local verification complete. Source/configuration/tests documented in README; stable milestones recorded in Git.
- Screenshot verification: lobby, actual gameplay, and final standings were inspected from the two-browser run. Recreate screenshots with `npm run test:browser` in `test-results/`.
- Public hosting, real WAN testing, cross-GPU/browser coverage, and production-scale benchmarking are not verified.

## Gameplay audit and Render preparation — 2026-10-11
- Baseline production build, 58 unit/integration tests, and four browser scenarios passed.
- Fixed bomb side/top contacts, final camera clipping, and active-match late-join spawn overlap; added targeted regressions.
- Added transport watchdog, stale-callback guards, pending room/leave acknowledgement handling, automatic fresh-identity rejoin, and restart feedback.
- Added validated production environment configuration, exact HTTP CORS/WS origins, backend-only hosting, lifecycle/error logs, idempotent bounded shutdown, and clean bind-failure handling.
- Added backend-root `VITE_SERVER_URL`, secure protocol conversion, shared root env loading, independent builds, tested Node pin, `.env.example`, and two-service `render.yaml`.
- Blueprint parsed and validated against Render's current published JSON schema. No Render provisioning/account validation performed.
- Added real browser automatic rejoin and separate-origin HTTPS/WSS tests; both passed before the final suite.
- Compiled production entry passed eight-client room/input/pickup/weapon/snapshot/timer/replay/disconnect/rejoin and graceful-shutdown smoke checks. Windows uses an IPC invocation of the real SIGTERM handler; Render/Linux delivery remains unverified.
- Compiled startup rejects invalid PORT and missing production origins. Render frontend build rejects a missing backend URL.
- Added an eight-browser software-WebGL load scenario. Initial full-resolution startup timed out; reduced-viewports reached eight clients and recorded 2–3 animation frames/second but exceeded the original reporting time budget. Test now allows 240 seconds and closes browser contexts concurrently. This does not establish smooth physical-device performance.
- Capped idle menu rendering at 20 Hz and hidden-tab rendering at 4 Hz; gameplay rendering retains its normal cadence.
- Synthetic three-minute/eight-player benchmark passed: 639 ms total, 0.146 ms p95 tick/snapshot, 63 peak projectiles, 10,199-byte average snapshots, estimated 1,594 KiB/s total outbound payload per room.
- Clean `npm ci --include=dev` passed after stopping the previous development session, which held the Windows esbuild executable open. No global processes or unrelated files were removed.
- Final `npm run check` passed: TypeScript/client/server builds, 99 unit/integration tests across nine files, all seven Chromium browser scenarios (4.4 minutes), and compiled eight-client production smoke. Backend path validation was rebuilt and its regression suite rerun after the final HTTP hardening change; 99 tests passed again.
- Final eight-browser scenario passed functionally at 640×720, recording approximately 2 animation frames/second per client with software WebGL on this machine. This is a load-test observation, not a smooth-performance guarantee.
- Final dependency audit: zero vulnerabilities. No Render deployment or real WAN/GPU acceptance claim is made.
- Exact `npm run start:server` command passed a production-env health/backend-only HTTP smoke check. Restored `npm run dev`; frontend is available at localhost:5173 with backend health at localhost:3001/health.
- Updated README with GitHub preparation, Blueprint/manual Render steps, environment variables, two-device acceptance testing, and troubleshooting. Full findings/file list in AUDIT.md.

## Free Render plan update — 2026-10-11
- Changed backend Blueprint compute plan to `free`; frontend remains a free Static Site with no compute-plan field.
- Verified the complete Blueprint against Render's current official JSON schema and compared its parsed contents with the prior configuration: only the backend plan changed.
- Rechecked 99 unit/integration tests and the compiled eight-client production multiplayer smoke test; all passed. Gameplay source and other service settings were preserved.
- Updated README for free-service idle spin-down/cold starts. Actual Render deployment and performance on the free compute plan remain unverified.
