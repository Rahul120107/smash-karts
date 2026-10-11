# Reference review — 2026-10-12

Crossfire Karts keeps its React/Three.js/TypeScript/ws architecture. This release compares existing mechanics with public gameplay descriptions, rather than downloading or reverse engineering proprietary game files. All models, map geometry, textures, shaders and synthesized sounds remain independently authored.

## Sources and observation limits

- [Official Smash Karts](https://smashkarts.io/): opened in a 1280×720 Chromium browser and inspected the rendered menu. Anonymous play/create/join controls and a compact third-person kart presentation were visible. A later Create click did not leave the menu in that run. No playable Smash Island session, driving telemetry, weapon inventory sequence or audio timing was measured. Local reference screenshots are ignored test artifacts, not shipped assets.
- [Tall Team's game on Poki](https://poki.com/en/g/smash-karts): documents three-minute matches, elimination-based Free For All scoring, three-second respawning, randomized weapons, private games, straight bullets, heavy cannon shots, large explosives, mines, rotating contact attacks and temporary invincibility. This supports the mode, duration, respawn and broad attack categories; its description does not establish exact simulation tuning or targeting algorithms.
- [Tall Team's game on CrazyGames](https://www.crazygames.com/game/smash-karts): describes rapid nearby machine-gun fire, forward rockets, straight bullets, three mines, four cannonballs, rotating contact attacks, a wide-radius missile, delayed ground explosives and invincibility with offensive contact. Counts inform mine/cannon inventories. Descriptions alone do not establish whether each inventory fires automatically, exact projectile trajectories or damage values.

## Implemented interpretation

One original map, **Sunbreak Island**, is fixed for every room. It is inspired by the requested Smash Island driving characteristics: interconnected curved lanes, open fighting space, elevated deck/platform, five ramps, alternate routes, a tunnel, physical barriers/trunks and thirty pickups. The existing 112×112 layout, tropical scenery, ocean, waterfalls, forest backdrop, sporty karts, suspension animation, camera and shared geometry are preserved. No map selector or extra game mode is introduced.

Free For All allows up to eight players, defaults to 180 seconds, awards one point per elimination and respawns after three seconds. Equal highest elimination scores share victory; deaths only sort display rows. Winner IDs freeze on the authoritative server at expiry. The match-duration environment override remains available for development and automated checks; Render stays configured to 180 seconds.

| Attack | Implementation choice |
|---|---|
| Machine gun | Single press runs thirty automatic shots. Server reselects a target each shot, uses forward cone/range/velocity lead, respects terrain/walls and adds imperfect spread. Exact assist behavior was requested by the user and is not claimed to reproduce reference internals. |
| Straight bullets | Distinct heavier unassisted direct projectile; three-round inventory, one shot per press. |
| Rockets / homing | Existing forward and seeking attacks retain three/two rounds respectively, one launch per press. Homing selection now rejects terrain-hidden and spawn-protected targets. |
| Cannon | Four-round inventory with one heavy sphere per press, gravity arc, splash, thick muzzle smoke and low-frequency launch. Exact gravity/arc behavior is original. |
| Bomb / mine | Existing lobbed fuse bomb and three individually deployed proximity mines. This is not an exact recreation of the reference ground explosive. |
| Blast missile | One larger, slower projectile with a wider splash radius; an original interpretation of the documented large-explosive category. |
| Invincibility | Existing shield upgraded to protected offensive contact for five seconds. |
| Orbit ram | Original orbiting spike geometry; five seconds of server-validated proximity contact damage, without immunity. Simultaneous contacts resolve together. |

Existing boost, homing and scatter attacks are retained as original extensions to preserve earlier functionality. Documented snowball/fake-box categories are outside the requested categories and are not added. No progression, authentication, shop, currencies, cosmetics or other modes are implemented.

## Assumptions and differences

Damage, health, speeds, cooldowns, fuse/arming times, spread, targeting cones, contact radii, protection durations, pickup probabilities, steering/grip, camera tuning and sounds are original values in shared configuration. Bullets' three-round inventory and per-press sequencing are chosen values. The publisher descriptions do not specify precise activation sequencing for all weapons, so only the clearly automatic machine gun consumes a complete burst; the user explicitly requested retaining single-projectile inventories.

Owner immunity and exact independent ten-second pickup deadlines follow the user's requirements, not a claim of reference measurements. Clients cannot award weapons or declare damage. Server snapshots carry cooldown states and effects, including late-join pickup state. Original ammunition values and differences are listed in the README.

The upright arcade solver uses circle contacts, one terrain floor per position and a separate visual suspension spring. It supports real jumps and a finite tunnel ceiling, but not overlapping bridge underpasses or full wheel rigid-body suspension. Distant mountains/forest/waterfalls are scenery beyond arena boundaries; the shallow river ford remains solid ground. Physical obstacles and terrain use shared authoritative geometry; small grass/flower details are passable decoration.

Gameplay feel, exact reference layout, original sound quality and hosted WAN behavior still need human playtesting. Local software-rendered functional tests are distinct from hardware rendering measurements. Current validation and performance evidence are recorded in README/AUDIT/PROGRESS and the dated performance report.
