# VEILPOINT — Aden geographic & architectural reference (owner-approved, 2026-11-07)

**Primary real-world reference:** Aden, southern Yemen; **historical visual baseline:** approximately 2015, the year in which the conflict escalated significantly. The project is still original fiction: **Nahrin / Sahir Coast** is a fictionalized playable district, not a claim to portray real events or actors, and the fictional Korean captain, NIS cast, and twelve-chapter campaign retain their established canon.

**Decision:** Real-world geographical, urban and architectural fidelity is required. Do not substitute a generic sand-desert map, random box-city, or undifferentiated Middle Eastern architecture for researched Aden landscapes. The **current** BR browser terrain, CH01 low-poly port, and native UE5 blockout are **NOT** measured against Aden reference data; this file is a production requirement, **not** an implementation or accuracy claim.

## Non-negotiable world-building reference

- **Natural shape:** A coastal city against rugged volcanic landforms; Crater's historic low urban basin is bounded by higher rocky ridges. Protected bays, lower waterfront strips, the bay-facing harbor and flatter sandy areas are different landforms. Preserve their relative character and actual scale relationships using documented non-sensitive elevation/topography.
- **Historic urban fabric:** Contrast Crater's older, tightly built mixed commercial/residential environment with Ma'alla and Tawahi coastal urban strips, later extensions and flatter peripheral districts. Derive street character, neighborhood density, rooflines and mixed-use frontages from **dated, licensed** historical sources; do not clone one generic building repeatedly.
- **Buildings and surfaces:** Model Aden-appropriate plaster/concrete and masonry facades, flat roofs, weathering, shopfronts, residential courtyard configurations where documented, and harbor-facing commercial/warehouse structures. Only include specific structural forms when reference evidence supports them.
- **Grounding in human life:** Civilian neighborhoods remain homes and workplaces, not empty combat props. Distinguish ordinary wear, coastal salt exposure, ageing and *documented historical* war damage. Do not randomly destroy every building or attribute fictional crimes to any real community.
- **World consistency:** Hills, shoreline, street gradients, district silhouettes, ground elevations, building footprints, visible geometry and traversable collision must agree. Browser demo and native UE5 can differ in visual complexity, not in fundamental physical credibility.
- **No hidden gameplay advantage:** A geographic reference is for environmental fidelity, not a source of real-world military targeting, current facility layouts, tactical routes, live unit positions or vulnerable infrastructure details. Fictionalize any such sensitive operational placement and all engagements.

## Reference hierarchy and temporal control

1. **NASA Earth Observatory (2016), Port of Aden, Yemen:** visible extinct volcanic landform, sandy spit, bay and harbor relationship. https://science.nasa.gov/earth/earth-observatory/port-of-aden-yemen-88574/
2. **UNESCO World Heritage Centre (2025), Historic City of Aden, Yemen (Tentative List):** historic volcanic crater city and culturally diverse built heritage. This is a *2025 descriptive source*, not independent proof of 2015 building condition. https://whc.unesco.org/en/tentativelists/6858/
3. **World Bank (2020), Updated Dynamic Needs Assessment for Yemen:** explicit **March 2015 baseline** and assessment of conflict-related urban/infrastructure damage, including Aden. Do not extrapolate nationwide percentages to individual neighborhoods or buildings. https://www.worldbank.org/en/brief/2020/12/15/updated-dynamic-needs-assessment-for-yemen
4. **JICA historical urban/physical setting assessment:** district geography (Ma'alla, Tawahi, Crater, Khormaksar) and coastal/mountain differences. Independently validate publication year and use historical context only. https://openjicareport.jica.go.jp/pdf/10834695.pdf

Historical details and 2015-era city state must be cross-checked rather than inferred from undated modern images. Every imported dataset, reference photo, height model, map extract and texture requires a provenance record (author/provider, observation date, acquisition date, license, modification and intended in-game use). Research images are **not** licensed game textures by default.

## Deliverables and acceptance, in priority order

1. **World reference board:** dated overview of geology/shoreline; three different civilian neighborhood architecture profiles; separate commercial harbor and inland-slope references. Clearly mark facts versus fictional composition.
2. **Heightfield prototype:** non-sensitive, legitimately sourced elevation and coastal outline compared with reference images, with scale/elevation units, cliff gradients, navigable street slopes and reproducible import notes; no detailed active-conflict site replicas.
3. **District graybox:** at least one compact but coherent playable historic urban block, one shore-facing commercial block, one terrain transition; collision, exits and pedestrian paths align with visible real-scale structures.
4. **Native graphics pass:** original/licensed materials and models, weathered realistic surfaces, light/sky and scalable draw distance; test on Windows hardware. Preserve the 60 Hz simulation, PC controls and existing save semantics.
5. **Acceptance evidence:** dated-source comparison images and human PC traversal screenshots; explicit scene-scale collision audit; actual UE5 editor compile/package evidence; RTX 3070 / QHD 2560×1440 / 16GB RAM measurement, with 165 Hz *display capability* not asserted as a verified FPS.
6. **Historical review:** independent factual and cultural review, including everyday civic detail, meaningful civilian agency and non-graphic, respectful representation.

**Current state:** Approved **reference and target**, not 1:1 reconstruction. The November 27 offline demo remains a prototype; a fully mapped Aden-derived native world is later work. Do not falsely label the current Nahrin or BR grayboxes "real Aden" until the acceptance evidence exists.

**Compatibility:** The fictional original character names and Nahrin/Sahir narrative labels remain, while landscape and building references use this documented historical Aden source. No existing BR, CH01, team gameplay, saves, FortisGuard, or automations are changed by this reference decision.
