# VEILPOINT · Story-first release and development allocation
**Production direction · 2026-11-18.** Both Windows releases use Unreal
Engine 5.8. The campaign ships first. Development belongs under
`Unreal/Veilpoint`; earlier WebView2 and offline browser work is reference
material for regression and migration.

## Development allocation

| Development area | Share | Acceptance focus |
|---|---:|---|
| Firearms, physics engine and maps | **50%** | Reusable weapon systems and assets, physical behavior, sourced terrain and public geometry, collision, traversal and atlas controls |
| Single-player story campaign | **40%** | Playable chapters, dialogue and cinematics, authored encounters, chapter integration, solo save/recovery and offline completion |
| Battle Royale | **10%** | Reuse tested environments, validate 6×16 interactions on the server and stabilize the separate multiplayer release |

The November 24 allocation applies to ongoing development effort. Select the
mix of firearms, physics and map work within their combined share according
to the next playable milestone. Count shared system work once in that share.
Count chapter and BR integration under their respective modes. Stabilization
counts under the area being improved.

## Reusable foundations and chapter content

Prioritize reusable UE5.8 foundations within each development share. Build and
validate reusable Aden terrain, navigation and collision, textures and
materials, character animation, physics interactions, and gameplay weapon and
combat systems through representative playable sections. Reuse the systems
across chapters and in Battle Royale where appropriate.

Develop motion, collision and physical interactions according to the
[native physics production standard](NATIVE_PHYSICS_STANDARD.md). Start with
the sourced Aden ground and a representative playable route. Extend verified
behavior to movable props, doors, vehicles and breakable assets as they enter
production.

Develop weapons according to the [firearm production standard](NATIVE_WEAPON_RELOAD.md#firearm-production-standard).
Validate a complete weapon through its playable UE5 assets, weapon profile
and shared behavior before expanding the roster.

Keep scene dialogue, cinematic sequences, objectives, branch transitions,
and encounter placements and triggers in chapter-owned content. Refer to
reusable world assets and gameplay systems from that content. Keep checkpoint
identifiers stable and provide migration when a saved state needs to move to
a different beat.

Use a representative CH01 scene to verify the separation as the foundations
improve. Change dialogue, a cinematic cue or an objective, then verify that
the scene can still reuse the map, animations and combat systems and that
existing checkpoints can resume. Record which content was changed and what
was verified before applying the pattern to more chapters.

## Release sequence

1. **First release: Windows PC story mode, single-player.**
   The native Unreal game starts Chapter 01 in `CH01_Aden`. Completion requires separately verified playable chapters, genuine story
   flow, human Windows launch, assets, localization/accessibility, save recovery,
   offline package, license provenance and real performance measurement.
2. **Second release: Battle Royale.** Reuse as much of the proven story's
   environment, maps, materials, actor animation, physics, sound, interactions,
   vehicles and PC interface as appropriate. BR networking, authority,
   competitive fairness and 96 concurrent players require their **own**
   integration tests and release gates. Do **not** put story spoilers or
   private single-player plot flags into a multiplayer snapshot.
3. The **2026-11-27 date is the existing demo candidate target**, not a
   guaranteed full 12-hour story launch or a simultaneous BR release.
   Native Win64 cook, package and launch evidence determine demo readiness.

## Archived WebView2 test packages

- Combined developer preview: `veilpoint-windows-demo-exe.zip` opens CH01
  first and retains optional BR/terrain debug entrypoints.
- BR-free story candidate: `veilpoint-story-windows-exe.zip` contains only
  the certified `veilpoint-story-preview.zip` asset closure and a separately
  validated Windows host. Double-clicking its EXE chooses story-only mode
  automatically. Corrupt/missing assets fail its native PE preflight.
- Historical CI evidence for both outputs was stored as independently
  checksum-covered artifacts. The story-only archive does not bring public
  matchmaking, an Unreal native game, a 12-hour campaign or real hardware
  performance evidence into existence.

## CH01 collision-current pedestrian route cache (2026-11-10)

The existing local route planner can run bounded A* repeatedly at each HUD
refresh (~180ms) while the captain stands still in front of a building.
`src/story-pedestrian-route-cache.js` now reuses a previously verified
public walking path without touching the 60Hz simulation or V2 checkpoint.

Its acceptance gate compares the exact public marker id/coordinates and
**every** current static/dynamic collision AABB's x/z/w/d, even when the
same obstacle array is mutated in place. It checks actual current player
position (maximum 6m since the last full path search), refuses a blocked
character footprint, recomputes the first leg against clearance-inflated
obstacles and only reuses **forward** route segments that remain clear.
If the target/geometry changes or the actual first leg is blocked, the
existing bounded A* planner is run anew. Unreachable-route results are
reused only within 0.2m of the previously tested real position; no
estimated pedestrian arrival or virtual routing through walls is allowed.
Moving people remain **unverified** and are never represented as safe
passage, and the game doesn't track enemies or infer civilian rescue.

The shared module is loaded in `story.html` and included in the
independent story-only ZIP/Windows WebView2 package. Existing BR/BR96
network physics and the CH01 V2 save payload are unchanged. Node tests
assert exact collision mutation invalidation, real re-anchored waypoints,
bounded negative results and no remote objective leakage.

## CH01 player-following PC neighbourhood map (2026-11-10)

A prior CH01 minimap incorrectly fixed its global world window to
`x=[-75,+75]` and `z=[-90,+40]`. The original civilian public court was
subsequently placed at `(110m,-37m)`, so both the on-site player and verified
footpath could disappear outside the minimap even while the level remained
physically playable.

`src/story-local-minimap.js` now projects a **player-following 120m-wide
fictional neighbourhood** at uniform real-world x/z metre scale, preserving
canvas aspect ratio at 240×150 and larger Windows/QHD layouts. It clips
buildings and checked pedestrian route segments to the visible window,
anchors grid lines to fixed world metres, culls remote objective markers,
and draws only an escort already locally witnessed under 20m and direct
line-of-sight rules. It does not show hidden civilians, opponents, other
squads, surveys, or live real-world georeferenced data. Its output remains
read-only and does not change CH01 v2 saves or BR/BR96 game state.

Nine tests check the far public-court player position, dynamic recentering,
equivalent metre scale, obstacle and route clipping, no distant actor leakage,
story-only ZIP dependency closure, and save compatibility. Real graphics
evidence and native UE5 hardware tests remain separate release gates.

## CH01 public-footpath directions from the real collision world (2026-11-10)

The CH01 PC HUD now distinguishes **straight-line distance** from an actual
walking detour through the fictional civilian city. When an *already known,
visible-or-explicitly-selected* public mission marker is obscured by physical
walls, `src/story-pedestrian-guidance.js` attempts a bounded pedestrian path
against the same 60Hz AABB geometry. A successful local plan displays the
**first segment direction, segment metres and total approximate walking
metres** and draws its exact waypoints on the PC minimap.

This is read-only navigation, never character teleportation, a new objective,
a remote camera view, enemy location data, a save-field schema change or an
authoritative guarantee about people and moving traffic. The output is limited
to local 75-metre, non-georeferenced city gameplay and an explicit A* budget.
An unresolved civilian escort cannot be bypassed by a false route arrow. If
the planner has no checked route, the existing direct-line-obstructed warning
remains visible without pretending a verified walking path exists. Both
Windows WebView2 and independent story-only ZIP include the new module as an
explicit `story.html` dependency.

## Authoring and asset reuse

- Author story maps in Unreal and validate packaged geometry and collision.
  Later BR reuse requires independent server collision, networking and
  concurrency validation in its Unreal GameMode.
- The long-term target is **Aden's full city at 1:1 scale**. Today's original,
  non-georeferenced public civilian pieces are prototypes, not a verified
  real-address reconstruction. Respect third-party rights, civilian safety and
  measurement provenance; avoid sensitive operational locations.
- The 12-hour story campaign targets **55% combat, 12% urgent movement and
  rescue, 25% character and story, and 8% exploration**. Its main arc follows
  the alliance with Major Rami's Yemeni government army battalion in Aden. [Campaign screenplay](ADEN_CAMPAIGN_SCREENPLAY_KO.md)
- No 165FPS, RTX3070 performance, UE5 UBT/PIE, full-city surveyed accuracy,
  12-hour playable campaign or internet 96-human match can be asserted from
  Node/browser contract tests alone.

## CH01 authoring parity: real local civic walking space

The first authored **11-piece civilian public court** at local (110m, -37m)
now has its original floor/roof + eight body-height colliders in both the
UE5 Editor authoring source and browser CH01. The browser uses the same
eight real 60Hz wall/furniture AABBs for movement, with exactly aligned
WebGL and Canvas silhouettes. The physical north–south passage remains
walkable, while a raised canopy never becomes an invisible 2D wall.
Story-only spatial audio and on-site location text follow actual foot position,
not a global quest flag.

This is a CH01 environmental gameplay and map increment, NOT a new
12-hour chapter, UE5 PIE success, BR96 collision rollout, surveyed Aden
coverage, or RTX 3070 benchmark. Existing BR/BR96 game states remain intact.

## Every PR's proof
Check current main and the relevant source or gameplay gates on the exact
change. A native candidate requires Editor compilation, saved map references,
packaged Windows launch and gameplay run evidence. Record manual input and
QHD performance separately. The private Windows worker builds from merged
main only.
