# Weapon verification record — 13 October 2026

These are actual Crossfire results, not proof of frame-perfect reference parity.
See [reference evidence](REFERENCE_WEAPONS.md), [behavior matrix](WEAPON_BEHAVIOR_MATRIX.md)
and [differences](MECHANICS_COMPARISON.md).

## Release checks

- TypeScript checking and both client/server production builds passed.
- Final complete unit/integration suite passed **410/410 tests across 24 files**
  in **35.19 seconds** with one worker and no concurrent browser load.
- The complete Chromium suite passed **15/15 scenarios in 6.0 minutes**.
- Final all-13-weapon visual/combat scenario passed again in **1.3 minutes** after
  the last model/material changes; charged previews and armed trap captures included.
- Compiled production server smoke passed with **eight actual WebSocket clients**:
  CORS/health, pickup/activation, identical authoritative snapshots, timer/replay,
  disconnect/rejoin, host transfer and graceful shutdown handler.
- Developer-only calibration executed all 13 categories with isolated pickups;
  all configured inventories were consumed. Raw timings, muzzles, velocities,
  damage, wall/ramp/moving-target scenarios and prediction corrections are saved in
  [mechanics-calibration.json](docs/mechanics-calibration.json).

## Coverage matrix

| Coverage | Automated evidence | Limits |
|---|---|---|
| All 13 weapon activation/ammo/expiry rules | activation, combat, weapon-fidelity; actual all-category browser combat | Control choices use documented history/configurable assumptions |
| Standing, forward, reverse, left/right, drift, airborne, ramp activation | 104 weapon/state combinations in eight parameterized fidelity cases | Not a full Cartesian product of every latency and obstacle arrangement |
| Front/rear local-to-world mounts | Six heading angles, moving/reversing/drifting/airborne poses, fake-box rear mount; Three.js/server attachment comparison | Cosmetic suspension is separate from gameplay transform |
| MG duration/count and retargeting | 166 rounds over exactly 6.5 s between first/last launch; cone/range/LOS, predictive movement, spread, range expiry, wall rejection | Reference acquisition/damage curves have no controlled recordings |
| Standard bullet grouping | Nine three-projectile groups, 27 total, straight/no lock, partial group rejection | Exact reference intra-group timing unknown |
| Rockets and homing | Three independent rocket launches; bounded steering, speed preservation, valid retargeting, impacts and splash | No claim of measured reference launch speeds |
| Cannon | Charged/released four-ball salvo while turning; shared muzzle/profile, inherited motion, gravity, range growth, swept walls/terrain/karts | Charge curve and damage remain estimates |
| Grenuke | Ordinary-ground survival, bounce/settle, direct swept hits, armed proximity, fuse expiry, LOS, no owner damage | Live fuse/bounce/proximity thresholds unknown |
| Mines / fake loot | Rear ground/bridge placement, arm delay, enemy-only trigger, mine spacing/timeout, original owner/weapon after disconnect | Exact reference airborne trap placement unknown |
| Orbit / Star | Five stable sphere centers in two draws, swept contacts, hit cooldown/knockback, armor, speed, protection, expiry, prediction agreement | Orbit 38 damage deliberately differs from reported lethal reference contact |
| Damage and eliminations | Direct/splash/contact/terrain LOS, shield/protection, owner immunity, simultaneous contacts, unique killer/victim/weapon events and messages | Departed players retain event attribution but cannot receive a live notification |
| Multiplayer | Real two-peer burst/rocket/targeting tests; eight peers, late joins, invalid hit/target claims; eight rendered clients; 120 ms simulated RTT; HTTPS/WSS | Real WAN/hosted Render acceptance not performed |
| Keyboard/mobile | Focused HUD Space, WASD/arrows+steer+drift+fire, repeat suppression, quick taps, multitouch accelerator/fire and hold/release | Mobile Chromium emulation, not physical mobile hardware |
| Models/VFX/audio | Original geometry budgets, instanced batches, bounded particle/voice pools, all 13 sound signatures, unlock/resume/lifecycle; real screenshots | Human listening and exhaustive frame-by-frame VFX review not performed |
| Roads/map collision | Graph connectivity, all edges both ways plus full circuit, bridge traversal/slab underside, tunnel clearance, ramps, reachable pickups, boost cooldown/nonstack | Referenced island image was unavailable |

## Corrected verification failures

Old fixtures assumed the removed lava/platform map, 30 MG shots, assisted standard
slugs and grenades bouncing off opponents. They were updated to the specified
mechanics and actual shared island heights. One broad test timing replacement was
corrected; fuse events are observed on their authoritative event tick, not after
the event delta has been discarded. New grenade/Nuke materials initially exceeded
the three-draw projectile budget; shared materials restored it.

One full suite under concurrent browser CPU load timed out in the synthetic
three-minute simulation. A quiet one-worker full rerun passed **402/402** without
altering physics or raising test timeouts. New supplemental scenarios passed
**26/26 fidelity tests**; the expanded final suite passed **410/410** as recorded above.

## Measured performance

The isolated hardware sample used one rendered browser and seven native network
peers, 1920×1080, Intel Iris Xe D3D11, i5-1334U, 15.7 GiB RAM, six-second warmup
and five-second measurement. Result: **60.22 FPS**, **16.61 ms mean / 16.80 ms p95**,
**107 draw calls**, **58,490 triangles**, full quality, no renderer errors.
Raw report: [performance-fidelity-hardware.json](docs/performance-fidelity-hardware.json).
This is not eight rendered devices, a worst-case all-weapon stress test, or a
physical-mobile guarantee.

The isolated synthetic eight-player, three-minute authoritative match completed
in **1,296 ms**; tick plus periodic snapshot p95 **0.299 ms**; **56** peak projectiles;
**12,758-byte** mean snapshots; estimated room outbound **1,993 KiB/s**, excluding
transport overhead. The fixture supplies replacement weapons faster than normal
pickup-limited play. These development-machine figures do not establish hosted
Render capacity. Raw report: [performance-fidelity-simulation.json](docs/performance-fidelity-simulation.json).

Vegetation/static scenery, pickups and projectile types use shared/instanced draws.
Five maces use two draws per active kart; particles, skids, shockwaves and voices
are bounded. Low/Auto reduce optional effects/resolution/shadows; collision geometry
never changes with graphics quality. There are no new runtime dependencies, paid
services, fluid simulation or deployment architecture changes.

## Captures and remaining acceptance

Actual captures are in [docs/weapon-review](docs/weapon-review), including all 13
weapon states, cannon/Grenuke aiming, armed traps, attacker/victim notifications
and the hardware gameplay view. Fast projectiles may have impacted before a still
capture; motion/collision is verified in automated scenarios, not inferred from a PNG.
Island overview, turn, bridge, tunnel, waterfall and boost captures are retained in
[docs/sunset-review](docs/sunset-review).

Remaining: controlled reference recordings with known frame rate/world calibration,
current-live count/control/damage measurements, physical-mobile acceptance, human
audio listening, sustained worst-case GPU/WAN testing, the absent map reference
image comparison and live Render deployment acceptance. Windows production smoke
invokes the SIGTERM handler via IPC; actual Linux signal delivery is not claimed.
No 100% reference-accuracy statement is made.
