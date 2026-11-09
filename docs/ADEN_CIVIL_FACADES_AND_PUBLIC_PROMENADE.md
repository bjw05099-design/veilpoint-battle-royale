# VEILPOINT | Original Crater-inspired civil facades & continuous promenade

**Date:** 2026-11-10. **Scope:** NEW experimental civilian urban appearance art on the **standalone** 1:1 local-metre `Aden_TerrainLab`. It does NOT replace the existing BR96/CH01 map, does NOT reproduce a specific actual building/address and does NOT mean the whole of Aden has been reconstructed. There are still **zero authenticated real-Aden DEM tiles** in this experiment.

## Authenticity criteria versus original creative design

Published general historical references, not exact surveyed building schematics:

- [UN-Habitat Aden City Profile (2020)](https://unhabitat.org/sites/default/files/2020/11/01_aden_city_profile.pdf): civil market/residential fabric and varied architectural influence in Crater/Al-Tawahi; requires confirmation for any particular building and reference year.
- [Colonial Architectural Style’s Influence On Buildings Façade Design In Aden City, Yemen (2019)](https://www.europeanproceedings.com/article/10.15405/epms.2019.12.23): mixed Indian/Arab facade traditions and warm-climate adaptations. Visual vocabulary, NOT measured facade coordinates or permission to copy any protected image/model.
- [UNESCO Historic City of Aden 2025 *tentative list*](https://whc.unesco.org/en/tentativelists/6858/): a historically multi-cultural port city embedded in volcanic landscape. **Tentative listing is not World Heritage inscription**.

Accordingly, the current assets use **original** weathered wood screens, stone/lime-colored facade pieces, awning stripes, common street paving, distinct shop identities, a simplified arcade trim, and public walking space. Actual historic 2015 building accuracy, era/cultural review, real facades, LOD/HLOD, Nanite, photogrammetry, urban survey and art texture rights are all **not yet validated**.

## New implemented geometry

A new module `src/aden-civic-street-details.cjs` adds precisely **181 distinct local-metre components** above the previous PR #761's three-building/39-solid civic blockout.

- **33 continuous 4m promenade paving panels** spanning local east-west X=50..178 at Z=57. Terrain elevation is sampled at the actual local X/Z from the verified original R16 tile. Panels are **visual-only**, because native R16 remains the authoritative ground collision. An explicit adjacent-step test checks for unacceptable jumps rather than pretending this terrain is flat.
- **Three separately paved public approaches** connect the long promenade to the unchanged genuine 4.4m, 4.8m and 5.2m open ground-floor doorways. Test a **0.85m-radius pedestrian capsule** from street through each interior centre line: neither existing shop geometry nor the new solids may obstruct the route.
- **Varied facade**: roof-top low parapet edges (physical), framed wooden screens and louvres, light stone pilasters, unbranded shop friezes; market shade stripe treatment, craft hall stone courses, and an original simplified arcade trim. These are **decorative at street height**, and their mesh collisions are disabled to avoid a painted window/shade silently becoming an invisible wall.
- **Four authored ordinary street lamp shapes** located away from central walking space. These visual pieces are **not** operational public lighting/utility data from the real city.
- One overall continuous layout with a palette of nine author-controlled stone/plaster/wood/cloth colours. The current cubes are **modular low-poly prototype geometry**, not photoreal assets. The 181 standalone StaticMeshActors have not been native-benchmarked.

## Executable original-source pipeline

First, generate source-only test terrain and the original 39-piece civic quarter from existing PRs:

```bash
node scripts/prepare-ue5-terrain-lab.cjs
node scripts/prepare-ue5-civilian-quarter.cjs Unreal/Veilpoint/Saved/CityTiles
```

Then generate the new scene file:

```bash
node scripts/prepare-ue5-civil-street.cjs Unreal/Veilpoint/Saved/CityTiles
```

The script uses **only** `CIVILIAN_QUARTER.json`-compatible original building metadata and the independently SHA-256-verified central `aden_x0_z0_505.r16`. It writes `CIVIL_STREET_DETAIL.json`, refuses overwrites, refuses changed input terrain and declares itself `local-metre-unreferenced`, `actualAdenCoverageVerified=false`.

In Unreal Editor, open the **separate** `/Game/Maps/Aden_TerrainLab` with the previously authored 39 building actors, then run **Tools → Execute Python Script → `scripts/ue5-author-civil-street.py`**. The script validates both files and central R16 hash, rejects any other loaded level or duplicate import, generates original color materials, and attempts to add 181 UE5 StaticMeshActors. Only after actual Editor authoring, saving, PIE walk-through, collision and GPU frame time testing may the output be called **engine-verified**. GitHub Actions Linux Node and Windows browser-host EXE are **NOT native UnrealBuildTool/PIE**.

## Acceptance gates

1. Unique/finite geometry, correct material/role taxonomy and all three facade typologies.
2. Continuous 33-panel shared boulevard, real R16 elevation correspondence for every panel; gentle step transitions in the original synthetic fixture.
3. A 0.85m body traverses the street center and three genuine building doorways without hitting a solid wall/decorative block.
4. All 181 emitted parts are reproducible from source, the R16 is SHA-verified, and any changed terrain or second write is refused.
5. Existing BR96, CH01, save/checkpoint data and user controls remain unchanged; no injection of untested native assets into those game modes.
6. Source-only Unreal Editor script checks must not be reported as native PIE successes.

**Next:** Real imported licensed/dates public civil terrain, native Editor import and screenshots, richer distinctive civilian windows/arcades/streetscape, true city-scale world streaming and measured Windows performance. Accuracy must be earned per region, rather than assumed because the long-term project target is 1:1 full Aden.
