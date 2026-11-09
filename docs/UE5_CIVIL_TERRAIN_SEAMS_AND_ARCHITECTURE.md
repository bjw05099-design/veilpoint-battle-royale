# VEILPOINT — Native terrain seam guard + original civilian quarter

**2026-11-10 development slice.** This follows merged PR #759 without re-counting its original 505×505 terrain tile actor, SHA256 exporter, nine-tile fixture or Editor terrain lab. The long-term user target is an entire-city 1:1 impression of Aden; this is **original civilian blockout art in a fictional local coordinate system**, not a surveyed/verified Aden district or any restricted contemporary facility.

## A. Improved native terrain continuity and load budgeting

- The opt-in UE5 `AVPCityTerrainStreamActor` retains only the **nine loaded 505×505 R16 byte arrays** for actual border checking. Before creating an adjacent procedural mesh/collider, compare **all 505 16-bit edge pixels** on all four cardinal directions. A mismatching source is refused: no bridges, false elevations or gap fillers.
- Prior code selected *all* cells within radius 2 and held the first nine. As a result, moving 512m could leave **the new center tile absent** even though its data existed. Selection now retains only the nine closest currently indexed, nonrejected cells **before unloading stale tiles**. A reproducible budget test verifies eviction and prioritization.
- Runtime corrupt/invalid cells are logged and rejected until level reload, preventing repeated expensive disk reads on every tick. They may remain missing until restart; this is deliberate source-integrity behavior, not fully dynamic file hot-reload.
- A moved terrain stream actor no longer shifts tile origin: each component registers then sets **absolute world-centimetre location** based on its local 512m tile identifier.
- Surface normals at north/south/east/west borders now use correctly scaled **one-sided height derivatives**, rather than dividing a single sample difference by an incorrect central double span.
- These are **C++ source improvements** verified with source-level Node contracts and real R16 pack tests. UnrealBuildTool/PIE and actual RTX 3070 native benchmark still remain unperformed; GitHub Windows EXE candidate is a browser host.

## B. Varied walk-in **fictional** civilian architectural samples

- `src/aden-civic-kit.cjs` defines an original salt-plastered public market, weathered-stone workshop and ochre residential arcade: **three visually differentiated public building archetypes**, each with real floor, four surrounding walls divided by a **4.4m–5.2m south-facing doorway**, lintel, flat roof, exterior sunshade, two columns, service counter and street bench.
- Exactly **39 physical/editor mesh pieces** use metre units. Walkable interior center lines, 0.85m-radius entry clearances, roof height and wall geometry are Node-tested before any engine authoring. These are generic civilian environments; no named historic monument plan, restricted facility or current conflict-era access route is modeled.
- `node scripts/prepare-ue5-civilian-quarter.cjs Unreal/Veilpoint/Saved/CityTiles` reads the independently SHA-verified local original terrain's central `.r16`, bilinearly computes each building's base elevation and writes `CIVILIAN_QUARTER.json`. It **refuses to overwrite** a prior layout or to label the original synthetic fixture as surveyed.
- In the UE5 Editor, **open** the existing standalone `Aden_TerrainLab` level, then use **Tools → Execute Python Script** on `scripts/ue5-author-civilian-quarter.py`. It requires the matching central R16 SHA-256, checks every original piece and scene path, generates six original colored plaster/stone/shade preview materials and adds 39 individually scaled cube meshes with collision where applicable, then saves. It **refuses to modify BR/CH01 or duplicate an existing civic quarter**.
- This is low-poly architectural **blockout**, not UE5 Nanite or measured real Aden buildings. More material variation, public facade art, street life and geographically validated civilian city layouts remain separate future work.

## Local test sequence

```bash
# From repository root, only if Saved/CityTiles does not exist yet:
node scripts/prepare-ue5-terrain-lab.cjs

# Prove tile hashes and all 12 seams:
node scripts/verify-ue5-tile-pack.cjs Unreal/Veilpoint/Saved/CityTiles

# Create ORIGINAL three-building civilian geometry, without overwrites:
node scripts/prepare-ue5-civilian-quarter.cjs Unreal/Veilpoint/Saved/CityTiles
```

Then in the Unreal Editor open `Aden_TerrainLab`, run the new Python script, and visually inspect the three building interiors, roofs, the R16 ground beneath them, 512m tile boundaries and runtime collision at the four cardinal joins. Save/cook/PIE **separately**; Node/Chromium/Windows browser-host CI does **not** establish a successful native C++ compile, C++ collision physics, or QHD 165fps performance.

The old 350m BR96/CH01 playable city, **F** nearby civilian interactions, middle-wheel-click positional marking, campaign checkpoints and offline demo are intentionally unchanged in this branch. The new UE5 native lab is not wired to BR96 combat, city-scale civilian navigation or tactical/sensitive real sites.
