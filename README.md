# VEILPOINT — Battle Royale + Story CH01 browser prototypes

> **Status (2026-10-27): playable browser prototype + uncompiled UE5.8 source scaffold.**
> No claim of Bodycam-equivalent photorealism, shipping readiness, authoritative networking, anti-cheat, or production QA.

VEILPOINT is a developing original first-person game with **three required final modes**: story campaign (~12h authored target), online team multiplayer, and battle royale. Currently the browser includes an **offline** survival battle-royale prototype and a **short, playable CH01 story preview**. The BR browser combat uses fictional firearm-class abstractions with finite carried ammunition; these are not verified real-world ballistics or production weapon assets. The project has no account system, telemetry, external assets, analytics or dependency downloads.

## Quick start

Double-click `index.html` in a modern browser that allows local scripts, or run from the project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser. The 3D WebGL2 renderer has a Canvas2D software fallback for browsers or environments without WebGL2. Desktop: WASD movement, mouse look, left click to tag, SHIFT sprint, C crouch, E collect resources. iPad/touch devices: thumbstick, drag-to-look and on-screen action buttons. ESC unlocks pointer. If focus is lost, keyboard movement resets.


### Playable CH01 story preview (new 2026-10-27)

Open `story.html` directly, or use the **스토리 CH01 프리뷰** button on the `index.html` landing menu. This is a short, original **first-person 3D browser mission** in the fictional Nahrin / Sahir Coast setting, *not* the finished 12-hour campaign.

- **Playable path:** move to the relay terminal (gold marker) → press **E** → optionally investigate harbor/shelter records → approach the central decision console → choose immediate evacuation or (after both records) an alternative verification route → follow the color-coded destination → press **E** to finish. The main exit remains available even if clues are skipped.
- **Story identity:** Signal Echo records show inconsistent times (04:12 vs 04:07); collecting both opens an alternative route. All writing and scene elements are fictional and original.
- **Controls:** WASD / arrow keys move, mouse to look, SHIFT sprint, C crouch, E interact, ESC pause. Touch screens: drag the 3D view, directional pad, investigate and sprint buttons. Route choice can use on-screen buttons or number keys 1/2.
- **Accessibility:** readable Korean captions, non-audio-dependent objectives, reduced-motion setting, visible objective markers and optional evidence. Story progress auto-saves to **localStorage** after interactions and can resume from the last saved interaction. BR and campaign progress are isolated; campaign choices do not change online competitiveness.
- **Graphics:** uses the same renderer and persisted graphics presets as the BR prototype, with independent fixed **60 Hz** gameplay simulation and a selectable render cap. Browser 165 FPS/monitor performance is **not** validated.
- **Tests:** `npm run verify` now checks both story source files and runs `tests/story-slice.test.cjs` with the existing deterministic test suite. GitHub Actions artifact includes `story.html`.
- **Limitations:** no voice acting, native Unreal compilation, production photoreal assets, full CH01 cinematic scope, online multiplayer, actual 12h playtime or real browser hardware QA evidence yet. Browser launch and WebGL/Canvas2D rendering still require hands-on smoke testing.

### Current gameplay features

- Full offline match loop and replay/restart, 18 seeded bot opponents, final-survivor result screen.
- Large procedural environment with terrain, buildings, vegetation, collision, and supply pickups.
- Six-stage shrinking safe-zone logic, survival outside-zone damage, match timer and minimap.
- Health without automatic recovery or shields, stamina and sprint, finite firearm ammunition, pickup inventory.
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
npm run verify
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


## v1.4 browser performance integrity

The browser prototype adds **opt-in GPU-timer-driven adaptive resolution** (when `EXT_disjoint_timer_query_webgl2` is supported), measured CPU/GPU P95 diagnostics and a reused dynamic WebGL buffer to prevent per-frame GPU buffer allocation. It preserves the six graphics profiles and independent 60 Hz simulation. GPU timer measurements are not end-to-end input latency, and **neither real 165 Hz output nor sustained 165 FPS is verified**. Run `npm run verify` for the offline test suite. See `docs/GRAPHICS_PROFILES.md` for limitations.


## v1.5 graphics development status

- **Browser:** adaptive resolution now preserves selected quality during CPU-bound stalls (see `tests/performance-cpubound.test.cjs`).
- **Unreal source scaffold:** `UVPGameUserSettings` exposes six Blueprint-callable native graphics presets, including HyperReal 165Hz (Cinematic scalability + 165FPS cap), and Custom FPS/resolution/V-Sync. Configuration and source-only tests are in `docs/UNREAL_GRAPHICS_SETTINGS.md`.
- **Not yet available:** a native settings menu, a compiled UE build, and hardware-verified photorealism or sustained 165FPS.

## v1.6 dynamic visibility/LOD (2026-10-27)

The browser renderer now conservatively skips off-camera dynamic geometry and reduces distant bot/loot mesh detail. This is **render-only**: the 60Hz simulation, AI, zone and collision are unchanged. The graphics panel shows visible bots and planned dynamic vertex counts. Run `npm run verify` and `npm run bench:visibility` for deterministic tests and a CPU-only microbenchmark. See [render culling design and limitations](docs/RENDER_CULLING.md). No GPU/165Hz benchmark or native UE compile is claimed.

## Local two-client team-objective prototype (development-only)

Run `npm run team:server` from the repository root using Node.js 18+. Open **http://127.0.0.1:8765/** in two browser tabs, enter different names, press **Join**, then **Ready** in both tabs. Move with WASD/arrows or touch buttons; hold E/the capture button while inside the center objective. The 2D test client also supports **F/SPACE** to fire, **R** to reload, and touch buttons. The server determines sight/cover, shot cadence, finite ammunition (12 loaded + 24 carried), 90-tick reload and health; incapacitating the other player ends that round. No automatic healing, infinite ammo or client-authored hit/damage is permitted. The local server alone advances movement and scores; the first team to 3 uncontested captures wins. Both players can press Ready to replay. Run `npm run verify` for syntax, deterministic 60Hz rules, and two-client HTTP regression tests.

This is a **separate 2D networking foundation**, not a completed online FPS, campaign or battle royale service. It binds to loopback only and must **not** be forwarded onto the public internet. Session reconnect, real-world browser/touch tests, packet-loss testing, latency/anti-cheat hardening, accessibility audit and native Unreal integration remain open. Do not confuse the server's 60Hz simulation with a measured 165FPS renderer or a real 165Hz display test.

## Reproducible offline demo ZIP (candidate)

Run `npm run package:demo` from the project root. The script creates `dist/veilpoint-offline-demo.zip` and `dist/veilpoint-offline-demo.zip.sha256` without network access or runtime dependencies. The ZIP includes only the two browser entry pages, their local scripts, a small documentation set, a per-file SHA256 manifest and a release-limitation notice. The package command independently checks archive CRC32, the per-file SHA256 manifest and sidecar; CI verifies the ZIP structure and uploads a candidate artifact. Direct HTML asset references must be bundled locally; unsupported external/CSS URL dependencies fail packaging. It is **not** a validated commercial/UE release; actual desktop-browser end-to-end testing, asset rights and performance benchmarking remain required.

## Local team-prototype fairness and tab refresh candidate (2026-10-27)

The **local 2D rules prototype** now has server-owned low cover collision and cover-aware opponent visibility, with the same obstacle positions drawn on both clients. Contested, abandoned or released captures lose partial progress. Read-only state polling cannot indefinitely keep an absent player active: sequenced heartbeat messages maintain a live 30-second session lease. A tab refresh can restore its guest token from **tab-scoped sessionStorage**, resume the server's sequence and neutralize previously held movement/capture inputs. Tokens are not sent to external services. Run `npm run verify` for deterministic rules and HTTP regressions. Browser refresh, multiple real tabs, intermittent connections and security review still need hands-on testing; this is **not** persistent public-account reconnect or a production team FPS.

### Offline battle-royale checkpoint (browser candidate)

During an active BR match, progress is saved locally after important actions, on pause/tab exit and periodically in simulated time. Reopening `index.html` offers **저장 경기 이어하기**; **새 경기 시작** discards the old match and starts a new one. Win/loss clears the old checkpoint. This uses browser localStorage (separate from CH01), not a cloud save; blocked or cleared storage prevents resume. An on-screen warning indicates save failure. Resume/replay is regression-tested in Node DOM mocks; real browser/device QA remains outstanding.


## Windows PC browser benchmark (opt-in development candidate)

In the offline battle-royale page, open **그래픽 설정 → PC 자동 벤치마크 → 측정 준비**. Start/resume a match, play continuously for a 5-second warmup plus 120 seconds, then reopen settings and click **JSON 결과 저장**. The measurement is recorded only during an active, focused match; pausing, switching tabs, a large timing gap or changing graphics settings ends the run as incomplete. The browser does not upload any diagnostics. Save the JSON locally and share it voluntarily for analysis.

The report distinguishes rendered callback interval statistics, **CPU renderer-draw time only**, and optional WebGL2 GPU timer data. An estimated 1% low and stutter counts are labelled with their calculation methods. It also records the chosen FPS cap, rendering scale and browser viewport, **not** verified physical display Hz or exact GPU/CPU identity. Even a successful run is *not* proof of sustained native QHD 165 FPS, Unreal Engine performance or end-to-end input latency. Use the actual RTX 3070 / **16 GB system RAM** Windows PC for the final benchmarks. The user must run the candidate locally; CI and remote development cannot measure that machine.
