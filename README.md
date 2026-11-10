# VEILPOINT — Story-first PC development · CH01 preview and future Battle Royale

> **Status (2026-11-10): Windows PC story-first development; playable browser CH01 preview + uncompiled/untested native UE5.8 scaffold.**
> No claim of Bodycam-equivalent photorealism, shipping readiness, authoritative networking, anti-cheat, or production QA.

**Active 2026-11-10 production rule:** allocate rolling development effort 35% map / 35% story / 20% future BR / 10% stability. Story ships first; November 27 is a **demo candidate target**, not a 12-hour or UE5-native release promise. Details: [story-first plan](docs/STORY_FIRST_RELEASE_PLAN.md).

**World reference decision (2026-11-07):** VEILPOINT uses **Aden, southern Yemen (approximately 2015)** as its researched real-world geographic, coastal and architecture reference. **Nahrin / Sahir Coast** remains the original fictional story setting and named cast. Historical terrain and neighborhood/building character are requirements **not yet realized** in the procedural browser and uncompiled UE5 graybox. See [source-backed Aden reference and acceptance gates](docs/WORLD_REFERENCE_ADEN.md).

VEILPOINT is a **Windows PC-only** game in development. The **single-player story campaign releases first**, with Battle Royale later reusing validated story environments and shared systems. Its final vision includes story (~12h authored target), later online team multiplayer and Battle Royale. Currently the browser includes an **offline** survival battle-royale prototype and a **short, playable CH01 story preview**. The BR browser combat uses fictional firearm-class abstractions with finite carried ammunition; these are not verified real-world ballistics or production weapon assets. The project has no account system, telemetry, external assets, analytics or dependency downloads.


## Windows offline demo EXE track (2026-11-27 delivery target)

The Windows demo has **two distinct release paths**:

- The existing verified offline **browser ZIP** remains the primary P0 regression and fallback launch path.
- A **Windows x64 `.exe` browser-host candidate** is built from `windows/VEILPOINT.DemoHost/` using .NET 10 WinForms and Microsoft Edge WebView2. It now **opens story CH01 first**, with separate BR and original terrain preview buttons for development. Launch `VEILPOINT.Demo.exe --story-only` to hide BR/terrain buttons and reject navigation to those pages; this mode still uses the same mixed offline asset package and is **not** a separately packaged 12-hour story game. WebView2 Evergreen runtime is required; this is **not** native UE5.
- A separate **BR-free Story CH01 Windows EXE candidate** reuses the verified WebView2 host binary but bundles only the story-only source ZIP and its dependencies. The archive `dist/windows-story-exe/veilpoint-story-windows-exe.zip` automatically launches CH01 with BR/terrain navigation disabled, and independently verifies every included asset. This is **not** a native UE5 game, full 12-hour campaign or final signed release.

For a Windows machine with Node 22 and the .NET 10 SDK, run `./scripts/package-windows-demo.ps1` followed by `./scripts/package-windows-story-demo.ps1` in PowerShell to build both candidates. The script verifies the browser ZIP, actually compiles the Win64 EXE, bundles `game/` files, checks PE executable headers and the WebView2 native loader, re-extracts the release ZIP, and produces `dist/windows-exe/veilpoint-windows-demo-exe.zip` with its `.sha256` sidecar. The dedicated Windows GitHub Actions workflow uploads separate `veilpoint-windows-demo-exe-candidate` (combined) and `veilpoint-story-windows-exe-candidate` (BR-free CH01) artifacts only when their build/package gates pass. Extract **all** files from the release ZIP before running `VEILPOINT.Demo.exe`.

This host uses a stable local virtual origin, so EXE checkpoints persist in a per-user local WebView2 profile and are separate from saves created in `file://` browser pages. Remote network resources/navigation are blocked by the host. Package creation is not a real Windows gameplay smoke test, a Microsoft code signature, or proof of 165 FPS. A native standalone UE5 `.exe` remains the separate 2027-04-27 goal. See [Windows EXE validation](docs/WINDOWS_EXE_DEMO.md).

## Separate 16×6 local squad browser field test

Use `npm run br96:server` and open **http://127.0.0.1:8130/** for the new
96-seat, server-owned squad **2D movement** test interface. This is not the
offline BR game or a public multiplayer release. It has real join/ready,
finite sprint, private local squad signals and server-filtered visible actors,
but **no 96-player combat, Internet hosting or live-load performance proof**.
The match starts only when all 96 distinct local sessions have joined and
are ready. See [BR96 local browser field test](docs/BR96_BROWSER_PLAYTEST.md).

The browser story CH01 now also recognizes a genuinely traversed exit with
the same existing cargo, companion and clearance constraints; the default
physical interaction key is **F** (the player's remap is authoritative). Both native UE5 world bootstraps include the same shared original
seafront market geometry as the browser game, but C++ compilation and UE5
playtesting are still outstanding.

## Quick start

For the current **story-first** Windows PC browser preview, open `story.html`. The optional combined development EXE opens CH01 first; `index.html` is the separate offline BR prototype. Alternatively, run from the project root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/story.html` for CH01 or `http://localhost:8080/index.html` for the separate offline BR prototype. The renderer uses WebGL2 with a Canvas2D fallback. **Windows PC keyboard/mouse is the supported target**: WASD move, mouse look, Shift sprint, C crouch and **F physical interaction** (or the player's remapped key). Middle mouse click places a local position quickmark where supported; Escape pauses/unlocks the pointer. Legacy touch handlers are not a release acceptance target. Losing focus clears held movement.


### Playable CH01 story preview (new 2026-10-27)

Open `story.html` directly, or use the **스토리 CH01 프리뷰** button on the `index.html` landing menu. This is a short, original **first-person 3D browser mission** in the fictional Nahrin / Sahir Coast setting, *not* the finished 12-hour campaign.

- **Playable path:** move to the relay terminal → press **F** (or the remapped interaction key) → optionally examine local harbor/shelter records → approach the choice area → choose evacuation or on-site verification when locally available → physically reach the permitted exit. The main ending must not require optional evidence; completion is driven by the validated mission state, not menu text alone.
- **Story identity:** Signal Echo records show inconsistent times (04:12 vs 04:07); collecting both opens an alternative route. All writing and scene elements are fictional and original.
- **Controls:** Windows PC keyboard and mouse: WASD / arrow keys move, mouse to look, Shift sprint, C crouch, **F interact**, Escape pause. Remapped keys use the saved PC profile. Route choices use visible buttons or number keys 1/2. No mobile/touch release is planned.
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
- PC mouse/keyboard controls, adaptive no-scroll UI, synthesized local UI sound, no remote calls.
- Core simulation unit tests and GitHub Actions CI recipe.

### Native UE5 CH01 map authoring — Windows development gate (2026-11-10)

For the installed Unreal Engine **5.8** plus Windows C++ build tools,
`scripts/prepare-native-ch01-win64.ps1` checks the engine version, compiles
`VeilpointEditor`, executes the actual editor map-generation script and
verifies a SHA-256 receipt for `CH01_Coast.umap` before setting it as the
startup map. A small original civilian public courtyard adds **11 actual
authored editor meshes**, with open pedestrian access and physical collision.
The original 2015 Aden geography and fully built city are **not verified**.

```powershell
.\scripts\prepare-native-ch01-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8' -PreflightOnly
.\scripts\prepare-native-ch01-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8'
```

This code has **not been executed in Unreal on the owner's PC**. It is not
a prebuilt native game or a certification of the C++ compile, playable map
or RTX3070 performance. The standalone story-only WebView2 EXE is a
separate verified distribution **candidate**. See
[UE5 Windows CH01 authoring/build gate](docs/UE5_WIN64_BUILD_GATE.md).

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
