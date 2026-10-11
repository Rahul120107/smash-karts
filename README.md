# Crossfire Karts

An original browser-based 3D kart combat game. Anonymous private rooms, up to eight players by default, three-minute arena battles, eight weapons/power-ups, authoritative damage and scores, respawning, and replay. No accounts, database, cosmetics, shops, or progression.

## Run locally

Requires Node.js **22.12+ or 24+** and npm. Run commands from this repository root.

```sh
npm ci
npm run dev
```

Open **http://localhost:5173**. Enter a nickname, create a room, and share its five-character code or invite link. A friend opens the same server, enters their nickname, and joins with the code. Only the host starts/restarts a match. A solo room can start for practice; there are no bots.

For two local players, use separate browser windows/tabs or an incognito window. For another computer on the same network, use `http://YOUR_LOCAL_IP:5173` on both computers. The dev server binds to all interfaces; the host's firewall must permit the chosen port. Room codes identify rooms on **the same running server**.

Production build and single-server launch:

```sh
npm run build
npm start
```

Open **http://localhost:3001**. This process serves the built client and WebSocket endpoint together; Vite is unnecessary in production. Public hosting requires a persistent Node process and an HTTPS reverse proxy that forwards `/ws` WebSocket upgrades. This project has not been deployed to a public host.

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
| `ALLOWED_ORIGINS` | unset | Optional comma-separated WebSocket origin allowlist |
| `VITE_WS_URL` | same host `/ws` | Build-time client WebSocket URL override |

PowerShell example: `$env:MATCH_SECONDS='60'; npm run dev`. The development proxy expects port 3001; changing the server port also requires updating `client/vite.config.ts`. Server configuration does not require rebuilding; shared movement/weapon/map changes do.

## Verification

```sh
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run benchmark
```

`npm run check` runs build, unit/integration tests, and browser tests in sequence after Chromium is installed. Browser tests use the **built production client**, independent browser contexts, an ephemeral real Node server, and actual keyboard input. Rebuild before running browser tests after client changes. Browser screenshots and failure traces go in `test-results/`.

Coverage includes room creation/joining, invalid rooms, forced duplicate codes, capacity, host-only starts, disconnect cleanup and transfer, every weapon, cooldown/ammo/death restrictions, swept collision, wall occlusion, splash radius/falloff, shield expiry, pickup contention/respawn, elimination credit, respawn protection, timers/replay, network validation, actual multi-client combat, prediction replay, and remote interpolation. Weapon browser scenarios use local in-process server fixtures to arrange repeatable shots; fixture access is absent from the production protocol.

See `PROGRESS.md` for current executed results and outstanding checks.

Verification passed the production build, **58 unit/integration tests**, and **four Chromium browser scenarios**. Unit/integration tests exercised eight simultaneous WebSocket clients. Browser scenarios verified all eight weapons, two-player elimination/respawn/replay, and 120 ms simulated network round-trip delay. After the final sound-button focus fix, the rebuilt two-browser flow passed again, including driving immediately after toggling audio. The compiled production server also passed an HTTP smoke test; dependency audit reported zero vulnerabilities. Browser scenarios run with software WebGL in this environment, so these results do not imply a frame-rate guarantee on a particular device.

The benchmark simulates a three-minute match with eight karts continuously firing and instantly receiving replacement weapons, intentionally heavier combat than normal pickup-limited play. On this development machine, the optimized run completed in 598 ms, with a 0.136 ms 95th-percentile tick plus snapshot cost, 63 peak active projectiles, and approximately 10 KB average snapshots. The estimate is about 1.5 MiB/s total outbound payload per eight-player room under that synthetic workload, excluding transport overhead. These local measurements do not establish public-host capacity or browser frame rate.

## Reference and limits

Smash Karts is a gameplay inspiration only. Direct interactive inspection of the reference game was not performed. Pickup pacing, acceleration/turning, weapon balance, hit volumes, blast occlusion, respawn protection, and arena layout are original design assumptions, not claims of exact reproduction. No proprietary code, models, branding, sounds, or downloaded game assets are used. Three.js and Vite integration was checked against their [renderer documentation](https://threejs.org/docs/pages/WebGLRenderer.html) and [server/proxy documentation](https://vite.dev/config/server-options).

This is a single-process, in-memory multiplayer server. Restarting it discards rooms. A reconnect creates a new temporary player identity and rejoins the room if other players kept it alive; scores are not restored. Desktop keyboard input and WebGL are required. Touch/gamepad controls, horizontal scaling, public Internet hosting, and testing on every GPU/browser are outside this build. Prediction corrects against server authority; it does not implement historical lag-compensated projectile rewind. Full snapshots favor clarity at this eight-player scale; larger deployments would need bandwidth profiling and shared room routing. No production-scale or real Internet WAN performance claim is made.
