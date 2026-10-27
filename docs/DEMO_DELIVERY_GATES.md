# VEILPOINT demo delivery gates · 2026-11-27

This is a **delivery target**, not a claim that a playable or photoreal Unreal binary already exists.

## Two tracks (1 solo developer + AI)

**A / Primary: standalone browser demo.** Launch offline using local `index.html` or a local HTTP server. Maintain an end-to-end play loop: menu → spawn → first-person traversal → zone & AI → resources → win/loss → restart. Ensure working graphics profiles, accessible inputs, zero mandatory external dependencies, regression tests and a ZIP containing source + launch instructions.

**B / Stretch: high-fidelity Unreal demo.** One carefully scoped playable environment with original/licensed PBR assets, lighting, traversal and coherent interactions. Only call this playable when it compiles, packages and runs on a real installed Unreal machine. The current repository UE source scaffold is **not** verified. If B is blocked, keep shipping A.

## Release acceptance checklist

- [ ] End-to-end playable session can start, complete and restart without soft-lock.
- [ ] Collision, AI, shrinking zone, looting, HUD, desktop movement and camera tested.
- [ ] 60Hz deterministic game simulation remains separate from render cap.
- [ ] HyperReal 165Hz plus Cinematic Maximum, Ultra Photoreal, Balanced Quality, Smooth Performance, Power Saver and Custom work; no unverified 165FPS guarantee.
- [ ] Real CPU/GPU/monitor results are provided *only if actually measured*. 165FPS has a 6.06ms/frame target.
- [ ] `npm run verify` passes at release commit, with exact command/output; GitHub Actions is green at that SHA.
- [ ] Self-contained ZIP, README instructions, relevant licence inventory, changelog and checksum generated.
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
