# VEILPOINT — native Unreal graphics presets (v1.5 scaffold)

## What is implemented

`UVPGameUserSettings` subclasses Unreal's `UGameUserSettings` and is registered with
`GameUserSettingsClassName=/Script/Veilpoint.VPGameUserSettings` in `DefaultEngine.ini`.
A Blueprint-accessible `ApplyVeilpointPreset` maps the six product profiles to Unreal
scalability quality, screen percentage and frame cap. Selections are local and optionally
saved to the user's GameUserSettings config. `Custom` controls expose FPS (30–165),
internal resolution percentage (50–100) and V-Sync without changing server simulation.

The class is **source code only** until compiled with UE 5.8. No UE editor or actual GPU
was available in this run. A menu Widget Blueprint must call these functions to expose
the native controls to players; the browser settings panel is a separate implementation.

| Profile | UE overall scalability target | Screen percentage | FPS cap |
| --- | ---: | ---: | ---: |
| HyperReal 165Hz | 4 (Cinematic) | 100 | 165 |
| Cinematic Maximum | 4 (Cinematic) | 100 | 60 |
| Ultra Photoreal | 3 (Epic) | 100 | 144 |
| Balanced Quality | 2 (High) | 90 | 120 |
| Smooth Performance | 2 (High) | 80 | 165 |
| Power Saver | 1 (Medium) | 70 | 60 |
| Custom | User-controlled | 50–100 | 30–165 |

**Quality 4** is the engine's Cinematic scalability tier when available; it is not
a measured promise of image fidelity. `SetOverallScalabilityLevel` uses the engine's
platform-specific scalability settings. Hardware limitations can prevent the target FPS.

### Blueprint integration (after compiling)

1. Confirm `Project Settings > Engine > General Settings` uses `VPGameUserSettings`.
2. In a settings Widget Blueprint, call `Get Veilpoint Settings` and check for a valid result.
3. Bind each preset button to `Apply Veilpoint Preset` and pass its enum value.
4. Bind FPS, resolution and V-Sync controls to `Set Custom Frame Cap`,
   `Set Custom Resolution Percent` and `Set Custom VSync`.
5. Display `Get Preset Frame Budget Ms` as a **target budget**, never as measured latency.
6. Add a separate display-mode/monitor-refresh selector and a real performance overlay
   after checking UE platform API and target hardware.

### Hardware validation checklist (not yet performed)

- Build UE 5.8 project on Windows; fix any API changes and capture compiler output.
- Use a verified 165Hz monitor and set Windows/driver to 165Hz.
- Test at native 1080p and 1440p on identified CPU/GPU; record game and render threads,
  GPU P50/P95/P99 frame times, 1% lows and motion artifacts.
- Run `stat unit`, `stat gpu`, `profilegpu` / Unreal Insights as supported.
- Compare HyperReal 165Hz vs Cinematic Maximum for shadow noise, foliage aliasing,
  Lumen reflections, TSR ghosting and temporal instability in motion.
- Only after measuring GPU headroom, add selective Lumen/Nanite/TSR tuning,
  platform-validated dynamic resolution, and quality-preserving adaptation.

**Important:** 165Hz display frequency is not the same as 165 rendered FPS.
The 165FPS frame budget is `1000/165 = 6.0606ms`. A frame cap is not a performance
guarantee, and V-Sync may change latency or effective output cadence.

### Automated checks

`node --test tests/unreal-graphics.test.cjs` validates the profile/config mapping
without claiming to compile C++. `npm run verify` includes these checks and the
existing browser regression suite. CI on Linux does **not** build the UE project.
