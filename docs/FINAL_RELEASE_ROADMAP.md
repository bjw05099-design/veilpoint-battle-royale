# VEILPOINT — Six-Month Final Release Roadmap and Open-Ended Quality Program

**Effective:** 2026-10-27 (Asia/Seoul)
**Final-version stretch deadline:** 2027-04-27
**First deliverable:** playable demo by 2026-11-27
**Team:** one human developer + scheduled AI development support

> This document records *targets*, not achieved quality. The final game will not be called 'best in the world' without repeatable evidence from finished native builds, actual performance testing and independent comparative evaluation.

## Mission

Create an original, highly believable first-person game combining a Middle East-inspired fictional civil-war story campaign, team multiplayer and battle royale with industry-leading aspirations for visual realism, cohesive playability, stability, responsiveness, accessibility and online integrity. Preserve the full six named graphics presets plus Custom. HyperReal 165Hz aims to maximize both perceived quality and high-refresh responsiveness *on capable hardware*; do not pretend 165 Hz means sustained 165 FPS.

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
4. **Gameplay depth and balance:** completed single-player campaign chapters and branching evidence-driven narrative, polished first-person movement, interactions, credible AI, zone phase behavior, match lifecycle, menus and configurable control/audio/graphics options.
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


## Expanded scope decision — story, multiplayer and original identity

Required full-version experiences are **STORY / The Broken Signal**, **MULTIPLAYER / District Control / Relay Run**, and **BATTLE ROYALE / Last Signal**. The previous single-mode battle-royale definition has been superseded; however, existing browser BR work must not be discarded. See [Game Design Bible](GAME_DESIGN_BIBLE.md), [Story Campaign](STORY_CAMPAIGN.md), [Multiplayer Modes](MULTIPLAYER_MODES.md) and [Requirements Matrix](REQUIREMENTS_MATRIX.md).

- **By 2026-11-27:** first priority remains a working, packaged *offline* BR browser demo; stretch: a first small story mission. Do not block demo shipment on unimplemented internet multiplayer or the full story.
- **Nov–Jan:** build and test the native UE vertical slice; create CH01 story mission with dialogue/subtitles, signal evidence and stable checkpoints, introducing Nahrin and protagonists. Produce original/licensed assets.
- **Jan–Feb:** stand up a real authoritative small-session multiplayer test (first 2 clients, then objective mode), then scale BR rules using identical trustworthy lifecycle primitives. Written mode rules alone are not evidence of networking.
- **Feb–Apr:** expand story chapters according to achievable capacity, stabilize modes, tune native visual fidelity and 165Hz metrics, prepare release packaging and multiplayer security/operations.
- **After 2027-04-27, if incomplete:** continue improvements until all P0 requirements and evidence gates pass; do not call a partial one-chapter game the *final* complete multi-mode game.

**Additional final release tests:** campaign start/finish/reload and accessibility, branching record state and complete intended chapter set; two real network clients per mode with dedicated-server authority and fault tests; complete BR session; original design/cultural review; real performance/visual comparison. This more expansive scope substantially increases schedule and staffing risks for one human developer, and no six-month delivery guarantee is made.

## Scope expansion: three modes and twelve authored campaign hours (2026-10-27)

The owner's final product now **requires** (a) a 12-chapter **Story Campaign** with median first-play runtime near **12 hours** (target 10–14 hours after real external testing), (b) original multiplayer objective modes and validated dedicated authoritative servers, and (c) battle royale. The narrative is set in a **fictional** Middle Eastern state amid civil conflict, with cinematic pacing, surprising scene shifts, high engagement and meaningful slower moments; it is not an adaptation of a real war or another game's story. Protect distinct creative identity rather than reproducing Call of Duty, GTA, PUBG or Bodycam content. See [Campaign Design](CAMPAIGN_DESIGN.md) and [Multiplayer Design](MULTIPLAYER_DESIGN.md).

The current **November 27 demo** is unchanged: a playable offline demo, with *one* campaign intro chapter vertical slice as stretch if feasible. The April 27, 2027 whole-game target is now materially **higher risk** because of twelve fully authored story hours, multiplayer infrastructure and 1-person production capacity. It remains a stretch objective, not a guaranteed delivery date. After April, continue hourly work if essential release gates are unmet, subject to service limits; never claim unbuilt hours or multiplayer to be complete. The definition of final-ready now adds: each of the twelve campaign chapters must be launched and played end-to-end, checkpoints/branching must be regression tested, first-play length measured from actual players (not simply summed metadata), and both online modes must be actually server-tested.

## Campaign protagonist / combat requirements update (2026-10-27)

The binding narrative is now [Combat Campaign Canon](COMBAT_CAMPAIGN_CANON.md): **대한민국 특수부대 서진혁 대위** as fixed playable lead throughout twelve chapters; **fictional 국가정보원(국정원) characters 윤서하 and 강민재** as principal collaborators; high-intensity but varied **combat-first** campaign game loop (authored target 60–65% of interactive runtime). Keep the already designed Middle East-inspired *fictional* Sahir Coast/Nahrin civil-conflict world. Previous campaign descriptions that imply Mara or other civilians are the primary playable character are superseded; they remain prominent supporting NPCs. This changes the full-release acceptance gates: real military-themed combat gameplay, mission variety, continuity of captain's viewpoint and supporting characters across the twelve **playable** chapters require QA evidence. No change to Nov 27 demo priority, six-month *stretch* goal, ongoing automation, online multiplayer or hardware-verified performance requirements. 
