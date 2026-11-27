# VEILPOINT UE5.8 physics production standard

Match observable motion and contact to real-world references as closely as
the available evidence supports. Use Unreal's physics and movement systems
and keep the production Aden map at its sourced coordinates and 1:1 scale.
Store reusable physical parameters with materials and assets so chapter
changes can reuse the same behavior.

| Area | Real-world reference | Verify in Unreal |
| --- | --- | --- |
| Terrain and collision | Sourced grade, steps, curb height, surface shape and ordinary building boundaries | Across a tile seam or on a slope, feet and wheels stay aligned with the visible ground. Doorways, corners and thin blockers give consistent contact in both directions. |
| Character movement and animation | Reference cadence, stride, acceleration, deceleration, joint limits and landing motion | Compare walking, running, turning, stopping and landing on level ground and stairs. Check foot placement, sliding and camera motion during contact. |
| Props, surfaces and doors | Dimensions, mass and center of mass that suit the asset, friction, restitution and hinge limits | Check whether the object slides, tips, bounces, settles or stops as expected. Compare wet and dry surfaces where their interaction matters. |
| Vehicles | Representative mass distribution, suspension travel, grip and braking on usable road surfaces | Compare stop distance, turning and wheel contact on level and graded roads. Check barriers, curb approaches and vehicle recovery after contact. |
| Breakage and water | Reference behavior for materials such as glass and wood, and buoyancy and drag for simulated floating objects | Check fracture shape, fragment motion and settling. For floating props or vessels, compare draft, rocking and response to motion in shots where buoyancy affects play. |

For each production behavior, record the reference, the measured quantity or
observable comparison, and a repeatable test. Mark estimated inputs and
gameplay tuning where direct measurements are unavailable. Choose test
tolerances from the available evidence and the interaction being verified.

Start with a playable Aden section containing a slope or seam, a step and
a movable prop. Capture repeated passes at different frame rates and check
for visible divergence, sticking and missed collisions. Then validate each
new interaction in its actual playable context. For shared multiplayer
interactions, compare authoritative state and what a client sees when joining,
moving and colliding. Verify persistent physical state when it affects
resuming a story checkpoint.

The local character uses displacement after a grounded movement update to
advance its walking cycle. The first-person rig and Aden footstep audio read
the same cycle. Verify steady walking, a stance change mid-step, a jump and a
teleport or checkpoint recovery at multiple frame rates.
