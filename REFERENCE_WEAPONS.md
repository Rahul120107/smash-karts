# Public reference evidence — 13 October 2026

This is an original implementation. No proprietary source, internal constants, or protected assets were accessed. The live [official game](https://smashkarts.io/) supplies no readable weapon specification. Current frame-perfect parity is **UNKNOWN**. The [2020 public GoGy walkthrough](https://www.youtube.com/watch?v=OdtEMph5cOU) is a recording source for future calibration; its individual frames have not been measured here.

Evidence labels: **VERIFIED** means directly measured in a reproducible recording; **DOCUMENTED** means a public community claim; **ESTIMATED** means a design/calibration assumption; **UNKNOWN** means insufficient evidence. No reference numeric value in this report is labelled VERIFIED.

All weapons are DOCUMENTED as random loot-box awards, equipped until used or eliminated. Desktop movement uses WASD/arrows and Space; mobile uses simultaneous steering and a weapon touch button. Sources: [weapons](https://smash-karts.fandom.com/wiki/Weapons), [controls](https://smash-karts.fandom.com/wiki/Controls).

| Reference category | DOCUMENTED behavior | Unresolved measurements |
| --- | --- | --- |
| Machine gun | Approximately 166–170 bullets, 6.5-second uninterrupted attack, nearby tracking, damage weakens at distance; front gun | Current ammo, cadence, acquisition cone/range, exact damage curve and whether untargeted bullets can damage |
| Bullets | Straight shots, 27 projectiles arranged in nine groups of three; approximately 7 damage each; dispersion and distance loss | Exact intra-group timing, full-pickup activation versus repeated groups, speed, tiny splash claim |
| Rockets | Three front-launched straight rockets, approximately 50 direct damage and weaker splash, dispersion | Cadence, speed, acceleration, radius, lifetime, precise activation grouping |
| Cannonballs | Arcing lobber; held Space changes range; four balls are a user-supplied historical calibration target | Current count, hold/release timing, gravity, velocity, charge curve, damage and radius |
| Lob-Grenuke | One lobbed explosive; player impact, proximity or timer detonates; normal ground contact leaves a trap | Fuse, arming delay, proximity radius, throw charge, bounce and blast falloff |
| Mines | Three rear drops, delayed disappearance, approximately 100 direct damage with weaker splash; own mines safe | Deployment cadence, arm time, proximity geometry, lifetime |
| Fake loot box | One disguised rear trap, lethal contact, small nearby damage, owner-safe | Arming, lifetime, airborne behavior, precise splash |
| Nuke | One slow straight atomic-shaped missile, lethal direct hit, splash described as capped near 50; orange smoke | Projectile speed, lifetime, radius and contradictory multi-kill splash descriptions |
| Spiky Mace | Five orbiting spiked spheres, approximately six seconds, lethal contact except Star; community reports ~25% speed and ~10% damage reduction | Radius, angular speed, sweep/contact rules, knockback, mutual-contact ordering |
| Invincibility Star | Approximately five seconds, protection and contact attack; reported ~45% speed increase | Exact speed, contact radius, protection exceptions |
| Separate homing missiles | Existing Crossfire extension; no sufficiently reliable matching reference found | All current-live correspondence |
| Scatter blaster / speed boost | Existing Crossfire extensions, retained | All current-live correspondence |

Community sources: [machine gun](https://smash-karts.fandom.com/wiki/Machine_Gun), [ammunition and durations](https://smash-karts.fandom.com/wiki/Ammo/Lasting_Seconds), [bullets](https://smash-karts.fandom.com/wiki/Bullets), [rockets](https://smash-karts.fandom.com/wiki/Rockets), [cannonballs](https://smash-karts.fandom.com/wiki/Cannon_Balls), [Lob-Grenuke](https://smash-karts.fandom.com/wiki/Lob-Grenuke), [mines](https://smash-karts.fandom.com/wiki/Mines), [fake loot box](https://smash-karts.fandom.com/wiki/Fake_Loot_Box), [Nuke](https://smash-karts.fandom.com/wiki/Nuke), [Spiky Mace](https://smash-karts.fandom.com/wiki/Spiky_Mace), [Star](https://smash-karts.fandom.com/wiki/Stars). These are historical community accounts, sometimes contradictory, not verified live-game parameters.

For **every** category, exact world-space launch speed, projectile lifetime, collision shape, explosion radius, current damage, sound waveform and multiplayer latency handling remain UNKNOWN. Mesh appearance and synthesized sounds are original. Configurable Crossfire choices are ESTIMATED. The server validates movement, target eligibility, line of sight, swept collision, ammo and damage; clients render authoritative events. No self-inflicted weapon damage is preserved as a requested Crossfire rule.

Required additional recordings: fixed-camera stationary firing for counts/cadence; simultaneous side/front views for muzzle transforms; measured movement on flat ground, ramps and walls; cannon charge durations and landing distances; moving-target tracking with deliberate reversals/obstacles; blast-distance sweeps; mine/fake-box arm and expiration timings; Star/Mace contact and protection tests; synchronized two-client recordings at known latency. Use known frame rate, game version, unchanged playback speed and a world-size calibration marker.
