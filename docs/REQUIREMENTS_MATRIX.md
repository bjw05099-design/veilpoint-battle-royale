# VEILPOINT — User Requirements Traceability (living document)
Updated 2026-10-27. Status labels are evidence-based: **Implemented**, **Partially implemented**, **Planned**, **Blocked / unverified**. A requirement being described in a document is *not* its implementation.

| ID | Owner requirement | Priority | Acceptance evidence | State as of 2026-10-27 |
|---|---|---|---|---|
| R-01 | Original photorealistic first-person FPS, no direct imitation | P0 | Native UE packaged footage + independent comparative review; original art/audio/code rights | Planned; only prototype/scaffold exists |
| R-02 | Modern Middle East-inspired war + civil-conflict story campaign | P0 | Authored campaign arc, start-to-end playable chapters, checkpoints, voice/subtitles and QA | Partially implemented: short CH01 browser mission logic, objectives, optional clues, checkpoints and subtitles; real browser QA + remaining 12h unverified |
| R-03 | Conventional team-based online multiplayer in addition to story | P0 | Validated 2-client dedicated-server match and scalable objective mode, lobby, scoreboard, reconnection | Planned |
| R-04 | Battle royale mode | P0 | Verified drop/loot/zone/end-to-end session; public release requires real multiplayer | Partially implemented in browser **offline vs bots** |
| R-05 | Recognize strengths of cinematic military FPS, living open-world cities, tactical BR and embodied realism while staying unmistakably original | P0 | Design review + external blind originality test; no recognisable copied expressions/assets | Partially implemented in original CH01 Signal Echo design and code; external originality review outstanding |
| R-06 | Unique VEILPOINT gameplay identity | P0 | Playtest Signal Echo in campaign + shared Signal Weather in multiplayer + believable changing districts | CH01 Signal Echo optional evidence and route-choice prototype coded; Signal Weather/real playtests planned |
| R-07 | Visually convincing high-fidelity UE world | P0 | Compiled UE, licensed PBR environments, real-time capture and visual QA | Blocked / unverified engine/hardware |
| R-08 | HyperReal 165Hz seeks quality and responsiveness simultaneously | P0 | Native profiles + named-hardware frametime and image-quality measurements | Prototype/UE settings source partly present; hardware unverified |
| R-09 | Six named graphics presets and granular Custom | P0 | User-selectable, persistent mode-independent settings and regression tests | Browser implemented; UE source only, integration unverified |
| R-10 | Distinguish 165Hz refresh vs 165FPS cap and 60Hz simulation | P0 | Tests and performance UI labeling | Partially implemented in browser; actual monitor unverified |
| R-11 | High efficiency GPU/CPU optimizations (visibility, LOD, adaptation) | P0 | Automated tests and real GPU performance before/after | Code partly present; real GPU comparison unverified |
| R-12 | Server-authoritative multiplayer fairness/security | P0 | Real dedicated-server build, invalid input tests, reconnect & packet-loss testing | Not achieved |
| R-13 | High-quality movement, interaction, audio, accessibility | P0 | Real end-to-end playtest and settings evidence across modes | Browser CH01 now has movement, interactions, subtitles, touch and checkpoint UI; audio, real browser and native QA incomplete |
| R-14 | 2026-11-27 playable demo | P0 milestone | Self-contained package, end-to-end test and CI results | Planned; see DEMO_DELIVERY_GATES.md |
| R-15 | 2027-04-27 six-month final version stretch target | P0 milestone | All required modes + verifiable full release gates | Planned; highly ambitious for solo developer |
| R-16 | Continue hourly development after target if quality gates unmet | Process | Enabled recurrence, GitHub iteration results, periodic milestone review | Recurring automation configured; platform limits apply |
| R-17 | High hourly productivity without regression or fictitious claims | Process | PR/commit, changed files, passed tests, CI, measured metrics and honest blockers | Workflow requirement |
| R-18 | One-person project + AI, only veilpoint repository modified | Process | Audit commit location and realistic workload | Constraint active |
| R-19 | Story POV: fictional 대한민국 특수부대 **서진혁 대위** throughout the campaign | P0 | Actual mission/cutscene playtest confirms a continuous captain POV for all chapters | Story/metadata/CH01 narrative text partly updated; full-game unverified |
| R-20 | Major fictional **국가정보원 요원 윤서하·강민재** supporting characters | P0 | Written scenes, original VO/subtitles and interactions in playable campaign; no presentation as real NIS operations | Character metadata and planned narrative only |
| R-21 | Story campaign is combat-first, about **60–65% active playable runtime** as an authored design target | P0 | Real playable action encounters, differentiated missions, playtest-derived share; non-graphic story depiction | Design and data target only; existing CH01 browser slice still non-combat |
| R-22 | Story campaign must aspire to **immersion beyond cinema through player agency**, spatial AV, plausible characters, physical presence, interactive set pieces and reliable pacing | P0 | Twelve fully playable native chapters; moving visual/audio capture, checkpoint and choice consequence tests, independent player ratings across presence/agency/character/pacing/stability and comparative methodology | Design/quality gates specified; full implementation and independent assessment **not achieved** |

## Completion rules
- **Full release means all major modes work**, not just a designed menu or documentation.
- Campaign and online multiplayer must be *playable and tested*, not only described.
- A fictional Middle East-inspired setting must avoid copied geopolitical plots, stereotyping and unlicensed real insignia.
- World-leading visual quality and 165FPS are not established without comparative evaluations and specific hardware metrics.
- If any P0 acceptance condition fails by 2027-04-27, remain in improvement status and do not call the game complete.
- No unapproved voluntary automation shutdown; external service/account availability cannot be guaranteed.

## Development references
[Game Bible](GAME_DESIGN_BIBLE.md) · [Campaign](STORY_CAMPAIGN.md) · [Multiplayer](MULTIPLAYER_MODES.md) · [Graphics](GRAPHICS_PROFILES.md) · [Demo Gates](DEMO_DELIVERY_GATES.md) · [Final Roadmap](FINAL_RELEASE_ROADMAP.md)

## Evidence update — 2026-10-27 CH01 browser vertical slice

New implementation: `story.html`, `src/story-slice.js`, `src/story-app.js`, `tests/story-slice.test.cjs`; linked from the existing `index.html`. Reuses the procedural first-person renderer, movement/collision and graphics presets. Mission-01 relay → optional records → meaningful route choice → destination → completion, with checkpoint serialization and local-only save. **This is a short prototype, not 50 minutes of M01 or 12 hours of authored campaign.** Browser launch, visual quality, GPU/165Hz and CI verification are not established by source tests. The planned online modes and native UE build remain unverified.

**Latest binding campaign cast/gameplay specification:** [Combat Campaign Canon](COMBAT_CAMPAIGN_CANON.md). Earlier investigation-led and other-lead drafts are historical. The current CH01 browser prototype has *no playable combat*; requirement R-21 is **not yet met**.
