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

The owner states that a PC with an **NVIDIA GeForce RTX 3070 GPU** and **165Hz monitor** can be used for VEILPOINT testing. This is the **primary available reference test configuration**, not evidence that ChatGPT, CI or GitHub Actions can remotely access that PC. Whether it is a desktop or laptop 3070, the CPU/RAM, monitor resolution, display cable/VRR, driver versions, thermals and storage have **not** been provided; capture all of these before publishing benchmarks.

**Design/test priority:** Optimize for clear and responsive high-refresh gameplay while retaining the strongest attainable grounded photorealism. Treat HyperReal 165Hz as a simultaneous *quality + high-refresh aspiration*, not a guarantee; use Smooth Performance as an independently measured 165FPS-oriented option, Balanced Quality for image/consistency trade-offs, and Cinematic Maximum for fidelity-first playback. Do not impose a global lower image-quality setting just because the GPU model is known. Shader compilation, VRAM limits, dense city/vehicle scenes, input responsiveness and consistent frame delivery must be measured before changing defaults.

**Acceptance procedure on owner's PC:** For each mode and preset, record 1920×1080 and/or the monitor's actual native resolution (do not assume which); fullscreen mode, native vs upscaling method, graphics settings, CPU/GPU/RAM/VRAM, OS, driver and monitor refresh/VRR. Capture at least one representative timed gameplay sequence plus difficult scene; report median FPS, 1% lows and P50/P95/P99 **CPU and GPU frame times**, stutter spikes, sustained stability and subjective image-quality regressions. At **165FPS**, the frame budget is approximately **6.06ms** and sustained FPS must be verified at the displayed resolution. Explicitly separate 165Hz monitor refresh from 165FPS render output. The browser's fixed 60Hz **simulation step** does not force 60FPS rendering.

**Implementation gate:** First build a runnable native or browser artifact and an unambiguous reproducible benchmark script/manual protocol. The AI automation may prepare builds, CI and measurement instructions, but cannot claim measurements on the owner's RTX 3070 or actually use the hardware without a verified connected execution environment or results shared by the owner. The AI-generated preview images are visual targets only, not actual in-engine captures.
