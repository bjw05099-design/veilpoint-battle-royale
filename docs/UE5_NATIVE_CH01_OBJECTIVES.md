# VEILPOINT UE5 — native CH01 objective prototype (2026-11-07)

This is actual Unreal Engine C++ source, **not a built or playtested UE5 executable**.

## Native UE5 integration

- UE project: `Unreal/Veilpoint/Veilpoint.uproject` (EngineAssociation 5.8).
- Default `VPGameMode` stays BR-only. The source has an **opt-in** `VPStoryGameMode`.
- Select `VPStoryGameMode` in the Unreal Editor's **World Settings → GameMode Override** for an authorized non-release test map. For the stock Engine Entry map, the existing fallback PlayerStart provides an initial pawn.
- `VPStoryGameState` replicates the objective phase and which two records have been physically inspected. `VPStoryMarker` is a replicated, server-validated physical interaction, reachable with the existing PC E input.
- First native story path: local relay → two distinct on-site records → choose south/east route → reach matching local exit. This is a **minimal objective state machine**; it is not the existing rich browser CH01 mission or a 12-hour authored campaign.
- Story markers are visible native placeholder geometry at measured coordinates within the existing bootstrap preview environment. The story uses a CH01 HUD and excludes BR-zone/supply UI. It does not ship an authored harbor `.umap` or production assets.

## Release gates and known limitations

- `tests/unreal-native-ch01-mode.test.cjs` checks source-level separation, replicated state, authority, reach, occlusion, and default BR isolation. Passing Node tests **does not prove** UBT compilation, editor PIE, Windows packaging, or gameplay completeness.
- Compile with an actual UE 5.8 installation via `scripts/build-native-win64.ps1` and the documented gate at `docs/UE5_WIN64_BUILD_GATE.md`. The opt-in Entry-map flag is a **smoke test only**.
- In native PIE, validate each physical marker in order, both routes separately, server/client replication, UI readability at 1024×600 through 2560×1440, and return to existing BR mode. Check overlapping markers, obstructed interactions, disconnect/rejoin and Unreal C++ build output.
- Next: authored coastal level, character dialogue/voice/event sequencing, story checkpoint durability, AI scenario events, proper scene dressing and measured QHD RTX 3070 runtime.
