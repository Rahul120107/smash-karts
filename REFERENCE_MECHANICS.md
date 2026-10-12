# Mechanics calibration

See [REFERENCE_WEAPONS.md](REFERENCE_WEAPONS.md) for sources and evidence labels. Public reference footage has not been measured frame by frame. Community reports are DOCUMENTED; Crossfire world units and physics values are ESTIMATED. Exact reference acceleration, braking, grip, steering angles, gravity and collision restitution remain UNKNOWN.

Crossfire uses a shared 60 Hz fixed-step simulation, a 20 Hz authoritative snapshot stream, independent throttle/steer/drift/fire states, monotonic input sequence and fire-press identifiers, server-owned weapon sequences and continuous projectile sweeps. Client prediction replays the same vehicle dynamics and corrects against acknowledged snapshots. Cosmetic suspension never changes physics-body or muzzle orientation.

The single-press complete-inventory behavior requested for automatic weapons is retained. Public documentation does not establish the live tap grouping of every straight shooter; this choice is explicitly a Crossfire control policy. Cannon and Lob-Grenuke use held charge/aim followed by release. A keyboard tap also releases, so it performs the minimum-charge attack. New presses cannot duplicate an already running sequence.

The island layout, graphics, rooms, three-minute Free For All, eight-player capacity, mobile controls and Render Free architecture are outside this mechanics calibration. Their existing structure is preserved.
