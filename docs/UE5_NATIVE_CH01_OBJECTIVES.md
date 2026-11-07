# VEILPOINT UE5 — native CH01 objective prototype (2026-11-07)

This is actual Unreal Engine C++ source, **not a built or playtested UE5 executable**.

## Native UE5 integration

- UE project: `Unreal/Veilpoint/Veilpoint.uproject` (EngineAssociation 5.8).
- Default `VPGameMode` stays BR-only. The source has an **opt-in** `VPStoryGameMode`.
- Select `VPStoryGameMode` in the Unreal Editor's **World Settings → GameMode Override** for an authorized non-release test map. For the stock Engine Entry map, the existing fallback PlayerStart provides an initial pawn.
- `VPStoryGameState` replicates the objective phase and which two records have been physically inspected. `VPStoryMarker` is a replicated, server-validated physical interaction, reachable with the existing PC E input.
- First native story path: local relay → two distinct on-site records → choose south/east route → reach matching local exit. This is a **minimal objective state machine**; it is not the existing rich browser CH01 mission or a 12-hour authored campaign.
- Story markers are visible native placeholder geometry within a **separate class-identified coastal blockout** (`AVPStoryWorldBootstrap`), rather than relying on the client receiving `GameState` before world `BeginPlay`. The same static instance layout is built on server and clients from the replicated actor class. Its fourteen measured relay / archive / courtyard structures and eighteen noncolliding edge props avoid the seven physical mission stations. It excludes random BR loot and does not change the BR default world.
- The story uses a CH01 HUD and excludes BR-zone/supply UI. This is still a prototype built from built-in cubes; it does **not** ship an authored harbor `.umap`, believable finished art, traffic, civilian performances or production assets.

## Release gates and known limitations

- `tests/unreal-native-ch01-mode.test.cjs` checks source-level separation, replicated state, authority, reach, occlusion, and default BR isolation. Passing Node tests **does not prove** UBT compilation, editor PIE, Windows packaging, or gameplay completeness.
- Compile with an actual UE 5.8 installation via `scripts/build-native-win64.ps1` and the documented gate at `docs/UE5_WIN64_BUILD_GATE.md`. The opt-in Entry-map flag is a **smoke test only**.
- In native PIE, validate each physical marker in order, both routes separately, server/client replication, UI readability at 1024×600 through 2560×1440, and return to existing BR mode. Check overlapping markers, obstructed interactions, disconnect/rejoin and Unreal C++ build output.
- A new versioned `UVPStoryCheckpoint : USaveGame` stores **objective phase and the two reviewed record flags only** in the local `veilpoint.ch01.native.v1` slot. `AVPStoryGameState::RestoreProgress` refuses impossible combinations before updating replicated state. The authority-owned story mode saves after a successful physical interaction and attempts restoration in **NM_Standalone only**. It never writes an active BR save or a multiplayer seat. If an engine save fails, live progress continues in memory and a warning is logged, not a fabricated success.
- Native CH01 now keeps the newest verified objective save in `veilpoint.ch01.native.v1` and copies a coherent prior primary to `.backup` **before** overwriting the primary. An invalid primary triggers a backup read and an authority-validated restore. The writer checks the exact stage and reviewed-record flags after reloading the new save. This is **best-effort backup recovery, not atomic crash consistency or cloud sync**. Saves can still fail, and recovery may resume from an older valid objective.
- To intentionally begin CH01 from its initial relay objective rather than auto-resuming a completed chapter, launch the native standalone preview with `-VeilpointCH01Fresh`. Only this explicit flag attempts to delete the primary and backup; failure is logged and the current session still begins fresh in memory. It is not yet a finished in-game New Chapter menu.
- The native checkpoint currently does **not** restore player position, equipment or full narrative events; the character starts at the map's ordinary spawn. Confirm native Windows filesystem behavior in Unreal Editor/standalone on a real UE 5.8 installation.
- Next: authored coastal level, character dialogue/voice/event sequencing, robust save failure UX, AI scenario events, proper scene dressing and measured QHD RTX 3070 runtime.
