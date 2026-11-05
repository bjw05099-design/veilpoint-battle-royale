# VEILPOINT · native Windows 64-bit build gate (UE 5.8)

This is an **executable PowerShell build/preflight workflow**, not a supplied Windows binary. The repository's default GitHub Actions runner is Linux/Node and **cannot** prove that C++ compiles in Unreal, that a Win64 package launches, or that RTX 3070/QHD 165Hz performance targets are met.

## Current project state

- Project descriptor: `Unreal/Veilpoint/Veilpoint.uproject`, `EngineAssociation = 5.8`.
- Current configured startup level: `/Engine/Maps/Entry` (Epic's stock entry map). The project does **not** yet contain an authored `/Game/...` level and must not be reported as a shipped playable UE5 game.
- Browser BR/CH01 demo remains the primary Nov 27 delivery track. This script neither modifies nor replaces its ZIP.
- Only inspect, compile and package sources you are authorized to build. No downloaded binaries or external executable dependencies are fetched by this script.

## Local Windows checks

On a Windows PC with a compatible Unreal Engine **5.8** installation and supported Visual Studio C++ build tools, open PowerShell at the checked-out repository root:

```powershell
.\scripts\build-native-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8' -PreflightOnly -AllowEngineEntrySmokeTest
```

The opt-in `-AllowEngineEntrySmokeTest` permits preflight with the stock Engine Entry map. It does **not** certify a playable scene. Omitting the switch intentionally fails until a genuinely authored `/Game/...` map is installed and configured in `DefaultEngine.ini`.

Once the user has explicitly opted into a **non-release, stock Entry-map test**, native build/cook/package can be attempted:

```powershell
.\scripts\build-native-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8' -AllowEngineEntrySmokeTest -Configuration Development
```

For an authored map, configure `GameDefaultMap=/Game/Maps/<YourMap>` and ensure `Unreal/Veilpoint/Content/Maps/<YourMap>.umap` is present; then use the script **without** `-AllowEngineEntrySmokeTest`.

## What the gate does and does not do

1. Rejects non-Windows hosts, missing engine installations, mismatched UE versions, missing project/maps and output paths inside native project sources.
2. With `-PreflightOnly`, checks the environment **without invoking UAT** or manufacturing success.
3. Runs Epic's `RunUAT.bat BuildCookRun` to compile, cook, stage, pack and archive a Win64 Development or Shipping build; preserves UAT logs under `dist/native-build-logs`.
4. Requires a successful native exit code **and** a real `Veilpoint.exe` under `dist/native-win64`.
5. Creates `veilpoint-win64-manifest.json` with SHA256 hashes of packaged executable/container files and explicit status `PACKAGED_NOT_RUNTIME_TESTED`.
6. Does not self-certify execution, GPU performance, level design, multiplayer behavior, or full demo acceptance.

**Windows follow-up after any packaged build**: record the UAT log and manifest, manually launch the packaged program, verify that the intended level is visible and playable, and record actual hardware/graphics settings and real runtime behavior. Never mark the 11/27 release checklist complete from a script's exit code alone.

Epic's official packaging references:
- https://dev.epicgames.com/documentation/unreal-engine/packaging-your-project
- https://dev.epicgames.com/documentation/unreal-engine/build-operations-cooking-packaging-deploying-and-running-projects-in-unreal-engine

## CI boundary

`tests/unreal-win64-build-gate.test.cjs` validates source-level build expectations only. To truly verify the native target, a **separately authorized Windows machine** must have UE 5.8, Visual Studio prerequisites and a reproducible build log. Avoid installing or executing third-party launchers merely because a CI log claimed the Windows package existed.
