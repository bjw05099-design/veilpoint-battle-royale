# VEILPOINT — Native UE5 civil-terrain streaming lab

**Scope:** optional Unreal Engine 5.8 C++ **civilian terrain inspection level**, not the production BR/CH01 map, not the promised full city, and not an imported World Partition/Landscape world. The user target remains **the entire civilian city of Aden at 1:1 real-world metre scale**. This proof-of-integration uses ORIGINAL synthetic elevations only; no genuinely authenticated Aden terrain/architecture is embedded.

## What is now implemented in native game source

- `AVPCityTerrainStreamActor` reads a previously exported `IMPORT_MANIFEST.json` and 505×505 little-endian `.r16` files exclusively from `<Project>/Saved/CityTiles`, *never over the network*.
- The actor verifies manifest format, each tile's canonical 512m local-metre index/origin, fixed file size (510,050 bytes), allowed height scales, SHA-256 **contents** and validates filenames. Invalid or absent files leave a gap, rather than auto-filling an alleged real mapped region.
- With one local player, an opt-in Actor generates real UE5 `UProceduralMeshComponent` terrain sections. Per-tile default sampling is every eighth 505-grid vertex: **64×64 vertices, 7,938 triangles per tile**; maximum **9 active tiles**, approximately **71,442 triangles**. Terrain collision is enabled with async mesh cooking; it is not proof of measured FPS or collision availability at spawn time.
- Movement across tile bounds (512m × 512m) triggers loading/unloading surrounding valid R16 tiles, and leaves all missing cells absent. A runtime SHA-256 mismatch rejects that tile.
- Native vertex-height/slope colors are connected to a new **original vertex-color terrain material**; the level-authoring Python script creates it without overwriting existing material files.
- The separate `/Game/Maps/Aden_TerrainLab` level is created by an Editor Python script without changing the default BR/CH01 levels. A flying inspection pawn, light and skylight allow reviewing generated geometry. This script does not enable or claim finished World Partition/Landscape integration.

## Repeatable offline PC preparation

On the developer machine (Node 22+):

```bash
# Prepare nine entirely synthetic, seamless example tiles, with SHA-256 manifest
node scripts/prepare-ue5-terrain-lab.cjs

# Verify all nine raw files, SHA-256 hashes and 12 shared tile edges
node scripts/verify-ue5-tile-pack.cjs Unreal/Veilpoint/Saved/CityTiles
```

The prepare script refuses to overwrite a previously created `Saved/CityTiles` directory. Move it to an archival location or deliberately choose a new output path before generating another example; do not silently replace someone else's art.

Inside the UE5 Editor, after enabling the project's ProceduralMeshComponent and PythonScriptPlugin plugins and compiling the Veilpoint C++ project, run **Tools → Execute Python Script** with `scripts/ue5-author-aden-terrain-lab.py`. It authors a *new*, separate `Aden_TerrainLab.umap` and `M_CityTerrainPreview` material in project content. Open the new level and run PIE to inspect the 3×3 terrain, moving between cells. If map creation or native compile fails, do not describe the map as runnable.

For approved non-sensitive public elevation input, the existing converter can instead generate a clean directory:

```bash
node scripts/export-ue5-heightmaps.cjs imported-local-tiles.json New_CityTiles
node scripts/verify-ue5-tile-pack.cjs New_CityTiles
```

Only after rights, acquisition date, vertical datum, public-civilian coverage and transforms are independently reviewed should such source data be imported into an actual UE level. The manifest format is `veilpoint-ue5-landscape-r16-candidate-v1`; the source conversion only supports **local-metre unreferenced** coordinates and intentionally does NOT produce exact GPS-facility locations.

## Implementation constraints

- `ProceduralMeshComponent` is an **experimental** runtime tool in Epic documentation. It is useful for a reproducible first native mesh but is *not* a substitute for production UE5 Landscape, World Partition/HLOD and physical material streaming.
- Source-level C++ tests and runnable Node binary-package tests are not equivalent to UnrealBuildTool compiling the added Actor or to a successful UE5 PIE run.
- GPU target remains Windows RTX 3070, 16GB RAM, QHD 2560×1440 display at 165Hz refresh. There is **no verified native UE5 FPS, VRAM or frame-time measurement** in this PR.
- Existing 350m offline demo, BR96 server, CH01 story, F interaction, middle-button positional mark and legacy saves have not been changed. There are no exact active-conflict restricted sites or operational facility maps.
- The nine provided sample tiles are ORIGINAL ART and geometrically seamless, **not real Aden DEM tiles**, and do not substantiate whole-city completion or historic accuracy.

## Next map deliverables

Production-ready dataset provenance and conversion; a genuine UE5 Landscape/World Partition authoring workflow with collision, normals and seamless borders verified in the engine; district-specific original civilian architecture and public building interiors; native PC packaging with measured stable QHD frame times. The 1:1 whole-city goal remains an objective, **not a claim that all geography is already represented**.

Epic reference: [UE5.8 UProceduralMeshComponent API](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/ProceduralMeshComponent/UProceduralMeshComponent), [CreateMeshSection_LinearColor](https://dev.epicgames.com/documentation/unreal-engine/API/Plugins/ProceduralMeshComponent/UProceduralMeshComponent/CreateMeshSectio-).
