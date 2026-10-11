# Crossfire Karts

An original browser-based 3D kart combat game. Anonymous private rooms, up to eight players by default, three-minute arena battles, eight weapons/power-ups, authoritative damage and scores, respawning, and replay. No accounts, database, cosmetics, shops, or progression.

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

Open **http://localhost:3001**. With `SERVE_CLIENT=true` (default), this process serves the built client and WebSocket endpoint together. `npm run build:client` and `npm run build:server` also build independently for Render. For `NODE_ENV=production`, set `ALLOWED_ORIGINS` to the frontend's exact origin. This project has passed local production-readiness checks and has not been deployed to Render.

## Deploy to Render

The existing stack is preserved: a React/Vite Static Site and one Node Web Service. The Web Service owns every room and all gameplay state in memory. Use one instance, with autoscaling disabled. Choose a region close to the players. The Blueprint selects backend `plan: free` and retains the free Static Site (`runtime: static`, with no compute-plan field). No cloud resources have been created by this repository work. See Render's current [Blueprint specification](https://render.com/docs/blueprint-spec).

Free backends spin down after 15 minutes without inbound HTTP requests or WebSocket messages and can take about a minute to wake on the next connection. Existing client heartbeats/retries remain enabled. A process restart discards in-memory rooms and scores. Actual multiplayer performance on Render's free compute plan still requires hosted testing. See [Render's free hosting behavior](https://render.com/docs/free).

Prepare GitHub:

1. Run `npm ci --include=dev`, install Chromium with `npx playwright install chromium`, and run `npm run check` locally.
2. Create an empty GitHub repository and push the complete monorepo, including `package-lock.json`, `render.yaml`, `.node-version`, and `.env.example`. Do not push `.env`, `node_modules`, or build output; they are ignored.
3. If no remote exists, run `git remote add origin https://github.com/YOUR-OWNER/YOUR-REPO.git`, then `git push -u origin HEAD`. Check `git remote -v` first if the repository already has a remote. This workspace currently has no remote configured.

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
4. Check Render logs for connection/room/match events and errors. Repeat with eight players and inspect CPU, memory, latency, and outbound bandwidth on the selected compute plan. This hosted acceptance test has not yet been executed.

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
| Space (hold) | Activate/fire the equipped weapon |
| Shift (hold) | Drift with reduced lateral grip |

Drive through glowing gold boxes with an empty weapon slot to collect a random weapon. A collected box disappears for seven seconds. Unspent weapons are retained when driving over other boxes. Projectiles fire forward along the kart's heading; homing missiles select a nearby visible enemy ahead. Mines drop behind you. Watch the HUD for ammo, hull health, shield/boost time, respawn protection, match time, and scores. The minimap marks players, walls, and available boxes.

An elimination earns one point; self-eliminations do not. Tied scores are ordered by fewer deaths; a tie on both is a shared victory. Eliminated karts respawn after 2.5 seconds at a spawn far from living opponents, with two seconds of protection. Splash damage can hurt the firing player. Walls occlude splash damage. Ramps can launch a fast kart into the air.

Audio uses original Web Audio oscillator/noise synthesis and unlocks on the first click/key. Use Sound on/off in the HUD. Failure to initialize audio leaves gameplay functional.

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

The local client predicts the shared movement function at 60 Hz, resets to each authoritative snapshot, discards acknowledged inputs, and replays pending inputs. Render smoothing softens corrections. Remote karts interpolate across a 100 ms history; respawns snap instead of interpolating across the arena. Server-owned projectiles have bounded client visual extrapolation. Event IDs deduplicate effects and sounds.

Wire numbers are rounded to 0.001 units; server simulation retains full precision. Effects are transmitted once per client after the last successfully sent snapshot, with retained events available to a client whose snapshot was skipped due to backpressure. The client retains recent effects locally for HUD feedback. Snapshot encoding is cached for clients at the same event position.

Three.js is integrated directly with React instead of rendering every simulation tick through React components. React owns necessary menus/HUD; Three.js owns the animation loop and meshes. An external subscription store provides UI state without another state-management dependency. WebSockets use `ws` rather than Socket.IO because this small protocol needs only ordered messages and connection lifecycle handling.

**Physics choice:** a shared arcade circle-body solver and a vertical heightfield replace Rapier for this arena. This keeps server and client movement identical, avoids WASM initialization and full vehicle physics, and supports wall contacts, kart momentum exchange, slopes, gravity, braking, reverse, and controlled slides. Projectile collision sweeps complete segments against expanded wall boxes, kart spheres, and sampled terrain, preventing fast bullets from tunneling. This is intentionally an arcade approximation; it is not a general rigid-body engine.

## Configuration and balancing

Global simulation tuning is in `shared/src/config.ts`; map walls, ramps, spawns, and pickups are in `shared/src/arena.ts`; weapon values are in `shared/src/weapons.ts`. Every initial weapon has an activation handler and server trajectory/collision behavior.

| Weapon | Uses/ammo | Cooldown | Damage | Behavior |
|---|---:|---:|---:|---|
| Machine gun | 30 | 0.105 s | 12 | 76 units/s bullets, repeated while held |
| Rocket | 3 | 0.65 s | 72 max | 32 units/s, 5.5-unit blast |
| Homing missile | 2 | 0.85 s | 65 max | Visible target within 36 units, configured turn response, 4.5-unit blast |
| Mine | 3 | 0.6 s | 85 max | 0.7 s arming delay, enemy proximity, 5-unit blast, expires at 22 s |
| Bomb | 3 | 0.75 s | 90 max | Gravity-driven lob and bounce, 1.6 s fuse, 6-unit blast |
| Shield | 1 | 0.2 s | — | Prevents damage for 5 s |
| Speed boost | 2 | 0.5 s | — | 55% higher top speed for 4 s |
| Scatter cannon | 5 | 0.55 s | 22/pellet | Five bullets in a defined angular fan |

Blast damage falls linearly to 30% at the configured outer radius. The server owns randomness, ammunition, activation times, lifetimes, collision, damage, and cleanup. No client-only hit or elimination endpoint exists.

| Environment variable | Default | Use |
|---|---|---|
| `PORT` | `3001` | Node HTTP and WebSocket port |
| `HOST` | `0.0.0.0` | Server bind address |
| `MATCH_SECONDS` | `180` | Match duration, integer 5–3600 |
| `ROOM_CAPACITY` | `8` | Room capacity, integer 2–16 |
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
```

`npm run check` runs build, unit/integration tests, browser tests, and compiled production smoke tests in sequence. Browser tests use the **built production client**, independent browser contexts, an ephemeral real Node server, and actual keyboard input. Rebuild before running browser tests after client changes. The HTTPS test generates a temporary self-signed certificate using OpenSSL; install OpenSSL or set `OPENSSL_BIN` to its executable (Windows defaults to Git for Windows' bundled executable). Certificates are temporary test assets. Browser screenshots, performance attachments, and failure traces go in `test-results/`.

Coverage includes room creation/joining, invalid rooms, forced duplicate codes, capacity, host-only starts, disconnect cleanup and transfer, every weapon, cooldown/ammo/death restrictions, swept collision, wall occlusion, splash radius/falloff, shield expiry, pickup contention/respawn, elimination credit, respawn protection, timers/replay, network validation, actual multi-client combat, prediction replay, and remote interpolation. Weapon browser scenarios use local in-process server fixtures to arrange repeatable shots; fixture access is absent from the production protocol.

See [AUDIT.md](AUDIT.md) for the current audit findings and test evidence, and [PROGRESS.md](PROGRESS.md) for milestones.

The final check passed **99 unit/integration tests** and **all seven Chromium browser scenarios**, plus the compiled eight-client production smoke. The audit verifies all eight weapons, two-player elimination/respawn/replay, 120 ms simulated round-trip delay, browser transport recovery, HTTPS/WSS across separate origins, and eight simultaneous browser/input clients. The eight-browser software-WebGL run recorded about 2 animation frames/second per client at 640×720, so it verifies functionality rather than smooth physical-device performance. `npm run test:production` also checks configured port/binding, CORS, health, snapshots, pickups/weapons, match completion, replay, disconnect/rejoin, and graceful shutdown. On Windows it invokes the SIGTERM handler through a local IPC harness; actual Linux signal delivery is not claimed. Details are recorded in `AUDIT.md`.

The benchmark simulates a three-minute match with eight karts continuously firing and instantly receiving replacement weapons, intentionally heavier combat than normal pickup-limited play. The audited local run completed in 639 ms, with a 0.146 ms p95 tick plus snapshot cost, 63 peak projectiles, and 10,199-byte average snapshots. Estimated outbound payload is 1,594 KiB/s per eight-player room under that workload, excluding transport overhead. These measurements do not establish Render capacity or browser frame rate.

## Reference and limits

Smash Karts is a gameplay inspiration only. Direct interactive inspection of the reference game was not performed. Pickup pacing, acceleration/turning, weapon balance, hit volumes, blast occlusion, respawn protection, and arena layout are original design assumptions, not claims of exact reproduction. No proprietary code, models, branding, sounds, or downloaded game assets are used. Three.js and Vite integration was checked against their [renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) and [server/proxy documentation](https://vite.dev/config/server-options).

This is a single-process, in-memory multiplayer server. Restarting it discards rooms. A reconnect creates a new temporary player identity and rejoins the room if other players kept it alive; scores are not restored. Desktop keyboard input and WebGL are required. Touch/gamepad controls and horizontal scaling are outside this build. Render configuration and local HTTPS/WSS tests are ready; actual Render deployment, real WAN behavior, and testing across physical devices/GPUs remain unverified. Prediction corrects against server authority without historical projectile rewind. Full snapshots favor clarity at this eight-player scale; larger deployments need bandwidth profiling and room routing.
