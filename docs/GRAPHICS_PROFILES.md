# VEILPOINT — 165Hz and graphics-quality matrix

The flagship **HyperReal 165Hz** profile seeks the highest image fidelity available while targeting a stable 165Hz-class display experience. It does not automatically lower all detail settings. Achievement of 165FPS requires independent measurement on specified GPU/CPU and monitor; no guarantee is implied.

## Planned graphics presets

| Profile | Rendering target | Priority |
| --- | --- | --- |
| HyperReal 165Hz | 165FPS limit | Visual fidelity + high-refresh responsiveness together |
| Cinematic Maximum | Image quality first | Highest available detail, slower hardware-dependent rate |
| Ultra Photoreal | 144FPS limit | High resolution sampling and dense environment |
| Balanced Quality | 120FPS limit | Balanced image quality and frame pacing |
| Smooth Performance | 165FPS limit | Responsive rendering with selective workload reductions |
| Power Saver | 60FPS limit | Reduced resource usage |
| Custom | User-selected | Independent settings |

### Browser prototype settings

Six presets are implemented in the v1.3 browser prototype, with saved selections for frame caps (30/60/90/120/144/165FPS), internal resolution scale (50–125%), procedural foliage (35–100%) and film grain (off to full). These are local Canvas/WebGL rendering settings, **not** Unreal Engine production-level photorealism.

The HyperReal 165Hz browser preset selects 165FPS cap, **125% internal resolution**, 100% vegetation, and 100% available film grain effects. These are maximum available prototype visual settings with the maximum selectable frame cap, not proof that any tested system sustains the target.\n\n### Planned native engine controls

Display mode/monitor refresh reporting, V-Sync/VRR, frame-rate limit, native/internal resolution, antialiasing/upscaling, texture/filter quality, view distance/LOD, lighting, reflections, shadow quality, atmosphere, foliage, effects, motion blur, exposure, input latency and accessibility.

At a full 165FPS output the budget is **6.06ms per frame**. Validate P50/P95/P99 CPU and GPU frame time on real hardware; do not infer measured performance from profile labels. Dynamic resolution in Unreal should be implemented only after confirming platform support and profiling its visual artifacts.

Reference: https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine


## Browser v1.4 — GPU-based adaptive resolution and truthful profiling

- Opt-in automatic resolution changes within **70% to the selected resolution ceiling** (or lower if the user explicitly selected a lower fixed ceiling). The user-selected graphics preset, vegetation, effects and FPS cap are **never changed** by the governor.
- Requires WebGL2 `EXT_disjoint_timer_query_webgl2` and **at least 30 valid CPU and GPU samples**; unsupported browsers leave auto-resolution disabled. Query results are read asynchronously without `gl.finish()` and disjoint GPU results are ignored.
- P95 CPU draw-call duration, P95 GPU elapsed-query time and P95 rendered callback intervals are reported separately. These are diagnostics, **not end-to-end frame latency or verified 165Hz monitor FPS**.
- Hysteresis: reduce one resolution notch above 93% of the frame budget, raise one notch only after 3 consecutive low-load windows below 62%, with a 2.5s cooldown. An opt-in control prevents silent quality degradation.
- Fixed a WebGL buffer leak by reusing one dynamic vertex buffer across rendered frames and growing backing storage only when needed. Still requires real-browser WebGL2 testing, GPU profiling and visual artifact assessment.

## Native Unreal Engine graphics presets — v1.5 source scaffold

The native UE source now includes a Blueprint-accessible `UVPGameUserSettings` class with six presets, a persisted selection and independent Custom FPS (30–165), resolution (50–100%) and V-Sync controls. The HyperReal 165Hz native preset selects Unreal Cinematic scalability (tier 4), 100% internal resolution and a 165FPS cap. It seeks maximal quality **within the current engine settings**; it does not imply that the hardware can deliver 165FPS. The `Cinematic Maximum` mode uses the same highest scalability tier but caps at 60FPS. The native widget/menu and actual hardware benchmarking are still pending. See [native graphics integration](UNREAL_GRAPHICS_SETTINGS.md).

Browser v1.5 adaptive resolution now explicitly avoids lowering image quality when CPU frame time dominates GPU frame time. A GPU-bound workload still triggers selective downscaling, with existing hysteresis and cooldown. This is a code-level safeguard, not a measured FPS improvement.

## Owner-supplied test hardware — NVIDIA RTX 3070 and 165Hz monitor (2026-10-27)

The owner states that a PC with an **NVIDIA GeForce RTX 3070 GPU** and **165Hz monitor** can be used for VEILPOINT testing. This is the **primary available reference test configuration**, not evidence that ChatGPT, CI or GitHub Actions can remotely access that PC. The display's native **QHD 2560×1440 resolution is confirmed**. Whether it is a desktop or laptop 3070, the CPU, display cable/VRR, driver versions, thermals and storage have **not** been provided; capture these remaining details before publishing benchmarks.

**Design/test priority:** Optimize for clear and responsive high-refresh gameplay while retaining the strongest attainable grounded photorealism. Treat HyperReal 165Hz as a simultaneous *quality + high-refresh aspiration*, not a guarantee; use Smooth Performance as an independently measured 165FPS-oriented option, Balanced Quality for image/consistency trade-offs, and Cinematic Maximum for fidelity-first playback. Do not impose a global lower image-quality setting just because the GPU model is known. Shader compilation, VRAM limits, dense city/vehicle scenes, input responsiveness and consistent frame delivery must be measured before changing defaults.

**Acceptance procedure on owner's PC:** For each mode and preset, measure confirmed native **2560×1440 QHD output** as the primary case, with optional 1920×1080 comparison; fullscreen mode, native vs upscaling method, graphics settings, CPU/GPU/RAM/VRAM, OS, driver and monitor refresh/VRR. Capture at least one representative timed gameplay sequence plus difficult scene; report median FPS, 1% lows and P50/P95/P99 **CPU and GPU frame times**, stutter spikes, sustained stability and subjective image-quality regressions. At **165FPS**, the frame budget is approximately **6.06ms** and sustained FPS must be verified at the displayed resolution. Explicitly separate 165Hz monitor refresh from 165FPS render output. The browser's fixed 60Hz **simulation step** does not force 60FPS rendering.

**Implementation gate:** First build a runnable native or browser artifact and an unambiguous reproducible benchmark script/manual protocol. The AI automation may prepare builds, CI and measurement instructions, but cannot claim measurements on the owner's RTX 3070 or actually use the hardware without a verified connected execution environment or results shared by the owner. The AI-generated preview images are visual targets only, not actual in-engine captures.


## Confirmed primary owner display: QHD 2560 × 1440 at 165Hz (2026-10-27)

**Confirmed by owner:** VEILPOINT's primary available target setup is an **NVIDIA RTX 3070 PC and a native-resolution QHD (2560×1440) 165Hz display**. The PC is not connected to the AI build or CI environment; the owner reports 16GB system RAM, but no actual FPS, frame times, drivers, CPU, installed-memory measurement, GPU desktop/mobile variant or visual-quality results are verified. Always distinguish final 2560×1440 **display/output** resolution from internal render resolution and from 165Hz versus 165 rendered frames per second.

### Native-engine performance acceptance targets — QHD output; NOT measured/guaranteed

| Preset | Planned FPS cap | Target on RTX 3070 QHD | Image-quality / tuning policy |
| --- | --- | --- | --- |
| **Cinematic Maximum** | 60 | Fidelity-first ~45–60 FPS is a tuning goal, not an expectation | Maximize believable PBR, lighting, shadows, character detail and cinematic image quality; reduced FPS may be necessary, expose measured cost |
| **Ultra Photoreal** | 144 | Try for **at least 60 stable FPS** before pursuing 90; 144 is only the configured cap | Prioritize near-photoreal quality and stable output; optionally compare TSR/DLSS Super Resolution Quality vs native output |
| **Balanced Quality** | 120 | Target **90–120 FPS** as a stretch pending real scenes/CPU | Preserve natural image/geometry; spend frame budget carefully on light, shadow, reflection, visible detail |
| **Smooth Performance** | 165 | Target **120 FPS first**, then stretch to sustained 165 only if quality and playability remain acceptable | Prioritize low latency, culling, LOD, shadows, reflections, VFX budgets and quality-preserving upscaling |
| **HyperReal 165Hz** | 165 | **165 sustained FPS plus near-maximum fidelity is an aspirational stretch**, not a minimum guarantee | Do not secretly force all quality to low to meet FPS; report honestly when both cannot fit in one RTX 3070 frame budget |
| **Power Saver** | 60 | Stable 60 FPS, power/thermals prioritized | Reduced complexity and optional frame limiting |
| **Custom** | User-selected | User controls FPS cap, output/internal scaling, V-Sync/VRR, visuals and upscaling independently | Always disclose actual measured rendering throughput |

These are **design tuning targets, not estimated hardware benchmarks**; no compiled, packaged native VEILPOINT scene was benchmarked. In demanding scenes, quality-first native rendering may fall well below targets and the game must expose a clear preset/performance trade-off instead of pretending otherwise. No preset should introduce fantasy mechanics or visual cheating inconsistent with the game's strict physical realism requirement.

### Numerical frame-time targets and performance reporting

- **60 FPS**: 16.67ms/frame; **90 FPS**: 11.11ms; **120 FPS**: 8.33ms; **144 FPS**: 6.94ms; **165 FPS**: 6.06ms.
- Target **P95 total presented frame interval below the target budget** on representative *heavy* live gameplay once optimized. Also report P50/P95/P99 separately for GPU time, CPU game/render-thread time, delivered frame intervals, FPS P50 and 1%-low, hitches and input latency where measurable. CPU/GPU timings overlap and must not simply be added.
- Benchmark at **QHD 2560×1440 output**, recording internal resolution and upscaler mode; compare native QHD, Unreal TSR, DLSS Super Resolution Quality and Balanced **only where natively integrated/tested**. Use a clear native-vs-upscaled annotation on captured footage. RTX 3070 supports **DLSS Super Resolution** but **not NVIDIA DLSS Frame Generation**, so do not count fictitious generated frames toward 165 real FPS. NVIDIA DLSS source: https://www.nvidia.com/en-us/geforce/technologies/dlss/.
- Measure in at least (a) outdoor harbor urban wide shot, (b) wet/reflective night street, (c) indoor character-rich scene, (d) intense effects-heavy fictional firefight, and (e) vehicle driving; repeat a reproducible 120-second camera/player path after warmup in each scene, when the scene exists. Record shader-compile hitches and asset-streaming/VRAM-pressure separately.
- Prioritize **stable frametimes and believable clarity** over synthetic high averages: manage VRAM residency/texture streaming, Nanite geometry budgets, Lumen GI/reflection tiers, shadow maps, transparency/VFX, draw calls, occlusion/LOD, shader warmup and hitch reduction; minimize spatial image instability or ghosting on moving characters, vehicles, crosshairs and vegetation. Lumen quality tiers have substantial different costs: https://dev.epicgames.com/documentation/en-us/unreal-engine/lumen-performance-guide-for-unreal-engine.
- Define three measured outcomes per preset: **pass** (reference hardware and all required scenes meet stated budget and visual quality gate), **limited** (some scenes or graphics trade-offs prevent meeting it), or **unverified** (no build/owner-PC benchmark). Keep the RTX 3070 QHD 165Hz results **unverified until real evidence**.
- Preserve the **60Hz fixed gameplay simulation** where still used in the browser demo; this is separate from GPU rendering refresh and monitor scanout. Do not assert 165FPS from a menu option or capped render callback.

### Hardware details not yet supplied

Exact laptop CPU SKU (owner describes it as AMD mobile '9-series', possibly Ryzen 9); RTX 3070 desktop versus mobile/TGP and GPU video memory; Windows version, drivers; monitor VRR/G-Sync/FreeSync support and connection type. Record these when the owner runs the first playable benchmark. The owner's **16GB system RAM** and **QHD 2560×1440 165Hz** display have been stated; the GPU's VRAM is separate from system memory.


## Owner correction: 16 GB **system RAM** (2026-10-29; supersedes 8GB note)

**Reported configuration (corrected by owner):** RTX 3070 GPU, QHD 2560×1440 165Hz display, and **16GB installed system RAM** (the earlier 8GB statement was incorrect). This is reported system memory, not graphics VRAM. Verify installed and usable memory via Windows Task Manager when a device benchmark is performed. GPU VRAM is independent and must be profiled separately; desktop and laptop RTX 3070 configurations may differ.

**Constraint assessment:** 16GB of system RAM provides more headroom than the previously assumed 8GB and makes lightweight UE5 editor work and packaged game testing more practical. It remains below Epic's UE5 **32GB recommended development-workstation RAM**. Complex scenes, simultaneous asset tools, shader compilation and a running editor can still encounter memory pressure; measure instead of treating this correction as confirmed game performance. See https://dev.epicgames.com/documentation/unreal-engine/hardware-and-software-specifications-for-unreal-engine.

### Memory-focused build and test gates

1. Treat **16GB system RAM + RTX 3070 + QHD 165Hz** as the owner-reported compatibility profile. Continue prioritizing the working offline browser demo and small packaged UE slices before complex editor workloads. No tested FPS or stability improvement is implied by this specification correction.
2. Track actual **OS available/committed RAM, game process working set/private bytes, memory peak, page faults/hard faults, disk paging, asset streaming stalls, CPU utilization and GPU VRAM usage** during launch, scenes, loading and 120-second gameplay runs. Report alongside P50/P95/P99 frame intervals and scene FPS. Do not apply the former 8GB-based 3–4GB working-set planning assumption as a measured limit. Establish a packaged-game memory budget only after observing OS headroom, commit, peak working set, paging and workload on the 16GB system. Do not infer feasibility from source code alone.
3. Budget **CPU RAM and GPU VRAM separately**: memory-conscious scene/entity/LOD streaming, compressed/reused textures and mesh resources, limited simultaneous loaded levels, bounded pools, predictable preloading, cache/resource lifecycle cleanup and no avoidable duplicate asset buffers. Quality adjustments must not introduce implausible/fantasy gameplay elements; preserve physically believable scenes. Do not claim the game's intended high-fidelity PBR target is fully achieved on low-memory hardware until proven.
4. Avoid excessive simultaneous UE editor, digital content tools, shader compilation and multiple network clients on the 16GB system. Use CI/cloud compute where connected/available, and maintain source tests independently of the user's local machine. Prepare a small packaged build and repeatable benchmark rather than claiming direct access to their hardware.
5. **Upgrade guidance (not a condition of development):** The user already reports **16GB system RAM**, a more practical starting point than 8GB for packaged games and lightweight editing. **32GB remains the UE5-recommended development target** when heavy editing, asset creation or memory pressure makes expansion valuable. Do not assume an upgrade or 16GB alone guarantees QHD 165FPS.
6. On a measured memory-bound failure, report which mode/scene causes it and improve caching/streaming first. Mark QHD high-fidelity 165FPS with 16GB system RAM as an **aggressive, unverified stretch**, not an expected result.


## Owner CPU note: AMD laptop '9-series' (model not confirmed)

Owner self-report (2026-10-27): "노트북용 amd9시리즈" (AMD 9-series for laptop; user thinks middle-tier). **Do not convert this into a verified exact SKU or CPU performance tier.** Working assumption: an AMD mobile processor that the owner may mean to call Ryzen 9; it could mean an AMD mobile generation/series instead. Confirm via Windows Task Manager > Performance > CPU or Windows Settings > System > About. Examples such as AMD Ryzen 9 7940HS vs 7940HX differ significantly in core count and configured power, and are **examples only**, not an identification of this PC: https://www.amd.com/en/products/processors/laptop/ryzen/7000-series/amd-ryzen-9-7940hs.html and https://www.amd.com/ko/products/processors/laptop/ryzen/7000-series/amd-ryzen-9-7940hx.html.

**Portable-workstation benchmark controls:** When this is a laptop, verify whether the RTX 3070 is the **laptop GPU variant** and measure its configured GPU power limit/TGP, CPU processor class and power limit, device cooling/temperature, sustained clock rate, actual iGPU/dGPU renderer selection, AC power vs battery, Windows power policy and throttling during sustained gameplay. RTX 3070 desktop and RTX 3070 laptop must not be treated as interchangeable benchmarks. Do not estimate QHD 165Hz photoreal performance without the exact CPU/GPU variant and reproducible measurements. Use the corrected 16GB RAM compatibility gate and report measured memory/VRAM limitations independently from CPU thermal or GPU power bottlenecks. Keep all 165FPS goals labeled as ambitious and unverified.


## 2026-10-29 browser diagnostic display candidate

The browser graphics panel now displays bounded sample counts and P50/P95/P99 for CPU draw calls, optional WebGL2 GPU elapsed timer queries, and render callback intervals. Missing GPU query support remains explicitly `측정 불가` rather than a fabricated GPU frame time. The 60Hz game simulation and independent FPS cap remain unchanged. These diagnostics are **not** native UE frametimes, display presentation timings, end-to-end input latency, QHD 165Hz hardware proof or a 16GB system-RAM measurement. Verify on the owner's actual machine before using them as performance acceptance evidence.

### 2026-10-31 GPU timing disjoint recovery (browser candidate)

WebGL2 disjoint timer events now end/delete any active query, discard pending invalid results and pause query creation until the disjoint state clears. The renderer notifies the BR controller once per event, clearing old CPU/GPU/render-interval telemetry before the opt-in resolution governor can act on fresh samples. Two deterministic Node tests exercise pending and active query invalidation, recovery, and stale-sample rejection. This improves **integrity of prototype performance diagnostics**, not measured QHD 165FPS, native Unreal rendering, GPU performance, or user-device validation.


## 2026-11-01 browser PC benchmark instrumentation (candidate)

The BR graphics panel now provides a **user-armed** 5-second warmup plus 120-second capture that exports a local JSON report. This records actual rendered callback intervals and CPU renderer-draw calls; asynchronous WebGL2 GPU timer samples are exported only when supported and valid. A GPU timer disjoint invalidates the GPU sample series. The report includes output viewport dimensions, selected frame cap and observed render-scale range, but the app cannot verify physical monitor 165 Hz, exact CPU/GPU model or system RAM. Loss of focus/pause creates an explicitly incomplete run. The 60 Hz game simulation remains unchanged. This is a browser code and test milestone, **not** a native UE5, QHD 165 FPS, end-to-end latency or RTX 3070 benchmark result. Real Windows measurements remain required.
