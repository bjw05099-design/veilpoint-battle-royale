# Aden map development — two real map domains (2026-11-09)

## 1. Walkable shared Crater-style civilian architecture

The existing 350m BR/BR96 and CH01 scene now contains a **fictional, publicly accessible rainwater courtyard** at local preview coordinates `(-80,-12)`. This is original civil architecture inspired by the historical concept of Aden's drainage and cisterns, **not** a replica of the exact Tanks of Tawila, protected historic structures, current restricted infrastructure or an actual city address.

- 16 separate fixed-height physical AABBs: 6 perimeter masonry pieces, 2 shallow **dry** stone decorative basins, 4 seats, 4 columns.
- North and south entrances have a real central 8m-wide gap, tested with the actual 60Hz moving 0.85m capsule; the western wall blocks passage.
- A pedestrian walks through the center and both side paths without teleporting or crossing false walls. Basin props are physical, distinct from actual water supply services. No new player item pickups, mission markers or interaction key bindings.
- Both WebGL and Canvas draw the same visible fixtures, paving and **2 raised side roofs**. Native UE5 C++ has all sixteen exact colliders and matching roof bottoms at 3.74m on BR and CH01 peers before the mode split.
- No new save schema; historical terrain-revision-0, existing BR96 lobby, public footpaths and CH01 saved checkpoint paths remain compatible. Native authoring remains source-level until actual UE5 UBT/PIE verification.

## 2. Actual browser-runtime citywide terrain tile preview

The new **`terrain.html`** page ships with the offline browser ZIP and is accessed by opening that file after extraction. It uses `src/aden-citywide-tiles.js`, not a fake screenshot.

- A 5×5 grid of **25 tiles**, each **512 × 512 metres**, is generated from ONE continuous explicitly **fictional** mathematical height function. Do not confuse this with a surveyed DEM of Aden.
- The viewer calls `createRegistry`, `planStreaming` and `buildTerrainMesh` while rendering real 2D projected terrain triangles with slopes and shoreline shading.
- Arrow keys or WASD move the camera by **128m per action**. Zoom changes rendered mesh LOD and tile-streaming memory; the status displays current tile address, source grade, triangle count, missing tile count and a conspicuous **0 actual Aden tiles** declaration.
- 105 artist-created civilian house shells illustrate varied block texture and scale. They are NOT real Aden footprints, and they are **not** imported into BR96 server authority, saved campaign progression or UE5 World Partition.
- Browser 2D Canvas works offline without external images, fonts, libraries or network access. The ZIP's verifier now audits the third page's local script dependency closure.
- No computed full-Aden coverage ratio, no 1:1 verified map accuracy claim, and no measured RTX3070/UE5 runtime performance.

## Next genuinely map-specific blockers

1. License-approved, date-appropriate **public terrain DEM / DSM** with coastal elevation datum and a validated civilian-city boundary and uncertainty. The present 25 sample tiles must NEVER be silently promoted into actual surveyed Aden.
2. Real UE5 **World Partition / Landscape heightfield tiles** and cross-tile collision/normal/HLOD validation. C++ coordinate math and a Canvas preview are not a native city loader.
3. Regional civilian architecture materials, historically plausible street typography and lived-in surroundings from sourced 2015-era references. Avoid same generic box copied 10,000 times.
4. Native repeatable 1:1 walk tests across districts plus real QHD 2560×1440 GPU/frame-time evidence on target Windows hardware.
5. Preserve all prior gameplay, including F physical interaction, middle-click self-position quickmark, 6×16 BR capacity and the 12-hour narrative target.

**References for broad identity, not precise site duplication:** [NASA Earth Observatory, Port of Aden (2016)](https://science.nasa.gov/earth/earth-observatory/port-of-aden-yemen-88574/) and [UNESCO World Heritage Centre, Historic City of Aden (2025 tentative list)](https://whc.unesco.org/en/tentativelists/6858/). Asset licensing and observation dates must be verified per dataset rather than inferred from these contextual descriptions.
