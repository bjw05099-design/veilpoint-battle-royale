# Graphics and performance quality gates

- [ ] Verified representative 4K, 1440p, 1080p captures from shipping GPU renderer
- [ ] Side-by-side calibrated, blind-reviewed comparison with named baseline
- [ ] Lumen bounce lighting/occlusion verified with indoor/outdoor transitions
- [ ] Nanite or alternative geometry budgets measured (overdraw, vertex, VRAM)
- [ ] Virtual Shadow Map temporal stability and foliage shadow quality measured
- [ ] PBR calibration (neutral white, roughness, normal intensity) under reference light
- [ ] Film response measured (exposure, highlights, camera artifacts) with motion comfort options
- [ ] Effects accessible without strong motion blur/film grain/flicker
- [ ] GPU p50/p95/p99 frame time and CPU game/render thread profiles under representative action
- [ ] Tested at several scalability presets and minimum hardware

**Do not equate** a high-resolution screenshot, renderer toggle, or engine version with superior realism. All comparisons require the same camera composition, physical lighting assumptions, similar scene complexity, specified settings, and evidence.

## v1.1 fixed-step quality results

- Node regression tests verify an identical 120-step game state at 30, 60 and 144 render FPS.
- 60 Hz fixed simulation with bounded catch-up (8 steps and 250 ms frame clamp).
- Tab hiding and window blurring reset fractional accumulation.
- The browser WebGL2 rendering path and Unreal C++ have **not** been evaluated by this test suite.

## 165 Hz quality acceptance criteria (v1.2)

- [x] 165 FPS cap option implemented for browser output; separate from 60 Hz simulation.
- [x] Synthetic 165 Hz pacing and cap tests included in Node CI.
- [ ] Confirm Windows/macOS display actually reports 165 Hz and browser renders at appropriate callback cadence.
- [ ] Test real GPU CPU/GPU frame time (165 Hz frame budget ≈ 6.06 ms), tearing, V-Sync, latency and frame consistency.
- [ ] UE fullscreen mode enumeration, V-Sync and 165 Hz monitor validation on a real display.
