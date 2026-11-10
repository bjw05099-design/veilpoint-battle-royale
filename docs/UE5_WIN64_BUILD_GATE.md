# VEILPOINT · native Windows 64-bit build gate (UE 5.8)

This is an **executable PowerShell build/preflight workflow**, not a supplied Windows binary. The repository's default GitHub Actions runner is Linux/Node and **cannot** prove that C++ compiles in Unreal, that a Win64 package launches, or that RTX 3070/QHD 165Hz performance targets are met.

## Current project state

- Project descriptor: `Unreal/Veilpoint/Veilpoint.uproject`, `EngineAssociation = 5.8`.
- Current configured startup level: `/Engine/Maps/Entry` (Epic's stock entry map). The project does **not** yet contain an authored `/Game/...` level and must not be reported as a shipped playable UE5 game.
- Browser BR/CH01 demo remains the primary Nov 27 delivery track. This script neither modifies nor replaces its ZIP.
- Only inspect, compile and package sources you are authorized to build. No downloaded binaries or external executable dependencies are fetched by this script.

## Author the first native CH01 map in Unreal Editor (not yet executed here)

The repository now includes `scripts/ue5-author-ch01-map.py` and a Windows native Editor execution gate. The Python file remains an **Editor-only asset generator**, not a checked-in `.umap` or a proof of an Unreal 5.8 build. After installing the matching engine and compiling the C++ native module, open the project in the **Unreal Editor** and use **Tools → Execute Python Script** to run the file. The project explicitly enables `PythonScriptPlugin` for Editor only. Epic documents `LevelEditorSubsystem.new_level`, actor spawning and `save_current_level` in its Editor API:
https://dev.epicgames.com/documentation/en-us/unreal-engine/python-api/class/LevelEditorSubsystem
https://dev.epicgames.com/documentation/en-us/unreal-engine/API/Editor/UnrealEd/UEditorActorSubsystem/SpawnActorFromClass

The script refuses to overwrite an existing `Content/Maps/CH01_Coast.umap`, requires the compiled `VPStoryGameMode`, creates a non-partitioned `/Game/Maps/CH01_Coast` map, assigns the CH01 native mode to its world settings, adds one real `PlayerStart` and simple lighting, then checks that the new `.umap` was actually saved. The existing C++ mode spawns the deterministic coastal blockout and seven physical mission markers during native gameplay. **No final textures, civilians, narrative sequences, measured RTX 3070 frame rate or UE5 launch are implied.**

Once `Unreal/Veilpoint/Content/Maps/CH01_Coast.umap` has been created and reviewed in the editor, the new Windows preparation gate can set `GameDefaultMap=/Game/Maps/CH01_Coast` in `Unreal/Veilpoint/Config/DefaultEngine.ini` **only after** verifying the source-bound receipt. Do not change BR's default map in source until both modes have separate launch/menu paths. Check the saved map, physical interactions and CH01 HUD in PIE, and only then run the native Win64 preflight. The script deliberately leaves the current source default map unchanged to prevent a missing asset from breaking the browser demo or native build gate. If an Editor action fails after creating an empty map, examine/delete the incomplete asset manually before rerunning; the script never overwrites it automatically.

## Automated editor compile + genuinely saved CH01 map gate (2026-11-10)

A new Windows-only opt-in preparation path is available. Unlike a README
instruction alone, it **actually invokes UnrealBuildTool for VeilpointEditor**
and then Epic's documented `UnrealEditor-Cmd.exe -ExecutePythonScript` interface.
Only an installed and matching UE5.8 toolchain can execute these operations.

Run from PowerShell at the repository root on your own UE5.8/Visual Studio
equipped Windows development machine:

```powershell
.\scripts\prepare-native-ch01-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8' -PreflightOnly
.\scripts\prepare-native-ch01-win64.ps1 -EngineRoot 'C:\Program Files\Epic Games\UE_5.8'
```

The first command checks prerequisites **without building or altering files**.
The second command runs the native C++ Editor build, then:
1. Checks `scripts/ch01-original-public-court.json`, an original fictional
   and non-georeferenced **11-piece public civic space** with a walkable aisle,
   colliding supports and raised canopy; no real active-conflict facility maps.
2. Calls `scripts/ue5-author-ch01-map.py` inside the installed Unreal Editor
   to create a **real `Content/Maps/CH01_Coast.umap`**, with PlayerStart,
   daylight, skylight, and 11 actual StaticMeshActors. The story GameMode
   continues to spawn its existing nonduplicated mission runtime geometry.
3. Writes `Saved/CH01_MAP_READY.json` only after checking the saved .umap
   bytes and their SHA256. It records source layout hash, game mode, actor
   count, and explicitly `nativePIEVerified: false` and
   `actualAdenCoverageVerified: false`. A failed editor run, missing or
   modified source layout, or mismatched receipt cannot change startup.
4. Saves the old `Config/DefaultEngine.ini` to an ignored backup under
   `Saved/`, then changes **only** the `GameDefaultMap` entry to
   `GameDefaultMap=/Game/Maps/CH01_Coast`. The BR mode code remains in the
   repository; the editor-authored level overrides its own default game mode.
5. A later `scripts/build-native-win64.ps1` independently rechecks both
   SHA256 values **before cook/package**. It refuses an unreceipted or
   altered story map, even when a .umap filename is present.

To attempt the full native Windows Development **package candidate** in the
same operation, use `-PackageNative` instead of assuming Editor authoring
equals a playable EXE. The build script still reports
`PACKAGED_NOT_RUNTIME_TESTED` after UAT returns successfully.

**Fail-closed and non-destructive:** Neither authoring script overwrites an
existing CH01 map or silently deletes saved work. If Editor fails after
creating a partial .umap, inspect it in the real Editor; the script refuses
to overwrite the partial asset. No GUI run, collision/PIE gameplay check,
RTX3070 performance, licensing certification, whole Aden map or finished
12-hour story is asserted by source tests or this receipt. On a successful
authoring machine, record the UBT log, editor log, .umap receipt, Win64 UAT
log and actual playable launch separately.

### Public-court placement and browser collision parity (2026-11-10)

The original 11-piece courtyard has been **relocated to local (110m, -37m)**.
Its earlier centre (68m, -66m) intersected an already-colliding fictional
building at (70m, -78m). This correction is essential for **actual walking**
rather than merely viewing a 3D prop in UE5 or a browser.

- The single approved native source remains `scripts/ch01-original-public-court.json`.
  Browser `src/story-public-court.js` is a checked, metre-converted projection:
  the original player-height **eight columns/benches/shelves** collide in the
  CH01 60Hz world; 3m overhead canopy, paving and painted ground markings
  never become fake 2D walls.
- The original roof remains a **real overhead mesh and true 3D collider** when
  generated by Unreal Editor; the browser draws it overhead without affecting
  standing player movement. WebGL and Canvas fallback both show it.
- Story CH01 includes a local, no-quest HUD note and stone footfall surface
  only while the player's real feet are inside the public court. This does
  **not** imply arriving civilians, a new campaign mission or completed
  evacuations.
- Offline BR and BR96 body coordinates and checkpoint contracts are unchanged:
  future BR reuse must be implemented and independently tested after story
  release. Fictional architecture is not a georeferenced Aden survey.
- A previously generated receipt at the old coordinates, if any, no longer
  matches the revised input SHA-256. The authoring script refuses overwrite;
  review and archive any old `.umap`/receipt before authoring a new map.

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
