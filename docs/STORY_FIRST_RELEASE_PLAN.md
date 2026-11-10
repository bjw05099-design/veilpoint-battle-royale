# VEILPOINT · Story-first release and development allocation
**Approved production direction · 2026-11-10.** This decision supersedes any
earlier inference that the offline Battle Royale prototype or public-internet
96-player lobby must be launched before the complete story game.

## Development allocation (rolling 10–20 hourly iterations)

| Area | Share | Acceptance focus |
|---|---:|---|
| World / map implementation | **35%** | Real in-engine accessible spaces, correct collision, authored geometry, licensed/provenanced terrain, world streaming and visual quality |
| Single-player story campaign | **35%** | Playable CH01→campaign expansion, causal narrative, actual actor motion, grounded interactions, solo save/recovery and offline completion |
| Future Battle Royale | **20%** | Reuse tested story world/components; isolate server-authoritative 6×16 players and networking for later release |
| Bug fixing / stabilization | **10%** | Fix P0 regressions immediately; restore the 10% share across subsequent iterations, never disable tests |

These percentages are **real software development effort**, not code line counts,
test-count inflation, report lengths, or mandatory percentages for every one-hour run.
Individual runs should implement two structurally different areas when feasible,
preferably map+story while bringing BR forward only where shared foundations benefit.

## Release sequence

1. **First release: Windows PC story mode, single-player.** The current offline
   `story.html` CH01 is only a *small preview*, not the 12-hour campaign.
   Completion requires separately verified playable chapters, genuine story
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
   A Windows browser-host EXE is not a native Unreal packaged game.

## Two independent Windows WebView2 candidate archives

- Combined developer preview: `veilpoint-windows-demo-exe.zip` opens CH01
  first and retains optional BR/terrain debug entrypoints.
- BR-free story candidate: `veilpoint-story-windows-exe.zip` contains only
  the certified `veilpoint-story-preview.zip` asset closure and a separately
  validated Windows host. Double-clicking its EXE chooses story-only mode
  automatically. Corrupt/missing assets fail its native PE preflight.
- CI must verify both outputs at the exact PR head and upload independently
  checksum-covered artifacts. The story-only archive does not bring public
  matchmaking, an Unreal native game, a 12-hour campaign or real hardware
  performance evidence into existence.

## Authoring and asset reuse

- Story-first world content may be staged behind its own module, e.g.
  `src/aden-public-hall.js`, but must not silently overwrite already saved BR
  world revisions. Later BR reuse requires its own independent server collision,
  networking and concurrency validation.
- The long-term target is **Aden's full city at 1:1 scale**. Today's original,
  non-georeferenced public civilian pieces are prototypes, not a verified
  real-address reconstruction. Respect third-party rights, civilian safety and
  measurement provenance; avoid sensitive operational locations.
- The story campaign's separate desired **playtime composition** remains
  combat 50%, urgent movement/rescue 20%, character/narrative 22% and exploration
  8%. Do not confuse that split with the 35/35/20/10 **development effort**.
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
Verify latest main/head; distinct tested source and independent regressions;
Linux Node + real Chromium at 2560×1440, 1366×768, 1280×720 and 1024×600;
Windows browser-host EXE and offline ZIP SHA256 artifacts; exact PR-head merge
eligibility; and post-merge main status. A CI-pending branch stays unmerged.
