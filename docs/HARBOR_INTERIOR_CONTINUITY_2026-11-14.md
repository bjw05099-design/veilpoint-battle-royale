# Harbor interior and companion continuity

This increment completes the usable interior of the two loading halls added in
PR #870. It does not add a campaign chapter or claim surveyed Aden geometry.

## Actual playable changes

- Complete six-wall loading-hall kits provide one shared set of room bounds.
  Missing kits and terrain revision zero do not acquire an imaginary interior.
  WebGL includes the CH01 passage walls (previously excluded by its story-only
  type filter), cargo-sized details, flat floor, an elevated ceiling and modest
  floor-edge paint. Generic house doors/windows, extra sheds and vegetation no
  longer protrude into these passages. Canvas clips floor/ceiling at the camera
  near plane rather than dropping the surface after walking inside.
- The ceiling blocks 3D sight/shot segments at its real height. It is never a
  ground-level collision box: both four-metre doorways remain walkable. Wall and
  cargo collision footprints and existing exterior checkpoints are unchanged.
- CH01 uses these physical rooms for interior footsteps and restrained ambience;
  outside sound attenuates with distance from the actual openings. These remain
  synthesized placeholders, not recorded or calibrated real-world acoustics.
- Kim's bounded pedestrian planner considers nearby people as well as walls,
  using his real body clearance. He can physically pass around a stationary
  captain to reach his follow position after returning through the hall. The
  same saved poses resume deterministically without a saved or hidden path cache;
  the existing wait command and distance limit remain in force.
- CH01 player checkpoint validation now filters the BR-only service barriers in
  exactly the same way as its live map. A legitimate position beside the new
  hall no longer fails saving because of a fence that does not exist in CH01.
  Shared building collisions and legacy scene-overlap recovery remain enforced.
- BR96 downloads only public hall bounds with its existing public map and renders
  floors/ceilings from them. No rival identity, session, health or private actor
  position is included. Its authoritative firing uses the same roof geometry.

## Verification

Behavior tests cover room recognition, missing-wall/legacy worlds, roof shots,
actual 60Hz traversal, footprint-clear WebGL doorway vertices, indoor sound,
companion bodily separation, checkpoint round trips and invalid shared geometry.
The complete local Node suite passes 3,044 tests (bounded concurrency).

The mandatory Linux/Windows Chromium gate now also traverses the real shared
hall using the production BR96 client's W key and authenticated server movement.
A separate CH01 fixture loads the actual simulation and render modules, walks
through the hall, round-trips a checkpoint inside, and captures its supported
renderer plus the real Canvas2D fallback. The evidence records which renderer
was available; headless/software rendering is not a user GPU benchmark.

These fixtures are development evidence, not a 96-human public-network test,
photorealistic city, full campaign, native UE5 build or RTX 3070/QHD performance
measurement. Floor/ceiling projection in the CPU renderer remains simplified;
WebGL depth testing is the primary 3D path. Story-first release, F interaction,
middle-click marking and the previously approved development priorities remain.
