# VEILPOINT demo delivery gates · 2026-11-27

This is a **delivery target**, not a claim that a playable or photoreal Unreal binary already exists.

## Two tracks (1 solo developer + AI)

**A / Primary: standalone browser demo.** Launch offline using local `index.html` or a local HTTP server. Maintain an end-to-end play loop: menu → spawn → first-person traversal → zone & AI → resources → win/loss → restart. Ensure working graphics profiles, accessible inputs, zero mandatory external dependencies, regression tests and a ZIP containing source + launch instructions.

**B / Stretch: high-fidelity Unreal demo.** One carefully scoped playable environment with original/licensed PBR assets, lighting, traversal and coherent interactions. Only call this playable when it compiles, packages and runs on a real installed Unreal machine. The current repository UE source scaffold is **not** verified. If B is blocked, keep shipping A.

## Story-mode preview stretch (added requirement)

A cinematic first-person single-player campaign set in the fictional Sahir Coast / Nahrin civil conflict is required in the final product. The first-month demo may include **CH01 / The Last Broadcast** narrative introduction, evidence examination, subtitles and a checkpoint if available within the release-critical work budget; this is *not* a substitute for completing all planned story chapters. The first-month browser survival demo remains the primary P0, and public internet multiplayer is not falsely claimed complete. See [campaign](STORY_CAMPAIGN.md) and [multiplayer modes](MULTIPLAYER_MODES.md).

## Release acceptance checklist

- [ ] End-to-end playable session can start, complete and restart without soft-lock.
- [ ] Collision, AI, shrinking zone, looting, HUD, desktop movement and camera tested.
- [ ] 60Hz deterministic game simulation remains separate from render cap.
- [ ] HyperReal 165Hz plus Cinematic Maximum, Ultra Photoreal, Balanced Quality, Smooth Performance, Power Saver and Custom work; no unverified 165FPS guarantee.
- [ ] Real CPU/GPU/monitor results are provided *only if actually measured*. 165FPS has a 6.06ms/frame target.
- [ ] `npm run verify` passes at release commit, with exact command/output; GitHub Actions is green at that SHA.
- [ ] Self-contained ZIP, README instructions, relevant licence inventory, changelog and checksum generated. Packaging now checks directly referenced HTML assets for offline closure and independently verifies ZIP CRC32, SHA256 manifest and sidecar; code-level validation is not a real-browser launch certificate.
- [ ] Launch-test records identify actual desktop browser and hardware; if untested, label a candidate, not a verified release.
- [ ] Unreal demo separately requires real compiled and launched packaged build with logs, signed-off visuals and hardware benchmark.

## Timeboxed delivery policy

| Date | Main focus |
|---|---|
| Oct 27–Nov 2 | Baseline demo launch + smoke/integration tests; native build readiness assessment |
| Nov 3–9 | Complete offline match + interaction/UI/audio polish; one native test scene if possible |
| Nov 10–16 | Game stability, visibility/LOD, animation/audio, input quality, visual consistency |
| Nov 17–23 | Performance profiling where possible, regression matrix, accessibility, release candidate |
| Nov 24–27 | Feature freeze, P0 bugs, CI, package/README/known issues, ship a tested demo |

## Every hourly iteration

1. Inspect latest HEAD, open issues, PRs and CI; avoid duplicate work and race conditions. Only alter `bjw05099-design/veilpoint-battle-royale`.
2. Choose the highest **release-blocking P0** and implement as much related code + tests + integration as quality allows. Prefer real features over raw LOC or superficial commits.
3. Run all available tests, fix failures, build/launch where supported and honestly record environmental blockers.
4. Commit/PR only coherent verified changes. Report files, measured LOC/test counts, CI and links, demo-gate progress, next P0.
5. If Unreal hardware/build tools are unavailable, keep improving A and specify exact steps the solo human must perform.

The scheduler runs once per hour; there is no guarantee of extra runtime or a 10x productivity improvement merely because it was requested.

## 2026-10-27 CH01 integration checkpoint

The existing offline BR demo now links to a **separate** `story.html` CH01 browser preview with first-person movement, a relay interaction, a fictional finite-ammo human-opponent encounter, one-use NIS ally information-only radio report, optional two-record Signal Echo clue, an evidence-gated alternate exit, readable subtitles, pause/restart and local checkpoint serialization (v2 with v1 migration). CH01 preview completion is stored separately and does **not** unlock full campaign M02. The offline BR prototype has since received the first realism corrections for shield/healing/visibility, without changing the requirement for a fully verified playable demo. Tests were added, but the release acceptance checklist above remains **unchecked** until full `npm run verify`, GitHub CI, actual browser launch/playthrough and distribution package have been verified. The story preview is intentionally much shorter than the eventual 12h campaign.

## 2026-10-27 reproducible browser ZIP candidate

The standalone offline browser candidate is packaged with `npm run package:demo` (Node built-ins only). It discovers local JavaScript dependencies from `index.html` and `story.html`, rejects remote/path-traversal script references, excludes UE and the local team HTTP server, and writes `dist/veilpoint-offline-demo.zip` plus a SHA256 checksum. The ZIP contains an individual-file `MANIFEST.sha256` and an explicit `NOTICE.txt` explaining that Unreal/165Hz/human browser QA are not verified. Archive entry order and timestamps are deterministic for byte-for-byte reproducibility. GitHub CI runs `sha256sum -c` and `unzip -t`, then uploads a named ZIP artifact. **This is a package candidate, not a signed-off demo delivery:** real launch/playthrough, graphics, accessibility, asset rights and hardware acceptance gates remain unchecked.

## 2026-10-29 BR offline continuity candidate

The offline BR candidate now supports an explicit local checkpoint resume and a separate **new match** action, rather than losing every active match on refresh. It persists deterministic PRNG state and finite resources, rejects corrupt or impossible saves and surfaces storage failures. Node/DOM-mock regression tests are necessary but **do not check off** real browser playthrough, ZIP release, graphics, licensing, Unreal or QHD 165Hz acceptance. A saved game is local to the current browser/origin and can be unavailable in private mode or when storage is blocked.

## 2026-10-29 BR match-result and checkpoint-input candidate

The browser BR end screen now uses a terminal-only placement calculation: a defeated player ranks **one behind the surviving opponents** (never first after a loss), while an actual victory displays first place. The offline checkpoint serializer and restore path both enforce a **65,536-character limit**, rejecting oversized localStorage data *before* JSON parsing without invalidating normal 20-opponent saves. Fixed-60Hz save replay, browser DOM end-screen loss/win cases and malformed-save regressions are part of the candidate tests. These changes are not proof of a complete human-playtested match, real-browser stability, native Unreal execution, photorealism or QHD 165Hz performance; the delivery checklist remains unchecked until those independent gates pass.

## 2026-10-29 deterministic end-to-end rule-path tests (candidate)

A new Node test drives CH01 from the spawn through **actual fixed-60Hz movement and finite player shots**, then tests both the evacuation ending and the optional evidence/verification ending through the physically moving checkpoint gate. It saves/restores mid-encounter and mid-gate motion without teleporting the player. A separate one-rival BR route traverses the map, fires finite ammunition and wins with byte-consistent checkpoint replay; an inactive full-size match verifies defeat and honest placement. These are **simulation integration tests, not human browser playthroughs**: rendering, mouse/touch feel, actual GPU frame pacing, Unreal packaging and 165Hz performance still require independent acceptance. No release checklist box is automatically signed off.


## 2026-10-29 BR boundary feedback candidate

The BR HUD now displays a proximity warning within 12 world units of the shrinking match boundary and an explicit return warning when outside, without concealing reload or other event feedback. The warning derives from the same simulation radius used for the current damage rule; it does **not** make the arbitrary shrinking-damage hazard physically realistic. The initial HTML ammunition display is corrected to 12 loaded / 36 reserve rounds (48 total). Node simulation and DOM-controller regression tests are proposed; real browser usability and the underlying zone-realism P0 remain **unverified / release-blocking** until independently tested and redesigned.

## 2026-10-31 GPU context-loss continuity candidate

BR and CH01 PC browser controllers now pause/checkpoint on WebGL context loss, recreate the renderer on restoration, and require explicit manual resume. Recovery failures leave game controls disabled instead of advancing an invisible match. Desktop DOM-mock regressions cover successful restoration and failure-to-recreate paths. This is **not** a real-GPU context-loss playtest, QHD 165Hz benchmark or Unreal acceptance result; the release checklist remains unchecked.
