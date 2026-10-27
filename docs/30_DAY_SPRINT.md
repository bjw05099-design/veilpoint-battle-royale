# VEILPOINT — 30-day accelerated production plan

Start: 2026-10-27 11:00 Asia/Seoul. The automation began with a 744-run plan but was extended to an **open-ended hourly recurrence**. It runs at scheduled executions, subject to platform/account limits. Work happens at individual scheduled executions, not continuously in between; tool or compute limits can cause an iteration to be blocked.

## Throughput policy

For each execution: (1) inspect repository HEAD and latest test results, (2) choose the largest independently testable user-facing improvement feasible, (3) implement complete related modules and any needed tests/integration, (4) run available verification and document limitations, (5) commit the real files and report exact URL and test status. Prefer one coherent working feature with relevant tests over many disconnected lines of code. Do not misrepresent hardware benchmarks, Unreal compilation or finished visual quality.

## Allocation priorities

- Visual realism: 35% (environment, physically plausible lighting and materials, geometry, animation, atmosphere, visual captures).
- Performance and 165Hz readiness: 25% (frame pacing, GPU profiling, upscaling, scene density, resolution policies).
- Player movement, interactions, accessibility and interface: 15%.
- Real-time synchronization, world state integrity and robustness: 15%.
- Automated tests, build pipelines and QA: 10%.

## Milestones

| Phase | Engineering deliverable |
| --- | --- |
| Days 1–3 | Graphics profile settings, test infrastructure, reproducible runtime and engine compilation checklist |
| Days 4–7 | Small high-detail environment, first rendered visual capture, rendering quality baseline |
| Days 8–14 | Natural movement, soundscape, environment interaction, coherent vertical slice |
| Days 15–21 | Online architecture validation, state synchronization, latency resilience and automated tests |
| Days 22–27 | 165Hz frametime instrumentation and selective GPU/CPU optimization, foliage/LOD, accessibility |
| Days 28–31 | Stabilization, packaging attempts, performance evidence, limitations and release notes |

## Measurable quality gates

The target 165FPS corresponds to 6.06ms per frame, but successful implementation must be demonstrated on 165Hz hardware and identified GPU/CPU. Report measured P50/P95/P99 frame times, stutter and actual visual output when available. Browser prototype tests never substitute for a native Unreal Engine build test.

**One-month stretch outcome:** a documented, playable, photorealism-oriented vertical slice with reproducible metrics. This is not a guarantee of a finished best-in-world commercial product.

## 2026-10-27 13:00 iteration — native graphics settings + quality guard

- Native `UVPGameUserSettings` source and engine config wiring now expose six Blueprint-selectable profiles, persisted defaults, Custom FPS/resolution/V-Sync. A playable Unreal menu is not yet implemented.
- Browser GPU-resolution governor now avoids unnecessary quality loss during CPU-bound stalls; regression tests cover CPU-only, GPU-only and mixed load.
- Immediate P0 next step: compile UE project on an installed engine, create an actual settings widget and measure Lumen/Nanite/TSR performance on a 165Hz display. Without that hardware, continue with deterministic browser improvements and native compile-check preparation.

## 2026-10-27 14:00 iteration — browser dynamic visibility/LOD

- Added camera-cone visibility and conservative bounding-radius tests for bots, loot, zone pylons and transient effects, with 6/3/1-box bot LOD. Simulation remains independent and deterministic at 60Hz.
- Both WebGL2 and Canvas2D paths use the planner; the settings panel displays planned dynamic vertex counts. New unit and renderer integration checks protect behavior.
- `npm run bench:visibility` reports CPU-only planner time and estimated dynamic vertex reduction; **not** measured GPU FPS or a verified 165Hz display result.
- P0 next: spatially chunk and cull static world geometry, benchmark on actual GPU, test visual transitions in motion, then validate Unreal Engine C++ on installed UE hardware.


## Expanded campaign + multiplayer scope (2026-10-27)

First-month delivery is still an **actually runnable and tested offline browser battle-royale demo**. Prepare original campaign CH01 intro systems (evidence interaction/objective flow, checkpoint, subtitle-friendly UI) if doing so doesn't destabilize the release candidate. For the final game, a fictional Middle Eastern-region war/civil-conflict single-player campaign and real server-authoritative team multiplayer join BR as **required separate pillars**. First native story vertical slice and network client/server prototypes must be objectively tested before any completeness claims. Full roadmap: [Final Release](FINAL_RELEASE_ROADMAP.md); design: [Bible](GAME_DESIGN_BIBLE.md), [Campaign](STORY_CAMPAIGN.md), [Multiplayer](MULTIPLAYER_MODES.md), [Requirements](REQUIREMENTS_MATRIX.md).

## Story-mode scope clarification (2026-10-27)

VEILPOINT is now a three-mode project: **Story Campaign** (~12 authored first-play hours across 12 planned chapters), **Operations Multiplayer**, and **Battle Royale**. See [Campaign Design](CAMPAIGN_DESIGN.md) and [Multiplayer Design](MULTIPLAYER_DESIGN.md). The user's desired experience prioritizes cinematic variation, surprising twists, consequential decisions and meaningful action without monotony. Do not mistake scripted metadata for actual twelve playable hours.

**The Nov 27 offline-demo gate remains first priority.** A playable first campaign mission slice is stretch-only while the original battle-royale demo is stabilised. Native photorealism, tested online matches and the remaining authored story chapters are longer-term work under [Final Release Roadmap](FINAL_RELEASE_ROADMAP.md). Avoid drawing developer effort from demo blockers into untestable cinematic placeholders.
