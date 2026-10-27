## v1.2 — 165 Hz monitor target (2026-10-27)
- Configurable render cap up to 165 FPS, FPS HUD, persisted browser settings, fixed 60 Hz simulation.
- Unreal Engine default game user settings and render smoothing upper frame cap at 165 FPS.
- Added deterministic synthetic pacing tests and clarified that monitor 165 Hz is controlled by OS / GPU driver.

# VEILPOINT Changelog

## 1.1.0 — 2026-10-27

- Created `src/clock.js` to decouple 60Hz gameplay updates from render FPS.
- Enforced upper limits on catch-up ticks after pauses, backgrounding, and slow frames.
- Updated browser loop to use a fixed simulation step and reset on focus loss.
- Added seven focused timing/determinism tests (`tests/clock.test.cjs`).
- Extended quality gates and updated browser build markers.

## 1.0.0

- Original offline browser battle royale demo and Unreal project scaffold.


## v1.4 — performance integrity (2026-10-27)

- Reuse WebGL dynamic mesh buffer instead of allocating a new GPU buffer every rendered frame; grow backing storage only as needed.
- Add asynchronous WebGL2 GPU timer-query sampler (when extension is supported) and CPU/callback P50/P95/P99 telemetry.
- Add opt-in, GPU-gated adaptive resolution with quality-preserving bounds, hysteresis, cooldown and settings-panel diagnostics.
- Add unit and fake-WebGL integration tests for timer-query cleanup/disjoint results, statistics, governor behavior and buffer reuse.
- Native UE5 compilation and hardware 165Hz benchmarks remain unverified.


## v1.5 — native graphics presets and CPU-bound quality protection (2026-10-27)

- Added UE5 `UVPGameUserSettings` class exposing six graphics presets and Custom FPS, resolution percentage and V-Sync via Blueprint functions; registered class in `DefaultEngine.ini` and persisted defaults in `DefaultGameUserSettings.ini`.
- Added native integration guide and offline structural tests (not a UE C++ compile test).
- Corrected the browser adaptive resolution governor to avoid downscaling during CPU-dominated frame stalls; added four regression tests.
- Native UE compile, visual fidelity and real 165Hz performance remain unverified.
