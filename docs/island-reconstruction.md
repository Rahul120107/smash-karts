# Island reconstruction: reference and layout

Reference review, 12 October 2026, before implementation. The requested attachment is absent from the conversation and repository. This is a proportional original reconstruction, not a measured copy or an exact-match claim.

Sources inspected:
- [Requested wiki](https://smash-karts.fandom.com/wiki/Smash_Island_%28Map%29): full page restricted; public search excerpt describes a small symmetrical map, colored obstacles and a central square lava pit. No access restrictions bypassed.
- [Publisher screenshots](https://tall.team/smash-karts): inspected official promotional artwork and `SK-screenshots-02.png`. The latter shows the light-grey floor, green L barrier, white crossings, purple low boundaries, colored low corner pad, red-white pit edging, blue water and pastel island silhouettes. `SK-screenshots-03.png` shows a different map and is excluded from layout analysis.
- [Community recreation overview](https://gamebanana.com/mods/287684): secondary interpretation, not an official map measurement. Its overview reveals four elongated purple-edged perimeter islands, four colored inner L barriers, central lava, striped approaches and outer corner pads. No mod files or game assets downloaded. Reference pictures are review-only, never shipped as game assets.

Coordinates: origin at pit centre; +X east, +Z south, +Y up; north is up in the plan. All dimensions below are independently chosen simulation units inferred from relative proportions. Colours rotate by quadrant; route geometry is mirrored across X and Z.

| Element | Planned dimensions / centres |
|---|---|
| Light-grey floor | 112 × 112; rounded corners radius 12 |
| Purple outer boundary | 2 thick, 1.8 high; straight sections plus 6-segment quarter-circle corners |
| Central lava opening | 16 × 16, surface at -0.9; solid pit bottom -1.2 |
| Pit edging | 1.2-wide painted flush/slightly raised curb, 0.12 high; no artificial invisible barrier |
| Inner L barriers | long arms at X/Z ±22/±24, 1.2 thick/high; gaps to pit and perimeter routes |
| Raised perimeter routes | east/west X ±40: width 10, length 48, flat centre 26; north/south mirrored/rotated at Z ±40; height 1.2 |
| Platform rails | purple, 1.0 thick, 1.1 above deck, along flat middle sides; ramp entrances open |
| Corner pads | compact coloured 8 × 12 ramped pads at (±40, ±40), height 1.2 |
| Broad crossings | eight striped approaches between inner barriers and raised islands |
| Spawns | eight symmetric flat safe locations facing into open lanes |
| Pickups | symmetric inner lanes, outer lanes, elevated decks and corner approaches; independent existing 10 s timers |

Combat flow: drive around the pit through four connected open quadrants; pass around either end of each L barrier; take a raised outer lane or remain on the ground outside it; cross through the open gaps between islands. No forest, tunnel, central stone block or old bridge remains.

Lava policy is an assumption: a kart falling into the lava is environmentally eliminated, gains no score and respawns normally. Weapons never cause self-damage. Airborne karts may cross above the pit. Lava is not an invisible wall. Spawn protection and weapon invincibility do not prevent falling-hazard elimination.

The [initial top-down sketch](island-layout.svg) was created before coding. The [final coordinate plan](map-review/layout.svg) is generated directly from the shared map definition, including all 28 pickups and eight spawn headings. It supersedes the sketch where tapering, beveled elbows and safe pickup routes were refined.

## Implemented geometry and visual comparison

The old Sunbreak playable geometry and scenic forest, bridge, tunnel and mountains were removed. `shared/src/arena.ts` now defines 64 oriented wall boxes, eight tapered ramp/platform profiles, rounded boundaries, the central opening/curb, eight crossings, eight safe spawns and 28 pickup locations. Client meshes, kart prediction, authoritative contacts, projectile sweeps, targeting and camera rays all consume these definitions. Collision boxes are transformed into their local coordinate system rather than approximated by world-aligned rectangles.

Captured the actual builders and running game locally on an Intel Iris Xe D3D11 adapter; inspected all three views. [Capture metadata](map-review/capture.json) records no browser errors. The top-down and overview use the actual map builders; the third-person view runs the built React game and authoritative server. No proprietary images are embedded in the game or these captures.

| Comparison | Result / deliberate difference |
|---|---|
| [Top-down screenshot](map-review/top-down.png) | Centered square pit; four mirrored colored L barriers; four elongated purple routes; four colored corner pads; rounded purple perimeter; eight striped approaches. The original sketch's rectangular shoulders were refined into tapered sides and beveled elbows after comparison. |
| [Elevated overview](map-review/overview.png) | Low barrier heights, raised decks, broad open lanes and blue ocean remain readable. Shared angled shoulders match their collision boxes. |
| [Third-person gameplay](map-review/third-person.png) | Pit depth, red-white traversable edging, bright low barriers, pickup scale and pastel silhouettes were reviewed at kart height. Existing sporty kart models and HUD are preserved. |
| Layout precision | Publisher views support the visual vocabulary; the community overview informs approximate symmetry. No official overhead measurements or the requested attachment were available. Absolute size, pit ratio, crossing coordinates and pickup distribution remain estimates. |
| Elevated routes | Open ramp mouths make all raised routes driveable. The secondary overview depicts closed purple outlines; exact reference entry/exit geometry is unresolved. Corner pads are independently designed tapered profiles. |
| Decoration and effects | Original procedural lava/water shaders and simple distant islands. Barrier feet use narrow paint accents; broad red-white pedestals seen in some public images are not reproduced. No exact material, lighting or color-match claim. |

## Confirmed fixes and validation

- Low pit curbs no longer launch karts: ramp launch requires elevation above the configured maximum ground step.
- Ramp crests can launch predictably when an ascending slope levels out. Vertical movement remains active.
- Boosted entry into a steep corner ramp previously exceeded the per-tick step threshold and was mistaken for a side collision. Previous-footprint support now distinguishes forward ascent from an actual side impact; all eight ramp mouths are covered at boost speed.
- Initial spawn headings and their first pickup routes were moved along safe combat lanes after the browser lifecycle test exposed natural coasting into lava. All eight initial routes collect a box without falling into the pit.
- Environmental elimination is server-owned, immediately clears attack state, awards no elimination credit and uses the existing three-second respawn. Airborne crossings and the painted rim are safe. Weapon owner immunity, damage values and the independent ten-second pickup timers are preserved.

`npm run check` passed TypeScript, client/server production builds, **286 tests across 18 files**, **13 Chromium scenarios (5.2 minutes)** and compiled production smoke with eight clients. Coverage includes map symmetry/geometry, oriented contacts and ray normals, safe spawn/pickup placement, tapered/rotated ramp ascent and landings, prediction agreement, curb stability, lava elimination/late joining/respawning, full three-minute eight-player simulation, all twelve weapon categories, no self-damage, ten-second pickup respawning, 120 ms simulated RTT, disconnect/rejoin, replay and separate HTTPS/WSS frontend/backend operation. The Windows shutdown smoke invokes the signal handler through IPC; actual Linux signal delivery is unverified.

Performance samples and their hardware/workload limits are recorded in [performance-island-reconstruction.json](performance-island-reconstruction.json) and README. Eight simultaneous software-rendered browsers establish functionality, not GPU performance. Render Free configuration is unchanged; no live deployment or remote-device acceptance is claimed.

## Repeatable review

Run `npm ci`, `npm run build`, then `npx tsx scripts/capture-map.ts`. This writes the final SVG, three PNGs and capture metadata under `docs/map-review/`. It starts temporary local servers and closes them after capture. For manual play, run `npm run dev`, create a room in one browser, join its code from another, start, drive every raised route from both ends, circle each barrier, collect pickups, check their ten-second return, cross the pit while airborne, then drive into lava and verify death without score credit followed by respawn. Finish or replay a match and compare the three views against legitimately accessible references. The unavailable attachment is still needed for closer proportion review.
