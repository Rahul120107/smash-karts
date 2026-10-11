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

## Gameplay, physics and presentation upgrade — 2026-10-11

- Reproduced ramp-side launch at 156 units/s and height above 266 after two seconds. Fixed shared ground support and horizontal ramp-face contacts; retained bounded crest jumps, non-bouncing landings, recovery, grip and low-restitution collisions.
- Found a second crest/timestep alignment defect; using two previous approach grades now passes 64 launch-alignment cases. Flat/slow-slope/edge-fall/pileup/long-steering/prediction regressions pass.
- Added server-selected machine-gun cone/range/line-of-sight targeting, velocity lead, bounded correction and spread. Server still owns bullet travel, damage, ammo and cooldowns. Real-peer and browser tests cover targeting, wall blocking and invalid client claims.
- Added predicted contacts with bounded remote copies. Moved input sampling/prediction/packet generation off the render loop; browser test proves commands continue with animation frames paused.
- Upgraded original procedural karts, materials, lighting, road surface/paint, cargo props, trees/sky and pickup models. Static geometry batches by material; particles/smoke/skids/shockwaves use bounded instanced pools.
- Added speed/slip-controlled persistent engine/tyre loops, contact sounds and bounded combat voices. Source reuse, gating and cleanup regressions pass; human audible-quality assessment is pending.
- Refreshed menus/lobby/HUD/results with consistent responsive arcade styling, speed/health/ammo/target cues, live standings, kill feed, urgent countdown, connection status and reduced-motion support. Inspected desktop/compact/narrow screenshots and fixed compact health-number wrapping.
- Two software-rendering load attempts timed out. Static idle views and foreground quality fallback brought the final eight-browser load scenario within budget. Browser fixtures now await real input acknowledgements and compare event IDs to avoid release-delay and wire-time rounding races.
- Final `npm run check` passed: TypeScript, both production builds, **129 tests / 13 files**, **all 10 Chromium scenarios**, and compiled eight-client production smoke. The full browser suite completed in 4.3 minutes; eight-browser load took about 72 seconds.
- Final load observation: approximately **1 FPS** per window under eight concurrent software-WebGL clients at 640×720, **31–112 draw calls** and **7,100–10,352 triangles** per measured view. Smooth hardware-GPU / eight-device / WAN performance remains unverified.
- Latest three-minute/eight-player simulation benchmark: **510 ms** total, **0.123 ms** p95 tick/snapshot, **36** peak projectiles, **6,538-byte** mean snapshot, **1,022 KiB/s** estimated room outbound, **55** eliminations. Development-machine measurements are not Render capacity guarantees.
- Backend remains `plan: free` / one instance; frontend remains a free Static Site. Unchanged Blueprint passed the current official JSON schema. No dependency/stack replacement. Dependency audit found zero vulnerabilities.
- README documents tuning, architecture and upgrading the existing deployment. The initial game is deployed according to the user; this upgrade has not been pushed/deployed by this work. Hosted acceptance, physical GPU performance, audible review and actual Linux signal delivery remain pending.

## Pickup collection and ten-second respawn — 2026-10-11

- Set each box's server-simulation cooldown to ten seconds (600 fixed ticks). Explicit active state prevents invisible collection during cooldown and prevents client clocks from inventing respawns. Original spawn positions remain intact; replay resets all boxes and deadlines.
- Retained existing empty-slot collection, random weapon assignment, ammo and equip cooldown. Collection remains atomic and server-owned. Added pickup IDs on collection events and explicit pickup-spawn events, with immediate authoritative broadcasts for both transitions.
- Added bounded collection sparks, glowing return particles/halo, and a short box/halo spawn animation. The renderer and minimap use authoritative active state, including late-join snapshots. No physics, damage, dependency, or Render configuration changes.
- TypeScript and both production builds passed. All 152 unit/integration tests passed, including exact-tick timing at eight offsets, independent boxes, contested contact, random assignment across eight categories, cooldown exclusion, replay, late joins and forged pickup rejection.
- Full browser run passed ten scenarios including the new two-browser pickup test, all weapons, reconnection, eight browsers and HTTPS/WSS. The existing idle test initially sampled before the first ResizeObserver callback; added two animation-frame settling, then its targeted rerun passed. All eleven browser scenarios have passed; the first combined `npm run check` reported that initial idle-test failure.
- Final typecheck and compiled eight-client production smoke passed. Render backend remains Free/single-instance and frontend remains a free Static Site. Deployment requires backend first, then frontend; actual hosted acceptance remains unverified.

## Major gameplay and arena release — 2026-10-11

- Found owner exclusion on direct projectile hits but missing exclusion in splash damage. Central damage and explosion paths now reject the original owner, including delayed bomb/mine/cannon explosions. Projectiles retain owner and weapon attribution; enemies still take damage. Added shield-impact feedback.
- Replaced held-key firing with server-run attack sequences started by a validated rising input edge. Machine gun spends 30 rounds, rockets fire three, homing missiles fire two; mine/bomb/boost/scatter/cannon are one-use pickups. Quick taps are latched by the client. Release does not stop a burst; holding Space cannot activate a replacement pickup. Death, disconnect, replay and match end clean up attacks.
- Added bicycle-model steering radius, speed-dependent wheel angle, smoothed shared yaw rate, controlled ground traction/drift recovery, reduced airborne control and equal-mass collision impulses. Retained bounded crest jumps, vertical face contacts and non-bouncing landings. Kart wheels/chassis animate steering, support and slope pitch from real movement.
- Expanded arena from 72 to 112 units (about 2.4 times playable area), retained original central routes, added a wide curved outer road/open plazas, three additional ramps including a flat elevated platform, collider-aligned rock/barrier blocks, 30 pickups and extra safe respawn positions. Renderer and simulation share ramp profiles; minimap and shadows cover expanded bounds.
- Kept the original multi-projectile attack as a scatter blaster and introduced a distinct old cannon: one iron ball, gravity-driven arc, slower 26-unit/s motion, 78 maximum splash damage, strong flash, thick smoke, impact fragments and original heavy synthesized launch sound. Added homing target rings/fins, bomb fuse pulsing, shield hit flashes and boost trails using existing bounded pools.
- Updated old boundary/cannon/self-damage assertions to the new rules. Driving stress fixtures now distinguish flat pileups from later legitimate ramp/platform travel. Added 47 regression cases, including quick-tap browser and two-peer complete automatic burst verification.
- Final `npm run check` passed: TypeScript, both production builds, **199 tests / 15 files**, **all 12 browser scenarios** (4.6 minutes), and compiled eight-client production smoke. All nine weapon choices, eight browser players, 120 ms simulated round-trip latency and separate HTTPS/WSS origins passed. Inspected cannon-ready and expanded-boundary screenshots.
- Latest software-WebGL eight-browser sample: about **2 FPS** at 640×720, **47–161 draw calls**, **9,092–14,256 triangles**. This is functional stress-test evidence, not smooth hardware-GPU performance. Final synthetic three-minute/eight-player benchmark: **567 ms** total, **0.126 ms** p95 tick/snapshot, **43** peak projectiles, **10,121-byte** mean snapshots, **1,581 KiB/s** estimated room outbound, **12** eliminations. An earlier benchmark during browser contention took 1,979 ms; the final run was after browser checks.
- No dependencies, stack, Render plans, scripts or environment contracts replaced. Backend remains Free/single-instance; frontend remains free static hosting. Deploy both services from this same commit and reload clients between matches. Hosted acceptance, physical-device/GPU smoothness, audible human assessment and actual Linux SIGTERM delivery remain unverified. Tunnels were omitted because the shared heightfield has one floor per location.

## Sunbreak Island, vehicle and rendering upgrade — 2026-10-11

- Inspected the existing architecture and clean main branch; verified the authorized origin and fetched without discarding history. Reference images were not available as files, so art follows the supplied descriptions. Kept the tested 112-unit combat layout, room protocol, nine weapons, owner immunity and one-press attack sequences.
- Added shared finite-height obstacle bases, a northern tunnel with a real ceiling/corridor, eastern flat bridge deck/rails, shallow river ford and eight physical palm trunks. Kart contacts, roof recovery, projectile sweeps, aim occlusion and camera clipping use the same geometry. No driving underneath the heightfield bridge or into distant scenic mountains is claimed.
- Added original ocean/waterfall shaders, mountain chains, cliffs/beach, instanced tropical palms/vegetation/flowers/clouds, wind, mist/pollen pools, generated grass/asphalt textures, stone ruin surfaces and curved shortcuts. No external asset or paid-service dependency. Hardware rendering retains a small sky-reflection cubemap and one soft-shadow sun.
- Replaced kart shells with compact aerodynamic bodies, five automatic color themes, side pods, wings, tread/rims/arches, lamps, exhausts and mechanical links. Added wheel-speed/steering animation and a separate damped visual spring for landing compression, roll and braking/acceleration pitch. Shared throttle torque tapers toward top speed while preserving boost strength; braking reaches zero before reversing.
- Improved speed-sensitive camera distance/FOV, terrain/roof avoidance and bounded shake. Added original continuous spatial ocean/waterfall/bird ambience and landing sounds, with hidden/inactive gating. Pickup energy uses the assigned weapon color, bomb sparks follow the fuse, and UI identifies Sunbreak Island/nine weapons. Mystery boxes retain server-random assignment and exact ten-second timers.
- Initial checks caught reduced boost performance from torque taper, expected audio-stub changes after new loops, and a rail fixture placed exactly outside the supported deck. Corrected those. Screenshot review caught inward-facing car-shell and shortcut triangles; added outward-facing regressions. An early full browser attempt had two failures under slow software reflection compilation; stopped that obsolete run after diagnosis, added immediate software quality fallback and made pickup firing wait for the authoritative equip cooldown. The subsequent full check passed all 13 scenarios.
- Profile inspection found per-box drawing overhead. Instanced all pickup parts into four draws while retaining independent transforms/visibility and server state. Added an instance regression and ran the full check again on the final code: **TypeScript + both builds + 212 tests / 16 files + all 13 Chromium scenarios (6.0 minutes) + compiled eight-client production smoke passed**.
- Final hardware profile on **Windows / i5-1334U / 15.7 GiB / Intel Iris Xe D3D11** measured **60.06 FPS**, **16.65 ms mean / 16.80 ms p95**, sampled **153 draws / 52,234 triangles** at **1920×1080**, full quality. This is a five-second moving-camera sample with one rendered browser/seven real native WebSocket peers. The first profiling-script attempt exposed tsx's Node-only `__name` helper in the browser callback; fixed the harness and reran successfully, with no renderer errors.
- Final software-only 1080p sample: **5.73 FPS**, **174.58 ms mean / 316.70 ms p95**, **52 draws / 35,868 triangles**. Eight SwiftShader browser windows: **1–2 FPS each**, **71–143 draws**, **38,554–47,858 triangles**, maximum frame gaps **817–950 ms**. These are functional stress checks, not hardware/device benchmarks. Machine-readable measurements are committed in `docs/performance-2026-10-11.json`.
- Final three-minute/eight-player synthetic server benchmark: **864 ms** total, **0.229 ms p95 tick/snapshot**, **43** peak projectiles, **10,112-byte** average snapshots, **1,580 KiB/s** estimated outbound and **8** eliminations. It excludes transport and extra pickup-transition broadcasts and is not Render capacity evidence.
- Render Free Web Service/single process and free Static Site, package dependencies, deployment scripts and environment examples are unchanged. Both services need the same release and browser reloads between matches. Actual deployment/WAN/eight-device acceptance, sustained worst-case GPU profiling, human handling/audio review, deep-water gameplay, overlapping driving floors and full wheel physics remain pending/outside this scoped solver.
