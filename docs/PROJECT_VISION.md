# VEILPOINT — Product Vision & Engineering Quality Gates

**Owner objective:** Deliver an original, visually convincing first-person battle-royale game that minimizes perceptual discrepancies between real captured footage and interactive scenes. Aim to compete at the highest level of visual fidelity, responsiveness and stability. This is an *aspirational target*, not a claim of current capability or measured superiority over any existing game.

**Recorded:** 2026-10-27 · **Status:** engineering design target, NOT completed implementation.

## 1. Non-negotiable product pillars

1. **Photorealism under interaction.** Physically plausible scale, materials, global illumination, reflections, contact shadows, vegetation, terrain, animation, environmental audio and consistent camera behavior. Evaluate *in motion* and through exposure changes, indoors/outdoors, not just screenshots.
2. **165 Hz-capable experience.** Support a 165 Hz display when selected in the OS/driver, with a configurable render FPS cap up to 165 and V-Sync / latency settings. Never confuse display frequency with achieved FPS. Simulation is separate from rendering. Performance must be measured on specified hardware; no guarantee of sustained 165 FPS.
3. **Complete battle-royale gameplay.** A polished, original loop: navigation, survivability, traversal, interactions, objectives, shrinking play area, spectators, accessibility and finish/restart. Validate authoritative multiplayer before claiming online-ready.
4. **Reliability and player agency.** Stable frametimes, secure authoritative state, anti-cheat-by-design, understandable graphics options, input remapping, motion accessibility (motion blur / head bob / camera shake toggles), clear opt-in diagnostics.
5. **Originality and licensing.** No copying third-party game assets, proprietary code or recognisable protected designs. Source and distribution licences of externally obtained textures/meshes/audio must be recorded.

## 2. Technical architecture

- **Production fidelity path:** Unreal Engine 5.x project and original/licensed physical-based assets. Use Nanite where appropriate for high geometric detail; Lumen for realistic dynamic lighting and reflections where performance permits; Virtual Shadow Maps and TSR where justified by benchmarks. Compare options before enabling globally.
- **Prototype path:** keep the existing browser demo as a gameplay and automated-test sandbox, not a substitute for the final PC renderer.
- **Network architecture:** dedicated authoritative server with validation, reproducible simulation where feasible, interest management, profiling and latency/paket-loss tests.
- **Graphics scalability:** separate **HyperReal 165Hz** (perceptual quality and high-refresh responsiveness together, tested against measured frame-time budgets), **Cinematic Maximum** (absolute visual quality priority), Ultra Photoreal, Balanced Quality, Smooth Performance, Power Saver, and separate Custom controls. No promise that extreme photorealism and 165 FPS coexist on all hardware.
- **Display:** user-selectable frame-cap levels (30/60/90/120/144/165 FPS), frame time overlay and benchmarking; separate monitor refresh configuration (OS/driver), V-Sync and screen-mode controls for actual desktop builds.

## 3. Testable acceptance gates (targets, not present achievements)

| Dimension | Target evidence | Current status |
| --- | --- | --- |
| Visual plausibility | Multiple fixed indoor/outdoor, day/night, still and moving test scenes; recorded comparisons against consented real reference footage, blind reviewer assessment and documented artifacts | Not measured |
| 165 Hz support | True 165 Hz monitor with 165 Hz OS mode; proof of frame cap, V-Sync behavior, measured FPS and frametimes from a **named CPU/GPU/resolution** | Not hardware-validated |
| Performance | For 165 FPS, frame budget is **1000/165 = 6.06 ms**. Capture CPU/GPU P50/P95/P99 frametimes and 1% low FPS on each target build; document falling-short cases honestly | Not measured on target hardware |
| Rendering | Verify dynamic light adaptation, material roughness, reflections, edge artifacts, TAA/TSR ghosting, motion and foliage aliasing across camera sweeps | Not measured |
| Input and accessibility | Remappable controls, sensitivity curves, lower latency, optional minimal camera shake/head bob and motion blur | In progress |
| Multiplayer | Dedicated-server functional tests, adversarial input validation, network latency/loss tests, 24h soak test and deterministic replay diagnostics where possible | Not achieved |
| Regression | Automated tests must pass; engine build must compile on an installed UE development environment | Browser tests exist; UE compile unverified |

## 4. Engineering milestones

- **Phase A: foundation.** Maintain working prototype, robust tests, reproducible CI, renderer/profile telemetry, documented target hardware and baseline video captures. Unreal project must compile on a real build machine.
- **Phase B: photoreal vertical slice.** One small, authored high-quality environment with licensed PBR assets, Nanite/Lumen/TSR optimization, real-time lighting, believable traversal and audio; capture comparison benchmarks.
- **Phase C: online proof.** Server-authoritative match slice, scalable world systems, networking, accessibility, observability and performance tests.
- **Phase D: production extension.** Expand content/scale only after measured visual fidelity, stable controls and reproducible performance.

**One-month expectation:** Deliver a tested, documented vertical slice and reproducible performance evidence if assets, engine build environment and hardware are available. A world-leading finished commercial game cannot responsibly be guaranteed in one month.

## 5. Mandatory status reporting for each development increment

Every update must state: changed files/commit or PR URL; actual tests and environments; measured CPU/GPU FPS or frametimes if real hardware was available; visual changes; outstanding limitations, blockers and next highest-priority step. Never mark unsupported visual quality, sustained 165 FPS, full multiplayer, production readiness or comparative superiority as achieved.

## Official UE technical references

- Lumen: https://dev.epicgames.com/documentation/unreal-engine/lumen-technical-details-in-unreal-engine
- Nanite: https://dev.epicgames.com/documentation/unreal-engine/nanite-in-unreal-engine
- TSR: https://dev.epicgames.com/documentation/ko-kr/unreal-engine/temporal-super-resolution-in-unreal-engine

## 6. Graphics settings and accelerated milestone (2026-10-27)

The flagship profile is HyperReal 165Hz: keep as much realistically perceived detail as possible while progressively reducing measured rendering bottlenecks to target 165FPS on capable hardware. See [Graphics Profiles](GRAPHICS_PROFILES.md) for six modes and granular adjustments, and [30-Day Sprint](30_DAY_SPRINT.md) for accelerated hourly implementation and quality gates. Real 165Hz output, highest visual fidelity and full native engine compilation are not yet verified.
