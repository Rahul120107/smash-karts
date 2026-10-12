# Reference versus Crossfire

Baseline audited at commit `cb56c90`: centralized input and +Z mounts already corrected; machine gun had 30 shots over roughly three seconds; heavy bullets were three assisted slugs; cannon had four fixed-range tap-fired arcs; bombs bounced off karts and lacked proximity detonation; mines had 85 damage; Orbit Ram had three objects and 38 damage; Star protected and attacked on contact without a speed effect; no fake loot box existed. Rockets, homing missiles, scatter and boost were already server authoritative. Delayed projectile ownership and unique elimination identifiers were present.

The new calibration target is the DOCUMENTED historical weapon inventory in [REFERENCE_WEAPONS.md](REFERENCE_WEAPONS.md). Count/duration mismatches are implementation changes; unmeasured speed, range, damage curves, collision tolerances and control-grouping choices remain configurable assumptions. Separate homing missiles, scatter and boost are retained Crossfire extensions. No statement of exact current-live parity is made.

Vehicle dynamics already contain acceleration taper, braking, speed-sensitive bicycle steering, lateral grip/drift, gravity, grounded slope following, bounded crest launch, low-restitution wall/kart contacts and prediction replay. Keep tested map traversal while adding repeatable measurements; changing those values without a controlled reference recording would not establish greater fidelity.

Final regression, browser and performance evidence will be recorded in [WEAPON_TEST_RESULTS.md](WEAPON_TEST_RESULTS.md). All remaining unverified reference behaviors are listed in the reference report.

Implemented: MG 166 shots over 6.5 seconds; 27 unassisted bullets in nine groups;
three rockets; charge/release four-ball cannon; chargeable direct/proximity/fused
Grenuke that survives normal ground; three spaced rear mines; new fake loot trap;
slower direct/splash Nuke; five maces with speed/armor; Star speed/protection/contact.
Each uses distinct behavior dispatch and authoritative collision/damage, while
retaining centralized shared mounts, sequence infrastructure and fixed-step movement.

Complete-inventory activation is a requested Crossfire choice where exact reference
grouping is unknown. Orbit contact remains 38 damage, deliberately below the
community's reported lethal contact to preserve the earlier requested balance.
No arbitrary retuning of vehicle handling is claimed to improve reference fidelity.
Measured Crossfire calibration data is in `docs/mechanics-calibration.json`; a
controlled reference video comparison is still required to establish closer parity.
