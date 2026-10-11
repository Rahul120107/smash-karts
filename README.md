# Crossfire Karts

An original browser-based 3D kart combat game on Sunbreak Island, our single Smash Island-inspired arena, with Free For All as the only mode. Anonymous private rooms, eight players maximum, three-minute battles, twelve weapons/power-ups, authoritative damage and scores, respawning, and replay. Original procedural tropical scenery and sporty battle karts need no downloaded art or sound assets. No accounts, database, cosmetics, shops, or progression.

## Run locally

Requires Node.js **24.18.x** (tested with 24.18.0) and npm. Run commands from this repository root. `.node-version` and the Blueprint pin the tested runtime.

```sh
npm ci
npm run dev
```

Optionally copy `.env.example` to `.env` at the repository root before starting (`Copy-Item .env.example .env` in PowerShell). Both Node and Vite load that file; existing process environment variables take precedence. Open **http://localhost:5173**. Enter a nickname, create a room, and share its five-character code or invite link. A friend opens the same server, enters their nickname, and joins with the code. Only the host starts/restarts a match. A solo room can start for practice; there are no bots.

For two local players, use separate browser windows/tabs or an incognito window. For another computer on the same network, use `http://YOUR_LOCAL_IP:5173` on both computers. If using the example origin allowlist, add that exact LAN frontend origin to `ALLOWED_ORIGINS`. The dev server binds to all interfaces; the host's firewall must permit the chosen port. Room codes identify rooms on **the same running server**.

Production builds and optional combined local launch:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. With `SERVE_CLIENT=true` (default), this process serves the built client and WebSocket endpoint together. `npm run build:client` and `npm run build:server` also build independently for Render. For `NODE_ENV=production`, set `ALLOWED_ORIGINS` to the frontend's exact origin. The gameplay upgrade is checked locally. Updating an existing Render deployment requires rebuilding and deploying both services.

## Deploy to Render

The existing stack is preserved: a React/Vite Static Site and one Node Web Service. The Web Service owns every room and all gameplay state in memory. Use one instance, with autoscaling disabled. Choose a region close to the players. The Blueprint selects backend `plan: free` and retains the free Static Site (`runtime: static`, with no compute-plan field). No cloud resources have been created by this repository work. See Render's current [Blueprint specification](https://render.com/docs/blueprint-spec).

Free backends spin down after 15 minutes without inbound HTTP requests or WebSocket messages and can take about a minute to wake on the next connection. Existing client heartbeats/retries remain enabled. A process restart discards in-memory rooms and scores. Actual multiplayer performance on Render's free compute plan still requires hosted testing. See [Render's free hosting behavior](https://render.com/docs/free).

Prepare GitHub:

1. Run `npm ci --include=dev`, install Chromium with `npx playwright install chromium`, and run `npm run check` locally.
2. Use only **https://github.com/Rahul120107/smash-karts.git**, branch **main**. Verify `pwd`, `git remote -v`, `git branch --show-current`, and `git status`. Preserve the complete monorepo and its history; do not push `.env`, `node_modules`, or build output.
3. Fetch with `git fetch origin` and inspect `git log --oneline --all --decorate` and `git rev-list --left-right --count main...origin/main`. Integrate any remote changes without discarding either history, rerun validation, then `git push -u origin main`. Never force-push. Verify `git ls-remote origin refs/heads/main` equals `git rev-parse HEAD`.

Blueprint deployment:

1. In Render, select **New → Blueprint**, connect the GitHub repository, and use `render.yaml` from the repository root. Review the two services and chosen compute plan.
2. Supply `ALLOWED_ORIGINS` for the backend and `VITE_SERVER_URL` for the frontend. Use the actual public service URLs if already assigned. If creating both services for the first time and the URLs are unknown, enter `https://setup.invalid` for each prompted variable only to bootstrap creation. This intentionally cannot host playable games until step 3.
3. Once Render assigns URLs, set backend `ALLOWED_ORIGINS=https://YOUR-FRONTEND.onrender.com` and frontend `VITE_SERVER_URL=https://YOUR-BACKEND.onrender.com` in each service's **Environment** settings. These are placeholders to replace with the assigned URLs. Save/redeploy the backend and rebuild/deploy the frontend. `sync: false` prompts only on initial Blueprint creation; later URL changes must be made in service settings.
4. Confirm the backend's public `/health` returns HTTP 200 and `{"ok":true,...}`. Open the frontend's HTTPS URL and confirm **Server connected**. In browser developer tools, the WebSocket must connect to `wss://YOUR-BACKEND.onrender.com/ws` with status 101.
5. Automatic deploys are disabled in the Blueprint. Deploy manually between matches after running checks. All rooms are lost on backend restart/deployment. Keep protocol-compatible frontend/backend releases together.

For manual setup instead of a Blueprint, use the same GitHub repository for both services and **leave Root Directory blank** so workspace dependencies and shared source are available:

| Setting | Node Web Service | Static Site |
|---|---|---|
| Build command | `npm ci --include=dev && npm run build:server` | `npm ci --include=dev && npm run build:client` |
| Start command | `npm run start:server` | None |
| Publish directory | None | `client/dist` |
| Health check | `/health` | None |
| Instance count | `1`, autoscaling off | Managed static hosting |
| Runtime variable | `NODE_VERSION=24.18.0` | `NODE_VERSION=24.18.0` |
| Other variables | `NODE_ENV=production`, `HOST=0.0.0.0`, `SERVE_CLIENT=false`, `ROOM_CAPACITY=8`, `MATCH_SECONDS=180`, `ALLOWED_ORIGINS=<frontend HTTPS origin>` | `VITE_SERVER_URL=<backend HTTPS URL>` |

For manual creation, create the backend first with `ALLOWED_ORIGINS=https://setup.invalid`, then create the frontend using the assigned backend URL, and replace the backend allowlist with the assigned frontend origin. Add the static rewrite `/* → /index.html`. The Blueprint also sets no-cache for `/index.html` and immutable caching for hashed `/assets/*` files.

Render supplies `PORT`; do not override it. The backend binds to `0.0.0.0`. Render handles public TLS termination, so the Node server uses plaintext HTTP/WebSockets internally; browsers use HTTPS/WSS publicly. `VITE_SERVER_URL` is a public **build-time** value: changing it requires a new frontend build. It must use the backend's public HTTPS URL, not Render's private `fromService.host`. No secrets are needed. See [WebSockets on Render](https://render.com/docs/websocket) and [Node runtime selection](https://render.com/docs/node-version).

Rolling deployments can briefly run an old and a new process, even with one steady-state instance. In-memory rooms cannot migrate between them. Room continuity during deployments is not guaranteed; plan deployments outside active games. The backend sends close code 1012 on graceful shutdown, and the client explains that players must create/join a new room. See [Render deployment lifecycle](https://render.com/docs/deploys).

Test real multiplayer after deployment:

1. Open the **same frontend HTTPS URL** on two desktop/laptop devices, ideally on different networks. Enter distinct nicknames. Create a room on device A and join its code on device B.
2. Start as host, drive both karts, collect boxes, fire weapons, and confirm that positions, damage, ammo, explosions, scores, and the countdown agree. Confirm elimination/respawn, match completion, and replay.
3. Briefly disconnect device A's network, keeping device B connected. Device B should retain the room and receive host ownership. Restore A's network: it should automatically rejoin with a new temporary identity and zero score if the room survives. If everyone disconnected or the server restarted, create/join a new room.
4. Check Render logs for connection/room/match events and errors. Repeat with eight players and inspect CPU, memory, latency, and outbound bandwidth on the selected compute plan. Repeat these hosted acceptance checks after deploying the upgrade; local automation does not establish hosted performance.

Troubleshooting:

| Symptom | Check |
|---|---|
| Static build fails for missing/unsafe server URL | Set `VITE_SERVER_URL` to the public HTTPS backend root, then rebuild. Render builds intentionally fail without an explicit URL. Remove an obsolete `VITE_WS_URL`, which takes precedence. |
| HTTP 403 or WebSocket handshake fails | `ALLOWED_ORIGINS` must match the page's exact scheme, hostname, and port. Use comma-separated origins for multiple frontend domains; paths and wildcards are rejected. Restart the backend after editing. |
| Mixed-content error | Use HTTPS in `VITE_SERVER_URL`; the client converts it to WSS and rejects insecure sockets on HTTPS pages. |
| Backend cannot bind/start | Keep Root Directory at repository root, install dev dependencies for compilation, pin Node, and use `npm run start:server`. Check environment validation errors and Render's supplied `PORT`. |
| `npm ci` reports EPERM on Windows | Stop the local Vite/tsx development session before reinstalling; it can hold the esbuild executable open. Then rerun `npm ci --include=dev`. |
| Game shows connection failure | Check backend `/health`, its Render logs, frontend build variables, and the browser Network → WS panel. A transport that stops receiving replies is reset after about 14 seconds, followed by retries. |
| Room not found after reconnect | Last-player departure deletes the room, and backend restarts discard all state. Use the same backend for both devices and create a new room if necessary. Scores/identity are not restored. |
| Old frontend or missing assets | Rebuild/redeploy after URL changes; inspect asset requests and clear stale caches. All game geometry and audio are generated locally; there are no external asset downloads. |
| Slow gameplay | Measure the target device/GPU and server bandwidth. Software WebGL test results are not GPU benchmarks. Keep one backend instance; extra instances split room state. |

## Play

| Controls | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A / ←, D / → | Steer |
| Space (press once) | Activate one weapon use; machine gun runs its full burst |
| Shift (hold) | Drift with reduced lateral grip |

Drive through glowing gold boxes with an empty weapon slot to collect a random weapon. A collected box disappears immediately and returns at its original location after exactly **ten seconds of server simulation time** (600 ticks). Each box has an independent timer. Collection sparks and a glowing return animation mark the transitions. The server broadcasts pickup changes immediately, and snapshots include the active state and deadline so late joiners see the correct boxes. Inactive boxes cannot grant weapons; a new match resets every box. Unspent weapons are retained when driving over other boxes. Projectiles fire forward; the machine gun assists toward a visible enemy within its forward cone and leads its velocity. Its bullets still travel, have limited range, and can miss. Homing missiles select a nearby visible enemy ahead. Mines drop behind you. Watch the HUD for ammo, hull health, shield/boost time, respawn protection, match time, and scores. The minimap marks players, walls, and available boxes.

Press Space once for a complete 30-round automatic machine-gun burst. Other projectile weapons launch **one shot per press**, retaining their unused ammunition: rockets have three shots, homing missiles two, heavy bullets three, mines three, and the old cannon four. Bomb, blast missile and scatter spread each have one use. Invincibility, Orbit ram and boost activate their full durations. Release Space and press again after the cooldown to use another individual round; holding Space never repeats a use or activates a replacement pickup. Exhausted weapons leave the slot empty. Every automatic bullet recalculates assisted aim, so a burst can follow and switch valid enemies. The HUD shows reloading while another use is unavailable.

An elimination earns one point. Your own weapons can never damage you: direct hits, mines, delayed bombs and all explosions retain the original owner's ID and exclude that owner on the server. Enemy damage and environmental collisions remain active. **Everyone tied on the highest elimination score shares victory.** Fewer deaths/name/ID only order tied display rows. The server freezes winner IDs when time expires. Eliminated karts respawn after three seconds at a spawn far from living opponents, with two seconds of protection. Walls and terrain occlude splash damage. Ramps can launch a fast kart into the air.

Invincibility protects against damage for five seconds and eliminates an unprotected opponent on close contact. Orbit ram rotates three original spiked orbs around your kart for five seconds; its contact attack does not grant immunity. Contact range, height separation and obstacle visibility are checked by the server. Simultaneous unprotected orbit contacts resolve together, allowing both players to earn an elimination instead of favoring join order. Both powers expire independently of the consumed weapon slot and clear on death or replay.

Sunbreak Island retains the tested **112 × 112 unit** combat layout, approximately **2.4 times** the original arena area. A twelve-unit curved outer road connects wide lanes, open combat plazas and curved western shortcuts. Five ramps include a southern platform and a raised eastern river crossing with a flat wood deck and physical rails. A northern stone tunnel has a 12-unit corridor and four-unit clearance. Thirty independent pickups cover central, outer and elevated routes. Safe spawn positions, palm trunks, barriers, tunnel walls/ceiling and bridge rails share server/client geometry. Stone surfaces have tiny visual bevels inside conservative collider boxes.

The shallow river ford uses the solid ground floor; it is drivable water, not a drowning hazard. The bridge is a supported heightfield crossing, without an under-deck driving route. The tunnel adds a finite-height ceiling over the existing road. The solver still supports one driving floor at each coordinate. Mountains, coastal cliffs, most forest and the waterfall sit outside the battle boundary as scenery; the eight palms in combat areas have explicit shared trunk colliders. Ordinary driving does not enter distant mountain terrain.

## Island graphics, vehicles and audio

The environment includes a surrounding animated ocean, a shallow river/coastal stream, sandy shore, distant mountain chains, coastal waterfall/mist, palms, shrubs, flowers, clouds and atmospheric haze. Water uses original procedural wave/foam shaders without reflection/refraction framebuffer passes. Grass/asphalt and tyre tread use small generated textures. A tiny original sky cubemap supplies soft material reflections; one sun supplies 1024-pixel soft shadows refreshed at most 20 times/second. Scenery is batched by material, and repeated vegetation/clouds use eight instanced meshes. Environmental motes/mist have two separate 48-instance pools, so they cannot consume the combat particle budget.

Compact open-wheel karts have aerodynamic shells, side pods, front/rear wings, tire tread, spoke rims, arches, suspension links, lamps, exhausts and a driver. Server-assigned red/black, blue/white, green/graphite, purple/cyan and yellow/black paint uses the same hitbox and performance. Shared driving retains speed-sensitive steering, drift traction, bounded crest jumps and stable landings; throttle torque now tapers toward top speed and braking reaches zero before reverse. A damped **visual** spring adds landing compression, acceleration squat, braking pitch and cornering roll without modifying server physics. Wheels spin by travel speed and steer with the shared yaw rate.

The follow camera varies distance/FOV moderately with speed, clips against walls, finite-height tunnel ceilings and the ramp heightfield, and applies bounded contact/explosion shake. Pickup frames and glowing return halos preserve server-only ten-second activation. Collection bursts use the actual awarded weapon's color; mystery boxes remain neutral because assignment is random at collection. Cannon smoke/balls/fragments, missile steering/trails, bomb fuse sparks, shield flashes, boost exhaust and slip-driven tyre marks remain bounded and tied to authoritative state/events.

Foreground quality automatically drops pixel ratio from a 1.25 cap to 1 then 0.85, disables shadows and hides environmental particles after sustained slow frames. Known software adapters start with a 0.85 ratio and skip reflections/shadows/environmental particles to avoid compilation stalls. It does not use menu/background frame rates for quality decisions. Pickup boxes use four shared instanced draws while retaining independent animations/visibility. Idle menus render only on changes. No expensive full-scene postprocessing, paid services or external asset hosts were added.

Audio uses original Web Audio oscillator/noise synthesis and unlocks on the first click/key. Engine/tyre and ocean/waterfall/forest loops start once, then adjust pitch and volume instead of restarting. Tyres require actual ground slip; waterfall volume follows proximity; ambience stops in hidden/inactive gameplay. Landing/contact sounds are rate-limited and combat voices remain capped at twelve. Use Sound on/off in the HUD. Failure to initialize audio leaves gameplay functional.

## Architecture

```text
client/src/
  components/     React mount/lifecycle for the Three.js renderer
  game/           render loop, controls, follow camera
  maps/           procedural original arena
  vehicles/       procedural kart geometry
  weapons/        pickup and projectile models
  effects/        pooled geometry for particles; synthesized sounds
  networking/     WebSocket connection, prediction, reconciliation, interpolation
  ui/             nickname/rooms, lobby, HUD, final standings
server/src/
  rooms/          codes, capacity, membership, host transfer, idle cleanup
  simulation/     fixed-step world, spawns, pickups, lifecycle
  weapons/        activation handler registry and projectile behaviors
  combat/         damage, shields, blasts, elimination credit
  collisions/     swept terrain/wall collision
  networking/    HTTP/static server, WebSockets, input validation
shared/src/       contracts, arena geometry, movement, math, weapon tuning
tests/            unit, real WebSocket integration, two-session browser tests
```

The authoritative Node server advances at **60 Hz** and broadcasts snapshots at **20 Hz**. Clients send batches of three sequenced control commands, normally 20 packets/second, without position, damage, health, pickup, ammo, or score claims. The server consumes at most one command per player per tick. Input queues are capped, sequence repeats ignored, values validated, payloads limited to 4 KB, and traffic limited to 100 messages/second per socket. Stale inputs neutralize after 250 ms. Heartbeats disconnect unresponsive transports. Host ownership transfers when the host leaves. Empty rooms are immediately removed; non-playing rooms idle for ten minutes are evicted.

The local client predicts the shared movement function at 60 Hz, predicts contacts against bounded remote-body estimates, resets to each authoritative snapshot, discards acknowledged inputs, and replays pending inputs. Input sampling/prediction and packet batching run on a separate timer from rendering; a browser regression pauses animation frames and verifies that driving commands still reach the server. Remote estimates are disposable copies and never change server state. Render smoothing softens corrections. Remote karts interpolate across a 100 ms history; respawns snap instead of interpolating across the arena. Server-owned projectiles have bounded client visual extrapolation. Event IDs deduplicate effects and sounds.

Wire numbers are rounded to 0.001 units; server simulation retains full precision. Effects are transmitted once per client after the last successfully sent snapshot, with retained events available to a client whose snapshot was skipped due to backpressure. The client retains recent effects locally for HUD feedback. Snapshot encoding is cached for clients at the same event position.

Three.js is integrated directly with React instead of rendering every simulation tick through React components. React owns necessary menus/HUD; Three.js owns the animation loop and meshes. An external subscription store provides UI state without another state-management dependency. WebSockets use `ws` rather than Socket.IO because this small protocol needs only ordered messages and connection lifecycle handling.

**Physics choice:** a shared arcade circle-body solver and a vertical heightfield replace Rapier for this arena. This keeps server and client movement identical, avoids WASM initialization and full vehicle physics, and supports wall contacts, kart momentum exchange, slopes, gravity, braking, reverse, and controlled slides. Projectile collision sweeps complete segments against expanded wall boxes, kart spheres, and sampled terrain, preventing fast bullets from tunneling. This is intentionally an arcade approximation; it is not a general rigid-body engine.

## Stable driving, targeting and rendering

The flying-kart defect came from converting a ramp height discontinuity into upward velocity. Entering a ramp from its vertical side could generate **156 units/second** upward speed; normal slope motion also broke the old grounded check. The shared solver treats ramp sides as horizontal contacts and keeps supported motion at the terrain height with zero ballistic velocity. Genuine crest departures preserve jumps, limited to 6.5 units/second, followed by gravity and non-bouncing landings. Sampling the previous two approach grades prevents a step straddling the triangular crest from weakening its launch; a regression covers 64 starting alignments. Horizontal collision impulses use equal 180 kg arcade bodies and low restitution. Bicycle-model turn radius uses a 1.7-unit wheelbase, reduced high-speed wheel angles and a smoothed yaw rate for steering inertia. Grounded drift retains lateral momentum and regains grip on release; airborne steering/traction is reduced to 15%. Long steps subdivide, and invalid/out-of-arena states recover identically on server and client. The solver remains upright with stable heightfield support; chassis pitch and wheel contact animation provide suspension feedback without adding unstable vertical spring impulses.

Physics settings in `shared/src/config.ts` include `maxYawRate` (2.3 rad/s), `maxJumpVelocity` (6.5), `terminalVelocity` (22), `groundTolerance` (0.055), `groundSnapDistance` (0.2), `maxStepHeight` (0.18), `rampJumpSpeed` (10), `kartRestitution` (0.1), `wallRestitution` (0.08), and `recoveryHeight` (12). These are arcade world units.

Machine-gun assistance is configured by `WEAPONS.machineGun.aimAssist`: 28-unit range, 0.52-radian half-cone, 0.38-radian maximum correction, 0.4-second maximum lead, and 0.014-radian per-shot spread. The server selects targets after movement/collisions and again for every bullet in the automatic burst, checks walls and ramp terrain along current and predicted sightlines, and publishes the selected ID for the subtle HUD/turret cue. Bullet sweeps and damage remain server-owned; bullet travel and hit validation enforce the range even without a target. Protected/dead/out-of-cone/occluded targets are rejected and a changed opponent velocity can defeat the lead.

Kart body and static arena parts are merged by material. Models, asphalt grain, road paint, cargo props, trees, sky, pickups and sounds are original procedural assets. Effects use 512 particle instances, 256 tyre marks and 16 shock rings, costing at most three effect draw calls. Shadows use one 1024 map refreshed at up to 20 Hz during games. Menu/lobby/results use a static arena view that redraws on scene/phase/resize changes, rather than continuously consuming GPU time. Raster pixel ratio is capped at 1.25 and drops to 1 for slow foreground matches; after three consistently slow samples it drops to 0.85 with lightweight contact shadows. This changes rendering quality only. Renderer statistics are exposed as attributes on `.game-canvas` for browser tests, without a gameplay debug panel.

Engine/harmonic oscillators and a looping tyre-noise source start once after audio unlock. Smooth gain/pitch changes follow speed/load and actual grounded sideways slip. Parked, straight-driving and airborne karts do not produce drift sound or marks. Every weapon has an original synthesized envelope in `client/src/effects/weapon-audio.ts`; combat sounds have a 12-voice budget, contact sounds are rate-limited, and shield/boost activation avoids duplicate firing audio. Continuous shield contact feedback is limited to one pulse per 150 ms per attacker/target pair without delaying enemy damage. HUD health, speed/slip, ammo/reloading, target feedback, final-seconds countdown, live standings, kill feed and shared-victory results share a responsive arcade style with reduced-motion support.

## Updating the existing Render deployment

1. Run `npm run check` and `npm run benchmark`, then commit the verified release. Verify `origin` is `https://github.com/Rahul120107/smash-karts.git` before pushing `main`.
2. Keep the backend **Free**, with one instance, and the frontend as the free Static Site. The existing Blueprint needs no plan or environment changes for this upgrade.
3. With automatic deploys disabled, manually deploy the backend's release using `npm run build:server` / `npm run start:server`, then rebuild/deploy the Static Site using `npm run build:client` and `client/dist`. Both services must use the same release: this update changes shared map geometry, driving state and weapon definitions. Deploy between matches, and reload browser clients after both services finish, because rooms live in process memory. Keep the existing exact HTTPS `ALLOWED_ORIGINS` and `VITE_SERVER_URL`.
4. Verify `/health`, then run the two-device acceptance checks above. Confirm a collected box disappears on both devices, stays inactive for ten simulation seconds, and returns at its original position; join during cooldown to check late-join state. Drive into ramp sides, jump over a ramp crest, drift at speed, and check machine-gun tracking against a moving enemy and behind a wall. Confirm both devices agree on health, ammo and scores.

## Configuration and balancing

Global simulation tuning is in `shared/src/config.ts`; map walls, ramps, spawns, and pickups are in `shared/src/arena.ts`; weapon values are in `shared/src/weapons.ts`. Every initial weapon has an activation handler and server trajectory/collision behavior.

| Weapon | Uses/ammo | Cooldown | Damage | Behavior |
|---|---:|---:|---:|---|
| Machine gun | 30 | 0.105 s | 12 | Complete automatic burst; 76 units/s, 28-unit range, cone assistance, velocity lead and slight spread |
| Rocket | 3 | 0.65 s | 72 max | One per press; 32 units/s, 5.5-unit blast |
| Homing missile | 2 | 0.85 s | 65 max | One per press; visible unprotected target within 36 units, configured turn response, 4.5-unit blast |
| Mine | 3 | 0.6 s | 85 max | One per press; 0.7 s arming delay, enemy proximity, 5-unit blast, expires at 22 s |
| Bomb | 1 | 0.75 s | 90 max | Gravity-driven lob and bounce, 1.6 s fuse, 6-unit blast |
| Invincibility | 1 | 0.2 s | 100/contact | Prevents damage for 5 s; 1.95-unit contact range |
| Speed boost | 1 | 0.5 s | — | 55% higher top speed for 4 s |
| Scatter blaster | 1 | 0.55 s | 22/pellet | Five-projectile spread per activation |
| Old cannon | 4 | 0.8 s | 78 max | One 0.44-radius iron cannonball per press; 26 units/s, gravity-driven arc, 5-unit blast, heavy smoke/audio |
| Heavy bullets | 3 | 0.3 s | 45 | One straight shot per press; 64 units/s, no aim assist or splash |
| Blast missile | 1 | 0.9 s | 140 max | Larger slow missile, 19 units/s, 10-unit blast |
| Orbit ram | 1 | 0.4 s | 100/contact | Rotating contact attack for 5 s; 2.6-unit range, no damage immunity |

Blast damage falls linearly to 30% at the configured outer radius. The server owns randomness, ammunition, activation times, lifetimes, collision, damage, and cleanup. No client-only hit or elimination endpoint exists.

| Environment variable | Default | Use |
|---|---|---|
| `PORT` | `3001` | Node HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Server bind address |
| `MATCH_SECONDS` | `180` | Match duration, integer 5–3600 |
| `ROOM_CAPACITY` | `8` | Room capacity, integer 2–8; cannot exceed eight |
| `NODE_ENV` | unset | `production` requires an explicit origin allowlist and forces public binding |
| `SERVE_CLIENT` | `true` | `false` for the separate Render backend; health/WebSockets remain available |
| `ALLOWED_ORIGINS` | unset locally | Exact comma-separated HTTP(S) origins; required in production; controls HTTP CORS and WebSocket upgrades |
| `VITE_SERVER_URL` | same host `/ws` locally | Build-time public backend root or `/ws`; required on Render; HTTPS converts to WSS |
| `VITE_WS_URL` | unset | Legacy explicit WebSocket override; takes precedence if set |
| `NODE_VERSION` | `.node-version` | Render runtime pin, `24.18.0` |

PowerShell example: `$env:MATCH_SECONDS='60'; npm run dev`. The development proxy reads `PORT` automatically. Server configuration requires a restart, while shared movement/weapon/map changes require rebuilding both packages. Native non-browser WebSocket tools must also supply an allowed `Origin` when the allowlist is enabled; `/health` works without an Origin for Render's health checker.

## Verification

```sh
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run test:production
npm run benchmark
# Optional rendering profile after building (creates local test-results artifacts):
npx tsx scripts/profile-rendering.ts
# Windows hardware adapter attempt; explicitly reports unavailable if no hardware WebGL exists:
npx tsx scripts/profile-rendering.ts --hardware
```

`npm run check` runs build, unit/integration tests, browser tests, and compiled production smoke tests in sequence. Browser tests use the **built production client**, independent browser contexts, an ephemeral real Node server, and actual keyboard input. Rebuild before running browser tests after client changes. The HTTPS test generates a temporary self-signed certificate using OpenSSL; install OpenSSL or set `OPENSSL_BIN` to its executable (Windows defaults to Git for Windows' bundled executable). Certificates are temporary test assets. Browser screenshots, performance attachments, and failure traces go in `test-results/`.

Coverage includes room creation/joining, invalid rooms, forced duplicate codes, capacity, host-only starts, disconnect cleanup and transfer, every weapon, cooldown/ammo/death restrictions, swept collision, wall occlusion, splash radius/falloff, shield expiry, pickup contention/respawn, elimination credit, respawn protection, timers/replay, network validation, actual multi-client combat, prediction replay, and remote interpolation. Weapon browser scenarios use local in-process server fixtures to arrange repeatable shots; fixture access is absent from the production protocol.

See [AUDIT.md](AUDIT.md) for the current audit findings and test evidence, and [PROGRESS.md](PROGRESS.md) for milestones.

Latest **`npm run check` passed** TypeScript, both production builds, **259 unit/integration tests across 17 files**, **all 13 Chromium scenarios** (5.9 minutes), and compiled eight-client production smoke. The reference-informed release adds 47 test cases: all twelve weapons and owner immunity, retained single-shot inventory, cooldown/held-key behavior, new projectile/contact damage, simultaneous contact fairness, bounded shield feedback, frozen shared winners, enforced eight-player capacity, terrain-blocked homing/muzzles/splash, full-height ceiling prediction and distinct synthesized voices. Existing checks retain flat/ramp/drift stability, bridge/tunnel routes, camera avoidance, geometry/materials, bounded pools, exact ten-second pickup deadlines, contested collection and late joining, timers/health/respawn/replay, 120 ms latency, reconnect, eight concurrent rendered browsers and separate HTTPS/WSS origins. Browser screenshots of the lobby and Orbit ram combat were inspected. Production smoke covers the compiled entry, port/public binding, CORS/health, eight clients, combat/snapshots, match lifecycle and disconnect/rejoin. Its Windows shutdown harness invokes the SIGTERM handler through IPC; actual Linux signal delivery is not claimed.

Local graphics measurements on **2026-10-12**, Windows, Intel **i5-1334U**, **15.7 GiB RAM**:

| Renderer/workload | Viewport | FPS | Mean / p95 frame time | Sampled draws / triangles |
|---|---|---:|---|---|
| Intel Iris Xe, D3D11; one rendered browser + seven native peers; full quality | 1920×1080 | 60.07 | 16.65 / 16.70 ms | 151 / 51,564 |
| SwiftShader; one rendered browser + seven native peers; compatibility quality | 1920×1080 | 4.91 | 203.81 / 350.00 ms | 94 / 41,218 |
| SwiftShader; eight rendered browsers; compatibility quality | 640×720 each | 1–2 each | Maximum frame gaps 733–867 ms | 71–142 / 38,554–47,642 |

The hardware result is a five-second moving-camera sample after six seconds of warmup, with shadows/reflections enabled and no renderer errors. It is not a whole-map, worst-case combat, eight-device or Render/WAN benchmark. The software runs verify functionality and bounds; they are not hardware GPU results and do not meet the frame-rate goals. Machine-readable current evidence is in [docs/performance-2026-10-12.json](docs/performance-2026-10-12.json); the [previous report](docs/performance-2026-10-11.json) is retained for history. Random weapons and camera framing differ between samples, so these runs do not establish a controlled performance improvement. Reproduce measurements with the optional profiling script above.

The benchmark simulates a three-minute match with eight karts continuously attacking and instantly receiving replacement weapons, intentionally heavier combat than normal pickup-limited play. Alternating press/release controls activate successive uses without bypassing cooldowns. The final local run after browser/profiling checks completed in **564 ms**, with **0.131 ms p95** tick plus snapshot cost, **28** peak projectiles, **7,704-byte** average snapshots and **14** eliminations. Estimated outbound payload is **1,204 KiB/s** per eight-player room, excluding transport overhead and extra pickup-transition broadcasts. The new weapon mix changes this workload. These measurements do not establish Render capacity or browser frame rate.

## Reference and limits

Smash Karts is a gameplay inspiration. Public publisher documentation and an official-game menu inspection informed this release; exact driving parameters, projectile speeds, targeting internals and Smash Island geometry were not measured. See [reference findings and deliberate differences](docs/reference-gameplay.md). Pickup timing, combat tuning, hit volumes, occlusion and arena layout use independent implementation choices. No proprietary code, models, branding, sounds, or downloaded game assets are used. Three.js and Vite integration was checked against their [renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) and [server/proxy documentation](https://vite.dev/config/server-options).

The two supplied visual references were available as descriptions only; no reference image files were accessible in the workspace. Island geometry, kart shapes, textures, shaders and sounds are original. This is an optimized stylized release, with distant scenic mountains rather than a fully traversable mountainous world. Multi-level overlapping driving floors, deep-water traversal and physically simulated wheel suspension remain outside the current solver. Mystery pickup boxes retain random assignment, with weapon-specific colors shown on collection and in the HUD.

This is a single-process, in-memory multiplayer server. Restarting it discards rooms. A reconnect creates a new temporary player identity and rejoins the room if other players kept it alive; scores are not restored. Desktop keyboard input and WebGL are required. Touch/gamepad controls and horizontal scaling are outside this build. Render configuration and local HTTPS/WSS tests are ready; deployment of this upgrade and real WAN/two-device acceptance remain unverified. Prediction corrects against server authority without historical projectile rewind. Full snapshots favor clarity at this eight-player scale; larger deployments need bandwidth profiling and room routing. Audible quality and handling preference need human playtesting.
