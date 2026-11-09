# VEILPOINT — Aden full-city 1:1 scope and build gates
**Effective 2026-11-09; owner supersedes the previous one-third-size request.**

## Binding target versus achieved state

**Goal:** an explorable representation of **the entirety of Aden's civilian city at 1:1 spatial scale** (one game world metre = one represented metre), using the fullest legitimately sourced geographic, historical and ordinary civilian architectural reference possible. Preserve the fictional story/characters without claiming historical events occurred as scripted. Preserve BR/CH01 use of a coherent common city.

**Not achieved:** The existing offline game is a **350m proof-of-play**. The background mountains/water/48 shells from #754 are **unlocated scenic blockouts**, not surveyed relief, accurately measured shoreline or built city coverage. Do not relabel them as mapped Aden tiles. No city boundary geodata or DEM tile has yet been downloaded, validated, licensed, imported, or rendered by UE5 World Partition. Changing a scope document alone does not build the city.

"1:1" refers to metres of horizontal/vertical space. "100% identical building-for-building, in every year" is not a provable claim: sources have acquisition dates, incomplete coverage, inaccessible interiors and ongoing changes. Per-region accuracy labels must be earned; do not replace missing data with fake survey claims.

## Civilian-world coverage plan

The following are **district categories**, not precise GPS outlines or operational targets:

- Crater: historic basin and the Shamsan volcanic slopes; ordinary public civic streets, layered older city textures.
- Tawahi / Ma'alla: waterfront city fabric, mixed commercial/residential buildings and maritime appearance.
- Khormaksar: lower coastal plain and mainland-facing neighborhood appearance.
- Sheikh Othman / Mansoura / Dar Saad: broader inland civilian districts, distinct residential/commercial density.
- Al Buraiqa: western coastal urban and natural landscape appearance.

Do not invent administrative boundaries or calculate purported "percentage of the entire city" without a sourced, date-stamped polygon. A full city will need many tiles; a precise total cannot yet be stated.

## Technical implementation — current PR

- `src/aden-citywide-tiles.js` provides local-metre 1:1 tile addressing with **512m square tiles**, including correct negative-coordinate floor division, explicit tile bounds, source provenance, sampled 17/33/65-square heightfields, metre-interpolated height lookup, cardinal edge continuity audit, and deterministic near-camera loading/retention/unloading under a bounded tile budget.
- `Unreal/Veilpoint/Source/Veilpoint/VPCityTileGrid.h` gives the native code the **same metre-to-centimetre grid** and bounded candidate tile ring. This is only math scaffolding; **no** World Partition / Landscape data layer / engine-streaming actor is wired yet.
- A tile is admitted only when its source declares provider, observed date, usage/license and appropriate public-terrain scope. Declared metadata is not proof of the truth or validity of a license: an actual import review remains mandatory.
- Unavailable tiles appear as **unresolved**. The streamer never fills unseen city blocks with fictitious building footprints and never declares `completeCity=true`.
- The existing 350m BR/CH01 demo is intentionally untouched. No 1:1 full city traversal, native 96-player city-scale netcode, full-city save format, or RTX3070 performance measurement is demonstrated by this module.

## Data candidates, provenance, and licensing controls

1. **NASA Earth Observatory — Port of Aden (2016):** broad shape of volcanic peninsula, harbor basin, sandy connectors. Interpret as dated overview, not building-level elevation or rights-cleared production texture: https://science.nasa.gov/earth/earth-observatory/port-of-aden-yemen-88574/
2. **UNESCO World Heritage Centre (2025), Historic City of Aden, *tentative list*:** historic horseshoe-like volcanic setting and civic-architectural plurality; not evidence every feature existed in 2015: https://whc.unesco.org/en/tentativelists/6858/
3. **Copernicus DEM GLO-30/GLO-90:** potential landscape base. These are DSM products, not building-free bare-earth models; the public 30m service gained access restrictions in August 2026, so confirm current access eligibility and copyright notices before importing. Even 30m spacing does not validate individual buildings or curb edges: https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM ; https://dataspace.copernicus.eu/news/2026-8-25-copernicus-dem-30m-view-service-update
4. **OpenStreetMap (OSM):** possible ordinary public civilian geographic reference, subject to **ODbL**, attribution and produced/derived database requirements. Do not assume maps, images or commercial downstream works are unrestricted; obtain asset-specific legal review and comply: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines

Required per-import provenance: original provider, observed/acquired date, license/rights, original metadata/URL, transform/derivation record, map extent and uncertainty; distinguish public terrain from licensed public buildings and authored art. No source is auto-imported by these tests.

## Production steps and clear acceptance gates

1. **City boundary definition:** legitimate historical or civic dataset, source date, documented urban-area definition, edge water/terrain policy, 512m grid coverage. Do not fabricate the extent.
2. **Terrain:** import vetted DEM into UE5 heightmaps; preserve sample interval and vertical units; run cross-tile height/normal/slope audits, coast alignment and edge compatibility. Node seam tests run now, but no real DEM is loaded.
3. **Public districts:** modular licensed period-appropriate civilian architecture, façade varieties, public interiors, street character, storefronts, lived-in civilian spaces; retain physical doors/access for included playable scenes. Do not claim textures/photos are licensed without rights.
4. **City streaming:** configure real UE5 World Partition/data layers/HLOD, coordinate origin rebasing, distance budgets and safe reload. Build actual cooked PC packages and walk across adjacent streamed tiles. The 512m grid header is not a substitute for this.
5. **Gameplay integration:** rework BR/CH01 actor replication and navmesh streaming to handle city scale while preserving fair shared BR96 physics and campaign save compatibility; verify actual clients and finite resources. Do not invent gameplay accessibility to unbuilt cells.
6. **Native performance/quality:** measured QHD 2560×1440 frame-time percentiles and VRAM/RAM on the user's RTX3070/16GB machine; UE5 screenshot/recorded path comparisons with licensed reference images; historic/cultural review. 165Hz refresh is not an FPS result.

**Safety & integrity:** This is a civilian geographic/art-production project. No precise real active-conflict checkpoint/base/perimeter, restricted interior, current unit deployment, tactical route or vulnerability model is imported. Such event locations remain original fictional scenarios.

**Schedule risk:** Reproducing an entire real city with credible building-level appearances is far greater in scope than a small detailed district, especially for a single developer. The Nov 27 2026 demo and Apr 27 2027 final are aspirational milestones, **not evidence that the entire city can be completed** on those dates. Quality gates supersede arbitrary claims of full coverage.
