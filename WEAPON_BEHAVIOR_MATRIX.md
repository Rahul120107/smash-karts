# Weapon behavior matrix

All 13 existing or added categories are included. Counts/durations below are
Crossfire configuration values, not verified current-live Smash Karts constants.
Reference evidence and uncertainties: [REFERENCE_WEAPONS.md](REFERENCE_WEAPONS.md).

| Weapon / protocol ID | Input and complete attack | Motion and collision | Original presentation |
|---|---|---|---|
| Machine Gun / machineGun | Tap: 166 rounds over 6.5 s | Predictive forward-cone acquisition, continuous retargeting, LOS, spread, swept bullets, distance falloff | Rotary barrels, flashes, tracers, shell sparks, target cue, rapid square-wave voice |
| Standard Bullets / bullets | Tap: nine rounds of three, 0.3 s between groups; 27 projectiles | Straight dispersing slugs; no auto-aim; swept collision and distance falloff | Amber metal/tracers, group flash, impact sparks, volley voice |
| Rockets / rocket | Tap: three rounds, 0.65 s intervals | Forward mount, inherited velocity, constant 32 units/s, direct 50 and weaker splash | Finned rocket, exhaust, pooled smoke, impact shockwave, launch voice |
| Cannonballs / cannon | Hold: charge range; release: four balls, 0.8 s intervals | Horizontal speed 26–42, elevation atan(9/26), inherited velocity, gravity 24, swept ground/wall/kart impact | Iron spheres, cannon barrel, charge trajectory/landing marker, heavy smoke, deep launch voice |
| Homing / homing | Tap: two missiles, 0.85 s intervals | LOS-valid targets, predictive interception, bounded 8 rad/s turns; impact/splash | Violet finned body, exhaust/trail, distinct seeking launch voice |
| Lob-Grenuke / bomb | Hold aim/range; release: one explosive | Ballistic 13–23 horizontal speed; direct impact, armed proximity or 3 s fuse; ground bounce/settle without ground detonation | Red bundle, timer/fuse, trajectory, fuse sparks, explosion and throw voice |
| Mines / mine | Tap: three drops, ≥0.6 s and ≥1.8 units apart; drive to complete | Rear ground placement, 0.7 s arming, enemy trigger, direct/splash; unused expiry without explosion | Disc, arming light, owner tint, deployment voice |
| Fake Loot Box / fakeLootBox | Tap: one rear trap | Ground placement, 0.7 s arm, enemy contact, owner-safe, retained delayed attribution | Convincing gold question box, owner tint, concealed trigger plate, explosion and deployment voice |
| Nuke / blastMissile | Tap: one missile | Slow straight 19 units/s; direct 100, splash ≤50 before falloff; wall/terrain LOS | Large finned body, radiation motif, exhaust, brief large shockwave, heavy voice |
| Orbit Ram / orbit | Tap: full six-second effect | Five swept orbit centers, radius 2.3, speed 10 rad/s, contact 38, 0.5 s victim cooldown, knockback 6; 25% speed, 10% armor | Two instanced draws for five spinning metallic maces, trails/contact sparks, impact voice |
| Invincibility Star / shield | Tap: full five-second effect | Protection plus lethal enemy contact, 45% speed; spawn/Star protection respected | Original five-point star, pulsing aura, activation/expiry voices |
| Scatter / scatter | Tap: one five-pellet spread | Straight, independent swept pellets | Warm pellet spread and shotgun-like voice |
| Boost / boost | Tap: full four-second effect | 55% speed; max effect wins, no multiplicative stacking | Speed trails, glow, activation/expiry voice |

## Shared rules

The authoritative server owns activation, sequence deadlines, ammunition, charge,
target eligibility, motion, collisions, damage and elimination attribution.
Monotonic press IDs reject repeated activation. Hold and release are separate
states; keyboard auto-repeat never consumes another pickup. Keyboard, touch and
prediction feed the same fixed-step simulation. No client hit claims are accepted.

Local +Z is forward. Shared physical mounts are transformed from the authoritative
kart pose, including heading, elevation and inherited velocity. Flash events use
the actual muzzle; cosmetic interpolation only rebases their presentation.
Rear traps use shared ground/bridge height. Every projectile retains its original
owner, display name and weapon, including after owner departure. Self damage is
excluded centrally from direct, splash and delayed damage.

Charge is capped at 1.2 s. Cannon salvos keep the released charge while using the
current kart heading/velocity for each launch. Mine sequences wait for displacement
and safely stop after eight seconds if the kart remains parked; unspent ammo remains.
Death, replay, invalid weapon replacement and stale charging cancel attacks.
Late joiners receive projectile, effect deadlines, charge and weapon-phase states.

Eliminations carry killer/victim IDs and sanitized names, weapon ID/name, match ID
and unique match event ID. Nonlethal hits and duplicate damage cannot award a kill.
Attacker and victim messages are derived from that single authoritative event.

## Explicit differences and assumptions

- Complete-inventory tap sequences are the requested Crossfire control policy.
  The exact current reference's per-round versus full-inventory controls are unknown.
- Community references describe lethal Mace contact. Crossfire retains **38 damage**
  to honor the requested effective but non-one-hit Orbit Ram balance. Configure
  `WEAPONS.orbit.damage` for another measured balance; no lethal-reference parity claim.
- Homing missiles, scatter and standalone boost remain Crossfire extensions.
- Projectile speeds, intervals other than the MG duration, gravity, charge curves,
  collision radii, splash falloff, target cone and knockback are configurable estimates.
- Original synthesized sound envelopes are verified programmatically, not copied
  from the reference or claimed perceptually identical.
- Developer-only `npm run calibrate:mechanics` records repeatable Crossfire firing
  intervals, muzzles, velocities, charge, handling, collisions/damage and prediction
  corrections. It does not compare external recordings or expose debug controls publicly.
