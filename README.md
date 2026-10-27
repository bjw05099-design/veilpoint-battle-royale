# VEILPOINT v1.2 — survival battle royale development prototype

> **Status (2026-10-27): playable browser prototype + uncompiled UE5.8 source scaffold.**
> No claim of Bodycam-equivalent photorealism, shipping readiness, authoritative networking, anti-cheat, or production QA.

VEILPOINT is an original first-person *survival* battle royale prototype. The combat interaction in the browser prototype is a fictional, non-lethal tagging system. The project has no account system, telemetry, external assets, analytics or dependency downloads.

## Quick start

Double-click `index.html` in a modern browser that allows local scripts, or run from the project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. The 3D WebGL2 renderer has a Canvas2D software fallback for browsers or environments without WebGL2. Desktop: WASD movement, mouse look, left click to tag, SHIFT sprint, C crouch, E collect resources. iPad/touch devices: thumbstick, drag-to-look and on-screen action buttons. ESC unlocks pointer. If focus is lost, keyboard movement resets.

### Current gameplay features

- Full offline match loop and replay/restart, 18 seeded bot opponents, final-survivor result screen.
- Large procedural environment with terrain, buildings, vegetation, collision, and supply pickups.
- Six-stage shrinking safe-zone logic, survival outside-zone damage, match timer and minimap.
- Health, rechargeable armor via supplies, stamina and sprint, resource charges, pickup inventory.
- Third-party-free browser rendering: WebGL2 atmosphere/filmic tone mapping/fog + CPU Canvas2D fallback.
- Mouse + touchscreen controls, adaptive UI, synthesized local UI sound, no remote calls.
- Core simulation unit tests and GitHub Actions CI recipe.

### Engine / fidelity direction

The `Unreal/Veilpoint/` directory contains the **UE5.8 source scaffold** with Unreal camera, replicated player state, server-authoritative tagging and pickup interaction, shrinking zone and procedural graybox bootstrap. It was prepared without Unreal Engine installed in the development environment. **It has not been compiled, opened in UE Editor, packaged, benchmarked, or visually validated in UE.** It is a starting point for PC photorealism, not a runnable production build.

To make a full fidelity edition:

1. Install UE 5.8 via Epic's official installer and use an appropriately equipped Windows development machine.
2. Open `Unreal/Veilpoint/Veilpoint.uproject`, regenerate C++ project files and fix any version-specific API changes.
3. Replace the initial `Entry` map with a curated production landscape and foliage/architecture assets licensed for distribution, add physically based materials, Nanite meshes and authored world lighting.
4. Set up Lumen, Virtual Shadow Maps and platform-specific scalability, then test performance on target hardware.
5. Add replicated game state, lobbies, server-hosted simulation, match discovery, objective UI, animations and detailed audiovisual effects.
6. Validate networking under latency/packet loss, accessibility, anti-cheat and gameplay balance before any distribution.

## Tests

```bash
node --test tests/*.test.cjs
node --check src/simulation.js
node --check src/renderer.js
node --check src/app.js
```

`npm install` is not required. All tests are offline. Browser GPU rendering must be checked on a WebGL2-capable device. The CI does **not** compile UE C++; Unreal build tests require licensed/installed engine runners.

## Version and scope

`v1.0` here names a **self-contained technical prototype milestone**, not a polished commercial v1.0 game. It is intended as the seed for a longer development effort. No copyrighted Bodycam files/assets/code have been copied.

## License

Copyright 2026 project owner. All rights reserved unless the owner chooses and publishes a license. The prototype uses only original code and procedural placeholder assets.

## v1.1 timing update

`src/clock.js` decouples gameplay updates from render frame rate at 60 Hz, with bounded stall catch-up. Run `npm run verify` to execute simulation and timing regression tests. An identical deterministic state is asserted under 30/60/144 FPS. The WebGL2 presentation and Unreal Engine components remain unverified on shipping GPU / engine hardware.

## v1.2 — 165 Hz display support and render pacing

- Browser: choose render caps 30 / 60 / 90 / 120 / 144 / **165 FPS** via the in-game settings dropdown. The setting is persisted locally when storage is available. Render callbacks follow `requestAnimationFrame` so the browser and operating system still determine the actual display refresh rate. **An FPS cap is not a monitor refresh-rate setting.**
- To use a **165 Hz monitor**, set the desktop display to 165 Hz in operating system and graphics driver settings. A browser cannot force a monitor to 165 Hz; the refresh rate, CPU/GPU workload, compositor, V-Sync and power settings determine actual delivered frames.
- Render pacing is independent from the **60 Hz fixed gameplay simulation**: increasing visual frame rate must not speed up game logic. The FPS meter shows measured *rendered* FPS versus the cap, not detected physical Hz.
- Unreal configuration supplies a default 165 FPS frame limit for a 165 Hz target display. In the future, provide real engine video settings for enumerating supported display modes (Windows fullscreen), V-Sync and FPS limits. The current Unreal source has not been compiled or benchmarked.
- Quality gate: no claim of stable 165 FPS on real hardware until frame times and stutter are measured with a representative 165 Hz device.
