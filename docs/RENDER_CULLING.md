# VEILPOINT v1.6 — visibility culling and distance LOD

## Implementation

The browser renderer now uses `src/visibility.js` to select **render-only** dynamic objects from the camera's horizontal view cone, with a conservative angular margin and object-radius allowance. The 3D WebGL2 path and Canvas2D fallback both use this plan. Simulation entities remain in the complete game state, including off-screen bots, loot and effects; culling never changes collision, AI, tagging, zone damage or match outcomes.

- Horizontal FOV derives from the renderer's vertical FOV (`Math.PI/3.25`) and viewport aspect ratio.
- Objects closer than their bounding radius are always retained. Visibility extends to 155 world units.
- Bot geometry: **6 boxes** near (<=45 units), **3 boxes** medium (<=90), **1 box** distant. Loot uses **2 boxes** near (<75) or **1** distant.
- Zone perimeter retains 128 logical pylon positions, but generates boxes only for visible/nearby positions. The simulation zone itself remains unchanged.
- GPU buffer reuse from v1.4 is preserved; the visible dynamic mesh is rebuilt per rendered frame.
- Graphics settings panel reports the **planned dynamic vertex count** and visible/active bots; these are CPU-side geometric diagnostics, **not** FPS or GPU performance measurements.

## Repeatable tests

```bash
npm run verify
npm run bench:visibility
```

The planner's 9 unit tests cover camera direction, aspect ratio, near/far bounds, invalid inputs, LOD thresholds, zone visibility, determinism, unchanged simulation state and reduced planned geometry. Renderer fake-WebGL tests verify the generated dynamic vertex count matches the planner. The benchmark sweeps camera yaw over 3,000 plans and prints CPU planning time and estimated geometry reduction; it does **not** render a frame.

## Baseline observation (local Node.js, 2026-10-27)

A development-container CPU-only run with 2,900 post-warmup samples returned approximately **0.025 ms mean planner time**, **0.065 ms P95**, and **82% fewer planned dynamic vertices** than the uncull-all-entities reference across a yaw sweep of the seeded scene. This is a workload-specific **geometry estimate**, not a measured GPU speedup or guaranteed result on another machine. The benchmark is nondeterministic in wall-clock time; rerun on target hardware.

## Known limitations and next P0

1. No GPU/WebGL hardware benchmark or actual 165Hz display verification. Real performance improvement is unknown.
2. Static terrain, buildings and foliage remain one static draw buffer; spatial chunking and view-frustum culling are next.
3. Camera culling uses horizontal FOV with conservative margins; it does not perform occlusion queries or vertical-plane culling.
4. Distance LOD thresholds can create visible changes. Add geometric transitions and real-browser camera-sweep visual regression before release.
5. Native Unreal Lumen/Nanite/TSR and C++ build remain unverified. This browser optimization does not substitute for native rendering validation.
