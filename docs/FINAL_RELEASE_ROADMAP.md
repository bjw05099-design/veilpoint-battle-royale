# VEILPOINT — Six-Month Final Release Roadmap and Open-Ended Quality Program

**Effective:** 2026-10-27 (Asia/Seoul)
**Final-version stretch deadline:** 2027-04-27
**First deliverable:** playable demo by 2026-11-27
**Team:** one human developer + scheduled AI development support

> This document records *targets*, not achieved quality. The final game will not be called 'best in the world' without repeatable evidence from finished native builds, actual performance testing and independent comparative evaluation.

## Mission

Create an original, highly believable first-person battle-royale game with industry-leading aspirations for visual realism, cohesive playability, stability, responsiveness, accessibility and online integrity. Preserve the full six named graphics presets plus Custom. HyperReal 165Hz aims to maximize both perceived quality and high-refresh responsiveness *on capable hardware*; do not pretend 165 Hz means sustained 165 FPS.

## Timeboxes and evidence of completion

| Period | Target | Exit evidence |
|---|---|---|
| 2026-10-27 → 2026-11-27 | **Demo milestone**: playable offline game from menu through complete match, restart, responsive settings and full release package. Native high-fidelity UE vertical slice is stretch-only if compilable. | Identified platform launch, end-to-end smoke test, deterministic tests/CI and package checksum |
| 2026-11-28 → 2026-12-27 | **Native baseline**: verify UE toolchain/build on real machine, movement, first environment art/lighting, materials, animation and audio placeholders with proper asset rights. | Engine/editor version, complete compile/packaging logs, screenshots/gameplay capture and reproducible issue list |
| 2026-12-28 → 2027-01-27 | **High-fidelity vertical slice**: coherent detailed map segment, visual consistency under camera movement, soundscape and expanded interaction. | Demonstrated playable native slice with qualitative and quantitative visual evidence |
| 2027-01-28 → 2027-02-27 | **Gameplay + networking**: complete offline loop, server-authoritative state prototype, fail-safe interactions and network degradation tests. | Repeatable offline QA plus documented dedicated-server tests where available; no fake multiplayer completeness |
| 2027-02-28 → 2027-03-27 | **Performance + content**: optimize graphics/CPU/GPU and frame pacing; prepare target-hardware settings, optimize effects/foliage/shadows. | P50/P95/P99 frametimes, 1% low FPS, resolution/GPU/CPU/monitor, gameplay regression evidence |
| 2027-03-28 → 2027-04-27 | **Release candidate**: integrate systems, accessibility, content rights, security review, soak tests, packaging, changelog and known limitations. | Tested build, reproducible release artifacts, complete acceptance checklist and major-blocker closure |
| 2027-04-28 onward | **Open-ended quality improvement** if conditions are not met. | Repeatable issues/PRs, real improvements and transparent release-gate reporting |

Dates are ambitious planning targets, not promises of completion. Unreal build support, high-quality licensed assets, suitable GPU/165Hz monitor, human launch tests and internet networking infrastructure are critical external dependencies.

## Release acceptance gates (all mandatory for *final complete*)

1. **Playable and stable:** game launches, plays start-to-finish, supports repeated sessions, safe recovery and no known major release-blocking defects. Record actual native executable evidence.
2. **Native photoreal rendering:** UE app fully compiled and packaged; original/licensed PBR materials/assets, plausible lighting, exposure, shadows, reflections, vegetation, model quality, animation and audiovisual coherence. Capture moving-video samples across multiple scenes.
3. **Real performance:** measurements on specified CPU/GPU/resolution/monitor in genuine 165 Hz OS mode with display/cap/V-Sync/VRR states distinguished. 165FPS is ~6.06 ms/frame; publish P50/P95/P99 CPU/GPU frame timings and representative low-percentile FPS. No universal 165 FPS claim.
4. **Gameplay depth and balance:** polished first-person movement, interactions, credible AI, zone phase behavior, match lifecycle, menus and configurable control/audio/graphics options.
5. **Online integrity:** if marketed as multiplayer, dedicated-server authoritative simulation, validation, predictable state synchronization, packet loss/latency recovery, session operations, adversarial tests and security/privacy review are required.
6. **Accessibility and compatibility:** remappable control or practical alternatives, reduce-motion options, readable HUD, settings persistence, documented supported hardware, crash/soak tests and test matrix.
7. **Comparative quality:** independent playtesters and blind assessment of comparable captured footage from current leading realistic FPS games, using equal recording conditions and disclosed methodology. Different 'best' dimensions must be judged separately (graphics, performance, gameplay, stability). No single unverified subjective 'world-best' certification.
8. **Release hygiene:** rights inventory, repeatable build pipeline, green CI at release commit, redistributable binaries, checksum, version/tag, changelog, known issues and installation guide.

## Hourly automation operating rules

- Inspect GitHub default branch, open work, CI status and this roadmap at each iteration. Modify **only** bjw05099-design/veilpoint-battle-royale.
- Prioritize the highest release-blocking work. Build coherent function + test + integration + documentation bundles, not arbitrary large code.
- Maintain a continuously playable browser fallback alongside native UE advancement; do not mislabel offline browser prototype as finished native multiplayer.
- Verify via actual tests before claiming improvement. Report changed files, lines if measured, passed/failed tests, PR/commit links, benchmark conditions, explicit blockers, next P0 and milestone status.
- **Do not stop the hourly automation merely because April 27 2027 arrives.** If mandatory gates are unmet, continue with measurable improvements. Even if all gates appear met, present the evidence and request the owner's confirmation before any voluntary stop.
- External automation scheduling and tool limits can still interrupt execution; do not guarantee uninterrupted perpetual operation. Never invent extra worker time or unobserved benchmark results.

## Current status at inception

Browser-based functional prototype and CI-oriented source exist. Unreal source is a scaffold without verified native compilation; an installed UE build environment and reproducible graphics benchmark remain prerequisites. A first-month demo is **the primary immediate gate**, while six-month commercial completion is a stretch target.
