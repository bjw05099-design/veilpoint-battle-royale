# VEILPOINT — User Requirements Traceability (living document)
Updated 2026-10-27. Status labels are evidence-based: **Implemented**, **Partially implemented**, **Planned**, **Blocked / unverified**. A requirement being described in a document is *not* its implementation.

| ID | Owner requirement | Priority | Acceptance evidence | State as of 2026-10-27 |
|---|---|---|---|---|
| R-01 | Original photorealistic first-person FPS, no direct imitation | P0 | Native UE packaged footage + independent comparative review; original art/audio/code rights | Planned; only prototype/scaffold exists |
| R-02 | Modern Middle East-inspired war + civil-conflict story campaign | P0 | Authored campaign arc, start-to-end playable chapters, checkpoints, voice/subtitles and QA | Partially implemented: short CH01 browser mission logic, objectives, optional clues, checkpoints and subtitles; real browser QA + remaining 12h unverified |
| R-03 | Conventional team-based online multiplayer in addition to story | P0 | Validated 2-client dedicated-server match and scalable objective mode, lobby, scoreboard, reconnection | **Partial candidate:** localhost Node 2-client objective prototype with server-owned finite shot/reload/health and round-ending incapacitation, keyboard/touch commands and HTTP integration tests. Still a 2D test client, **not a finished FPS**, public service or UE multiplayer; human browser/network playtests pending. |
| R-04 | Battle royale mode | P0 | Verified drop/loot/zone/end-to-end session; public release requires real multiplayer | Partially implemented in browser **offline vs bots**; deterministic rival-vs-rival sensing and firefights are a code candidate. Automated simulated win/loss/restart checks are not real-browser end-to-end QA |
| R-05 | Recognize strengths of cinematic military FPS, living open-world cities, tactical BR and embodied realism while staying unmistakably original | P0 | Design review + external blind originality test; no recognisable copied expressions/assets | Partially implemented in original CH01 Signal Echo design and code; external originality review outstanding |
| R-06 | Unique VEILPOINT gameplay identity | P0 | Playtest Signal Echo in campaign + shared Signal Weather in multiplayer + believable changing districts | CH01 Signal Echo optional evidence and route-choice prototype coded; Signal Weather/real playtests planned |
| R-07 | Visually convincing high-fidelity UE world | P0 | Compiled UE, licensed PBR environments, real-time capture and visual QA | Blocked / unverified engine/hardware |
| R-08 | HyperReal 165Hz seeks quality and responsiveness simultaneously, now targeting RTX 3070 at QHD 2560×1440 | P0 | Native profiles + actual 165FPS/6.06ms frame-time and image-quality measurements on owner hardware; report if goal conflicts with realism/fidelity | Prototype/UE settings source partly present; no RTX 3070 QHD frame-time measurements yet |
| R-09 | Six named graphics presets and granular Custom | P0 | User-selectable, persistent mode-independent settings and regression tests | Browser implemented; UE source only, integration unverified |
| R-10 | Distinguish 165Hz refresh vs 165FPS cap and 60Hz simulation | P0 | Tests and performance UI labeling | Partially implemented in browser; actual monitor unverified |
| R-11 | High efficiency GPU/CPU optimizations (visibility, LOD, adaptation) | P0 | Automated tests and real GPU performance before/after | Code partly present; real GPU comparison unverified |
| R-12 | Server-authoritative multiplayer fairness/security | P0 | Real dedicated-server build, invalid input tests, reconnect & packet-loss testing | **Partial candidate:** Node localhost server owns movement, cover collision, finite forward-facing opponent visibility, contest/score and lifecycle with 60Hz pure rules; two independent HTTP clients tested, sequence replay and score/teleport/facing injection rejected. Candidate adds server-owned cover-aware hits, cadence, finite ammunition/reload, no client-authored damage, and end-of-round incapacitation tests. Tab-scoped guest resume and heartbeat lease implemented; local HTTP candidate also validates exact origin scheme/host/port, rejects malformed origins and caps JSON bodies by UTF-8 bytes. DOM/HTTP regression candidates are not real-browser or public-network QA. No public security audit, latency/packet-loss test, persistent accounts or UE dedicated server. |
| R-13 | High-quality movement, interaction, audio, accessibility | P0 | Real end-to-end playtest and settings evidence across modes | Browser CH01 now has movement, interactions, subtitles, touch and checkpoint UI; audio, real browser and native QA incomplete |
| R-14 | 2026-11-27 playable demo | P0 milestone | Self-contained package, end-to-end test and CI results | Planned; see DEMO_DELIVERY_GATES.md |
| R-15 | 2027-04-27 six-month final version stretch target | P0 milestone | All required modes + verifiable full release gates | Planned; highly ambitious for solo developer |
| R-16 | Continue hourly development after target if quality gates unmet | Process | Enabled recurrence, GitHub iteration results, periodic milestone review | Recurring automation configured; platform limits apply |
| R-17 | High hourly productivity without regression or fictitious claims | Process | PR/commit, changed files, passed tests, CI, measured metrics and honest blockers | Workflow requirement |
| R-18 | One-person project + AI, only veilpoint repository modified | Process | Audit commit location and realistic workload | Constraint active |
| R-19 | Story POV: fictional 대한민국 특수부대 **이수혁 대위** throughout the campaign | P0 | Actual mission/cutscene playtest confirms a continuous captain POV for all chapters | Story/metadata/CH01 narrative text partly updated; full-game unverified |
| R-20 | Major fictional **국가정보원 남성 요원 김지윤·여성 요원 조현지** supporting characters | P0 | Written scenes, original VO/subtitles and interactions in playable campaign; no presentation as real NIS operations | Partially implemented: CH01 김지윤 information-only report (no shield/health grant) and 조현지 combat-state subtitle callouts; independent companion AI, VO and full narrative arcs unverified |
| R-21 | Story campaign is combat-first, about **60–65% active playable runtime** as an authored design target | P0 | Real playable action encounters, differentiated missions, playtest-derived share; non-graphic story depiction | Partially implemented: CH01 browser has a **candidate** three-human-opponent fictional encounter with finite sight-gated hostile shots, aim/fire, direct health damage and information-only ally report; ray-tag/charge nomenclature and incomplete weapon/AI modeling still violate the full realism standard; 60–65% runtime, human playtests and remaining chapters unverified |
| R-22 | Story campaign must aspire to **immersion beyond cinema through player agency**, spatial AV, plausible characters, physical presence, interactive set pieces and reliable pacing | P0 | Twelve fully playable native chapters; moving visual/audio capture, checkpoint and choice consequence tests, independent player ratings across presence/agency/character/pacing/stability and comparative methodology | Design/quality gates specified; full implementation and independent assessment **not achieved** |
| R-23 | **Strict realism across all modes without shields, magic recovery, omniscient minimaps, or unexplained hazards** | P0 release blocker | Auditable source/CI, gameplay sight-line validation, finite resources, physically justified combat systems and human playtests | **Partially implemented**: CH01 finite resources/objective map and truthful partial-cache/carry-capacity HUD; BR/CH01 live player entities omit shield state (older v2 CH01 saves still serialize inert zero for compatibility), no instant healing/omniscient minimap, finite player/bot ammo and reload, FOV/aim gating. **Current candidate** adds rival-vs-rival combat with visible-only targeting, finite ammo, no false player kill credit, and no zone-death firing. CH01 now has a candidate finite-ammo human encounter replacing magical drone pulses, but still lacks believable AI movement, realistic weapon/medical systems, credible zone hazard, real-world assets, native/browser human playtests and server-authoritative multiplayer. Issue #15 remains open. |
| R-24 | **All objects grounded in documented real products / believable material engineering** | P0 | Asset inventory by category (arms/tools/vehicles/buildings/electronics/everyday items), source provenance and licensing, proportions/material/physics comparisons and original or appropriately licensed game-ready assets | **Planned**: policy documented in COMBAT_CAMPAIGN_CANON.md; no comprehensive licensed 3D asset inventory or comparison verification yet |

| R-25 | Owner-reported **RTX 3070 + QHD 2560×1440 165Hz + 8GB system RAM**, with **AMD mobile '9-series' CPU (possibly Ryzen 9; SKU unconfirmed)** | P0 test environment | Identify exact CPU via Windows CPU name and verify RTX 3070 desktop/mobile variant and laptop GPU TGP; benchmark AC power, temperatures/throttling, memory and VRAM use, QHD output vs internal scale, FPS P50/1% lows, CPU/GPU/frame-time P50/P95/P99 under tested scenes | **Not benchmarked:** mobile CPU series only approximate, exact SKU/generation and GPU variant/power unknown; laptop cooling and 8GB system RAM create potential bottlenecks. High-quality 165FPS is a stretch, not a verified result. See GRAPHICS_PROFILES.md |
| R-26 | Low-memory compatibility and honest performance reporting for owner 8GB system RAM | P0 | Validate packaged run, loading, peak memory, asset-streaming, background-OS headroom and paging under 8GB; monitor VRAM independently. Avoid claiming 165FPS or 12h native-game feasibility without measurements | **Not benchmarked / blocked by absent owner PC execution data**; initial memory budget and measurement plan in GRAPHICS_PROFILES.md |

| R-27 | Distinct original firearm classes and stress/fatigue-linked, recoverable reload mistakes across all three modes (issue #20) | P0 gameplay | Actually playable class-specific handling and animation/audio, finite inventory, predictable feedback, accessibility, checkpoint migration, 60Hz deterministic tests and authoritative server verification | **Partial candidate**: deterministic exertion/injury stress, recoverable reload hesitation, H/touch accessibility assist, BR/CH01 UI and checkpoint regression; **seven fictional class profiles in BR and CH01 browser code candidate** with selectable start loadout, distinct finite magazine, cadence, damage, movement and synthetic cue, CH01 class-specific reload and legacy checkpoint migration; production-quality models/animation/recorded audio for seven classes, **team prototype has one finite-ammo authoritative weapon (not class diversity)**, production online inventory and real-browser QA remain unimplemented/unverified |

| R-28 | **Causally coherent 12-chapter narrative:** credible fictional deployment mandate and inter-agency limits, character motives, dated evidence and uncertainty, travel/injury/equipment continuity, foreshadowing/payoff, consequential player choices and independent narrative QA | P0 story | Playable scene consequences, checkpoint/route consistency tests, chapter timeline and independent plausibility reviews | **Partial CH01 candidate (2026-10-28):** fictional civilian evacuation authorization and distinct NIS information roles appear in browser briefing; 04:07/04:12 records remain explicitly uncertain; evidence-verified branch authorizes a finite-duration sliding east checkpoint gate; collision and WebGL dynamic geometry follow the same live world obstacle and restore from saved elapsed time/authorization. A person in the travel path pauses clearance rather than being displaced. This is a browser-code candidate pending CI and human visual QA. Remaining 12 chapters, timeline, human narrative QA and native cinematic playtest are unimplemented/unverified. |

## 2026-10-28 team tab-resume aim reset candidate

- **R-03 / R-23 — partial code candidate:** A reloaded tab now sends the server an explicit `aimRelease` after clearing movement and capture, even when the browser skipped blur and pointerleave. This closes a sticky-aim input regression across refresh and restores keyboard-facing control. Mocked two-client resume regression and CI required; no production reconnect claim.

## 2026-10-28 team aim lifecycle follow-up candidate

- **R-03 / R-13 / R-23 — partial code candidate:** Pointer aim now follows a fixed map-world point as the player moves and uses the authoritative server tick for bounded refreshes, rather than leaving a stale initial facing. Leaving the aim canvas, pressing Q or losing focus sends a validated release command so keyboard-only movement can regain facing control. Round resets still clear the override. This prevents a sticky-aim regression in the initial independent-aim implementation.
- **Verification boundary:** New server and browser-mock regressions must pass; human pointer/latency QA and real FPS controls remain outstanding.

## 2026-10-28 team player-controlled independent aim candidate

- **R-03 / R-12 / R-13 / R-23 — partial code candidate:** The local two-client team prototype adds a validated, normalized server-owned aim-direction command. Canvas pointer/touch input can change facing independently of movement, so strafing no longer automatically turns an explicitly aimed character. The server still owns sight, cover, damage and ammunition; client commands contain no opponent ID, hit result or position teleport. A new round resets the aim override and keyboard-only movement-facing remains compatible.
- **Verification boundary:** Deterministic match tests, mocked browser/network input and CI are required. This is a 2D local prototype, **not** a real 1st-person aiming animation, public internet service, mouse latency benchmark or UE server proof.

## 2026-10-28 finite-loot physical reach candidate (BR + CH01)

- **R-13 / R-23 — partial code candidate:** The BR pickup simulation, E/touch HUD eligibility and CH01 supply marker now require the player to be within 1.8 game-world units of a physical ammunition cache, with the existing line-of-sight gate. Larger interaction range remains for non-pickup terminals and route triggers. Previously a cache could be collected from roughly 3.7–4 units away without contact, which contradicted the strict realism objective.
- **R-14 / R-27 — regression required:** Deterministic tests cover out-of-reach rejection, HUD/input parity, finite ammo conservation, one-time cache consumption and CH01 save/restore. The 1.8-unit reach is a browser-game approximation, not measured arm geometry or UE physics; human browser/device QA remains outstanding.

## 2026-10-28 CH01 combat feedback, causal radio and checkpoint integrity candidate

- **R-13 / R-21 / R-23 — partial code candidate:** CH01 now shows the player's own health/condition during combat and after injury, with a brief non-directional visual damage cue tied to the existing 60Hz finite damage timer. No hidden attacker location or perfect intelligence is revealed. Elimination dialogue is now explicitly the captain's observed radio report before the NIS liaison acknowledges it; missed shots cannot trigger a casualty claim.
- **R-02 / R-14 / R-23 — checkpoint guard candidate:** Untrusted CH01 saves with a hostile volley scheduled more than three seconds beyond saved elapsed time are rejected, preventing a forged future timer from disabling encounter pressure. Existing legitimate v1/v2 migration and finite-ammunition tests must remain green.
- **Validation boundary:** Automated source/VM and CI regression are required. Synthetic HUD effects and source text are not physical injury simulation, realistic recorded audio, human-browser QA, UE build, photoreal assets or QHD 165Hz hardware evidence.

## 2026-10-28 CH01 physical actor collision candidate

- **R-13 / R-23 — partial.** The CH01 first-person controller now treats living opponents as finite collision bodies; defeated actors no longer obstruct traversal. Enemy short-range motion also avoids other live bodies and the player. Existing overlapping checkpoints can move out rather than becoming trapped. Fixed-step, saved-pose and overlap-recovery tests are required; this is not a full character capsule, animation or Unreal physics verification.

## 2026-10-28 CH01 opponent perception / checkpoint candidate

- **R-21 / R-23 / R-28 — partial, not release-approved.** Visible CH01 opponents now turn at a bounded rate and can approach the player within a six-unit authored patrol area, without reacting through walls or to targets behind their view. The opponent position/facing is checkpointed with validation; older v2 saves retain compatible fixed starting positions. Deterministic 60Hz, cover, migration and malformed-pose tests are required. This remains a simplified browser behavior, not independently playtested human AI or Unreal combat.

## 2026-10-28 candidate: inactive-session safety and combat checkpoint durability

- **R-04 / R-13 / R-14 / R-23 — partial implementation, not release-approved.** BR browser controller now suspends its fixed-60Hz simulation on window blur or hidden document and requires an explicit user click to resume the same match without accumulated catch-up ticks; CH01 instead opens its existing pause menu and saves the active mission state. Both clear movement input and reset timing so unfocused players cannot be attacked by an active simulation.
- **R-02 / R-13 / R-14 — partial implementation.** CH01 now persists actual hostile-damage consequences immediately (at a hit event, not every frame), while continuing to persist the timed east-route transition and user-initiated pause. DOM/VM regression candidates cover background freeze, explicit resume, combat damage save, refresh and orphaned touch-pointer cleanup on both BR and CH01.
- **Validation limits:** source/DOM simulation tests and GitHub CI are distinct from human browser/device playtests. No real browser, GPU/RTX 3070, QHD 165Hz, UE compile/packaging, licensed PBR art or production online network result is claimed. Strict realism, all three full modes, 12 chapters and ~12h remain release-blocking open gates.

## 2026-10-28 CH01 shot-cadence checkpoint integrity candidate

- **R-02 / R-21 / R-23 — partial.** CH01 checkpoints now persist the last accepted shot time, so reloading a save cannot bypass the finite weapon's firing interval. Older v2 saves without this field conservatively wait one cadence interval during an active encounter. Validation rejects impossible future/negative shot timestamps; deterministic 60Hz replay, ammunition conservation, and legacy migration have automated regression cases.
- **R-13 / R-26 — partial.** CH01 now ages and removes transient shot/impact effects and damage feedback in its own 60Hz loop rather than retaining visual effects for the rest of the session. Fixed-step regression tests cover cleanup and unchanged ammunition; actual GPU/memory profiling is still missing.
- **R-28 — partial.** The opening subtitle and situation contract distinguish the captain's limited fictional authorization, local aid coordinator Yusuf's independent route-control decision, and NIS intelligence advice from field command. The existing evidence-dependent physical east gate remains the playable consequence. This is a small CH01 continuity increment, **not** proof of a believable 12-chapter story or independent narrative QA.
- **Verification boundary:** Node tests and GitHub CI must pass on the proposed commit; human browser, Unreal, QHD 165Hz and comparative narrative/realism playtests remain unverified.

## 2026-10-28 CH01 line-of-sight interactions and causal preview handoff candidate

- **R-13 / R-23 — partial:** CH01 E/touch interactions and proximity HUD prompts now require an unobstructed line between the player and a marker, so physical cover prevents through-wall terminal and finite-cache access. Node tests cover blocking, safe access after obstruction removal and resource conservation. Full browser/device playtest remains outstanding.
- **R-22 / R-28 — partial:** CH01 completion now records a structured, replay-safe preview-only debrief with the actual evidence count, chosen route, local aid authority's outcome and unresolved timestamp discrepancy. The debrief explicitly does **not** unlock the unbuilt M02 or confer online advantages. Tests cover both branches, save/restore and browser completion display; no 12-chapter causal continuity or independent narrative QA is claimed.

## 2026-10-28 BR physical loot access candidate

- **R-13 / R-23 — partial:** Offline BR ammunition pickup and the on-screen pickup prompt now share one unobstructed-reach check. Cover blocks E/touch pickup and does not consume finite loot; a visible cache may still be selected when a closer cache is occluded. Node regression tests cover inventory conservation and HUD parity. Actual human-browser testing, physically authored loot placement, UE rendering and multiplayer loot authority remain outstanding.

## 2026-10-28 local team input-freshness candidate (PR #52)

- **R-03 / R-12 — partial implementation, not online-ready:** the 60Hz server now expires stale movement and capture intent after 90 ticks (1.5 seconds), independent of heartbeat and state polling. The browser refreshes held commands, releases them on blur/hidden-tab, serializes state polling and prevents a rapid double-join from consuming both lobby slots. Server and DOM/HTTP regression tests exercise the candidate. This closes a ghost-movement/ghost-capture fairness gap, **not** the dedicated UE FPS, real internet matchmaking, packet-loss QA or human 2-client browser playtest gates.
- **R-23 — still release-blocked:** this bounded server-input lease is one realistic causal constraint in the team prototype; BR, CH01, complete weapon/medical/environment realism and physical-world comparative validation remain separate unfinished gates.
- **Verification boundary:** PR #52 must pass `npm run verify` and GitHub CI before merge. Real target RTX 3070/QHD 165Hz, 8GB RAM, Unreal compilation and production network stability are unmeasured.

## Completion rules
- **No obvious unrealistic mechanics in any mode is a hard release gate** (issue #15). The goal is physically and causally convincing simulation, not false claims of perfect real-world physics. Track incompatible prototypes as blocking work, not completed functionality.
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

**Latest binding campaign cast/gameplay specification:** [Combat Campaign Canon](COMBAT_CAMPAIGN_CANON.md). Earlier investigation-led and other-lead drafts are historical. CH01 now has a small tested fictional encounter, but **realistic weapon interaction, full chapter runtime and actual human-playtested realism are not achieved**; requirement R-21 remains partially implemented.

## 2026-10-27 finite magazine implementation candidate

BR and CH01 share finite 12-round magazines, a manual 1.8-second reload, a separate reserve count, desktop R and touch controls. Reloading does not increase carried ammunition and blocks firing. CH01 checkpoints persist partially completed reloads; older v2 saves load with no more than the saved total ammunition. The 60Hz simulation remains fixed-step. This is a browser abstraction, **not** verified native ballistics or animation. Online team play has no server-authoritative inventory yet; R-23 remains partially implemented pending browser playtesting and wider realism audit.

## 2026-10-27 18:00 KST development candidate — finite opponent ammunition

The offline BR bots previously fired indefinitely without ammunition or a reload delay. This candidate adds per-bot finite carried rounds, a 12-round magazine, a fixed 1.8-second reload, and shot effects even on misses. The simulation is seeded and uses the existing fixed 60Hz step. Dedicated tests cover ammunition exhaustion, reload delay, no spontaneous ammo generation, and deterministic replay. This is **only an offline browser simulation improvement**; no CH01 drone realism, weapon animation, server-authoritative online gameplay, real firearm modeling, or real-browser playthrough is proven by this change. All remaining issue #15 realism blockers stay open. CI and browser QA must pass before completion can be claimed.

2026-10-27 offline BR AI perception candidate: opponents now require unobstructed sight within a finite viewing cone and close aim alignment before firing, instead of tracking/shooting in any direction. Deterministic tests cover unseen rear approaches, gradual turning, finite ammunition and simulated win/loss/restart. This is a simplified gameplay abstraction, not human-equivalent hearing/awareness, live-browser testing, ballistics or multiplayer AI. R-23 remains partially implemented and issue #15 remains open until wider audits and playtests pass.

## 2026-10-27 offline rival combat candidate — verification scope

Offline BR rivals now acquire the nearest **visible** player or rival within a finite viewing cone and unobstructed sight line. Their attacks use the existing seeded accuracy, finite magazines and reload delay; rival eliminations affect the survivor count without inflating player kills. The update also prevents an opponent from firing after a lethal zone tick. New automated cases cover rival hits, wall occlusion, kill accounting, full simulated finish and deterministic 60Hz replay. This is an offline gameplay candidate pending CI and real-browser playtests; it does **not** validate human-level AI, ballistics, story CH01, a real dedicated server or UE-native performance. Remaining strict-realism blockers are still tracked in issue #15.

## 2026-10-27 local two-client authority candidate (not a shipping online mode)

- New `src/team-match.cjs`, `server/team-server.cjs`, `src/team-client.js`, `team.html` and two regression suites form a separate zero-dependency local HTTP team-objective testbed. Two independent HTTP clients can join, ready, move, contest, score, finish and re-ready; only the server advances positions/score at fixed 60Hz. This is **not** an integrated 3D FPS, public internet service, 6v6 match, Unreal dedicated server, or evidence of 165Hz/photorealism.
- Strict realism audit: no shields, supernatural resource generation, medical healing, enemy-position revelation beyond bounded local proximity or client-controlled score in the new team rules. Remaining BR tag/charge naming and zone physical justification, CH01 incomplete enemy AI/weapon/medical behavior remain **open release blockers** in issue #15; the new mode does not resolve them.
- Verification: `npm run verify` and GitHub Actions at the PR head must pass; Node HTTP integration is distinct from actual browser/touch and real network-loss playtesting. Run `npm run team:server` and open `http://127.0.0.1:8765/` in two tabs for a manual local check.

## 2026-10-27 CH01 grounded hostile-fire candidate

The CH01 browser encounter now uses three fictional **human opponents** in place of the former fantasy drones, finite hostile shots, a fixed facing cone, obstacle-checked line of sight, and non-graphic effects. Save v2 preserves a new per-opponent `shots` field while accepting older three-field opponent records and continuing to erase legacy shield values. Tests cover finite supply, occlusion, rear-facing safety, deterministic 60Hz simulation, checkpoint and keyboard/touch UI continuity. **Still partial:** fixed sentry positions, abstract hitscan, generic opponent presentation and unmeasured real-browser gameplay are not production-level realism. BR's abstract tag/charge and environmental boundary still need separate P0 work.


### 2026-10-27 reload-stress implementation candidate
Shared offline BR/CH01 logic adds deterministic sprint/injury stress and a single 0.6s reload hesitation above threshold 60. H/touch assist bypasses the hesitation on subsequent reloads; ammunition remains finite. CH01 v1/older v2 checkpoint migration and strict bounds are preserved. Node tests and CI passed on merge commit `fceca5f` (128/128); **actual browser/touch playtest pending**. This is a partial R-27/R-23 implementation only, not proof of realistic weapon handling, native UE or team server integration.

## 2026-10-27 local two-client fairness / lifecycle candidate (pending CI and real browser QA)

- **R-03/R-12/R-23 — partial, not complete:** server-owned low cover geometry now uses the BR simulation's existing collision and line-of-sight routines. The local team map renders the same cover and only transmits nearby opponents when not occluded. Movement and proximity remain 60Hz server-owned; this is a 2D network-rules prototype, not UE or a first-person firefight.
- Continuous capture now resets progress on contest, absence or button release, avoiding a stored partial-score exploit. Read-only polling no longer renews the connection lease; a sequenced heartbeat is sent by active browser clients. Deterministic and two-client HTTP tests exercise collision, cover visibility, interrupted scoring, stale timeouts and valid heartbeats.
- **Still unverified:** real two-tab browser play, public-network packet loss/latency/reconnection, accessibility, production security, realistic gunplay, native rendering, RTX 3070 QHD 165Hz and complete three-mode integration. These remain open release gates.

## 2026-10-28 local team rules and UI integration candidate

- **R-03/R-12/R-23 remain partial:** PR #29 introduced cover-aware movement/visibility, interrupted-capture reset and heartbeat-based 30-second leases; PR #30 added server-derived movement-facing visibility (120-degree forward cone and 14-unit range), explicit player-facing UI and rear/side/occlusion/spoofed-command regressions. These are 2D local prototype improvements, not first-person networked combat or native rendering.
- **UI regression candidate:** PR #31 runs the actual team browser script in a mocked DOM with a pure server adapter, covering two-client join/ready, movement/capture/blur, sequenced heartbeat, tab refresh and expired-token recovery. This is not equivalent to testing two real browsers, real input devices, network interruption or public-server security.
- **Still open:** issue #15 strict realism audit across all three modes, CH01/full campaign, real BR browser smoke, production multiplayer, licensed assets, UE native compile, and owner RTX 3070 QHD 165Hz/8GB system-RAM measurements. No release gate is declared complete.

## 2026-10-28 BR class-slice verification boundary

BR now offers a pre-match choice of three **fictional** handling profiles, each with a distinct finite ammunition budget, magazine, reload duration, fire cadence, aim tolerance, mobility and basic generated audio cue. BR loot now also carries a fixed class compatibility label and refuses incompatible pickups, with a proximity HUD warning. The default carbine retains the CH01 checkpoint schema and existing 12-round behavior. This is a playable browser-rule candidate with deterministic Node and controller tests, **not** realistic gun acoustics, animation, 7-class coverage, native UE content, actual browser/hardware QA, or authoritative multiplayer inventory. R-27 stays partial and issue #20 stays open. Real-world reference dimensions and licensed assets must be documented before production models are added.

## 2026-10-28 CH01 local-responder clearance candidate

- Verification now retains the east barrier for an authored eight-second local responder clearance interval, with pending/confirmed objective/HUD status; premature exit is rejected. A saved `gateReadyAt` timestamp preserves deterministic checkpoint progress and old v2 verification saves retain their previously open route. Tests cover timing, collision, save migration and malformed timestamps. The encounter failure menu no longer attributes the failure to supernatural signal interference.
- **R-02/R-22/R-23 remain partial; issue #15 open:** timer is a prototype abstraction without physical gate animation, measured responder travel, real-browser QA, independent narrative review, 12 completed chapters, UE build or QHD 165Hz measurement.

## 2026-10-28 local team HTTP DNS-rebinding protection candidate

- Local proof now rejects non-loopback bind hosts and HTTP requests whose Host is not an explicit loopback authority at the actual bound port, even if a forged Origin matches it. JSON media-type validation rejects lookalike prefixes. Two new HTTP regressions exercise forged Host/Origin, wrong port, allowed loopback and invalid media type.
- **R-03/R-12 remain partial:** this is defense-in-depth for a local two-client testbed, not public multiplayer security certification, real-browser or network-loss testing, or a production authentication/transport solution.

## 2026-10-28 CH01 checkpoint durability after route consequences

- Story browser pause now saves all active phases, not only combat. The 60Hz browser clock persists a completed local-responder gate-clearance transition exactly once when it occurs, preventing a refresh from silently replaying the wait. New DOM/browser-controller regressions exercise pause after combat, elapsed-time persistence, timed gate completion and reloading into the already-open route.
- **R-02/R-14/R-22 remain partial:** mocked DOM and Node tests do not replace human browser QA, device testing, a fully playable 12-chapter campaign, UE build or native performance measurements.

## 2026-10-28 CH01 causal route / actor occlusion candidate

- **R-21 / R-23 (partial):** CH01 hostile visibility and finite firing checks now include other standing opponents as physical sight/shot blockers, not only map obstacles. A deterministic fixed-step regression covers a blocked rear actor and the restored line of fire after the front actor is disabled. This is simplified AABB occlusion, not native character physics or verified human tactics.
- **R-28 (partial):** CH01's existing physically gated east route now surfaces distinct, locally controlled civilian consequences in the playable HUD; checkpoint restoration recomputes these from the saved choice and elapsed clearance. A forged verified-complete checkpoint with an unexpired authored gate timer is rejected. The five-minute record discrepancy remains unproven, not magically resolved. Tests and CI are required; independent narrative plausibility review and all later chapters remain outstanding.

## 2026-10-28 CH01 finite physical cache candidate

- **R-14 / R-21 / R-23 / R-27 (partial):** A marked, once-only local-rescue ammunition cache can be collected with the existing E/touch interaction during CH01 combat. It transfers at most twelve finite carried rounds, respects the existing capacity, never automatically respawns, and cannot be collected twice after a checkpoint restore. Legacy v2 saves without the new consumption flag migrate with the cache unused; invalid flags are rejected. Two regressions cover exhaustion recovery, capacity, HUD, 60Hz reload and save continuity. No real weapon handling or physical 3D asset provenance is claimed; CI and actual browser QA are required before release.

## 2026-10-28 BR living-actor collision candidate

- **R-04 / R-13 / R-23 (partial):** The offline BR 60Hz controller and AI now treat other living actors as finite collision bodies; defeated actors cease blocking. Pre-existing overlaps are exempted only for movement to prevent trapping; line-of-fire occlusion also checks intervening live actors, excluding the intended target. Fixed-step regressions cover player/bot passage, bot/bot collision, reproducibility and overlap escape. This remains an approximate 2D collision proxy, not UE physics, measured performance or human playtesting. Actual CI validation required.

## 2026-10-28 CH01 finite-cache UX correction

- **R-13 / R-14 (partial):** Empty-fire prompts and the active objective now distinguish an unclaimed finite rescue cache from genuinely exhausted resources. Previously the new cache could still exist while the HUD incorrectly instructed the player to restart; after consumption it could still advertise an unavailable pickup. The record/evidence count remains in its own panel rather than duplicating it in the route-status line. A save/restore regression covers both branches; real browser readability remains unverified.

## 2026-10-28 10:00 KST — team physical presence and abandoned-lobby recovery candidate

- **R-03 / R-12 / R-23 — partial implementation, not production approval:** the localhost 2-client authoritative team rules now treat standing opponents as server-owned collision bodies, preventing player-through-player traversal in fixed 60Hz movement while permitting pre-existing overlapping states to separate. The client cannot submit custom collision parameters. This is a simple AABB/circle proxy, not UE character physics, animation or live-network lag compensation.
- **R-03 / R-12 / R-14 — partial implementation:** expired, abandoned local lobby and finished-round tokens are reclaimed after the existing 30-second heartbeat lease, including on the next join request; an active round is never silently replaced. The existing timeout result for active matches remains intact. Two-client HTTP integration and deterministic unit regressions cover rejoining and replay; public internet service, real-browser testing and long-running load remain unverified.
- **R-02 / R-21 / R-22 / R-24 / R-27 / R-28:** no new full-story chapter, PBR asset, native UE build, complete firearm family or independent narrative playtest is claimed by this work. **R-08 / R-25 / R-26:** RTX 3070 / QHD 165Hz / owner-reported 8GB system RAM remain unbenchmarked. The 2026-11-27 offline demo gate and 2027-04-27 aspirational final release gate remain open.

## 2026-10-28 CH01/BR recoverable reload interaction candidate

- **R-13/R-23/R-27 (partial):** When a fictional firearm reload is delayed by deterministic stress, pressing R/the existing touch reload control again after at least 0.25 seconds performs one bounded correction. It removes at most the authored 0.6-second hesitation while retaining a minimum 0.25-second remaining animation interval; it cannot repeatedly shorten reloads, instantly refill rounds, or duplicate ammunition. Both CH01 and BR HUDs explain the same recovery control; accessibility reload assist still prevents the hesitation.
- Unit tests exercise early double-input rejection, single-use correction, conserved ammunition, 60Hz deterministic CH01 replay and checkpoint continuity. Real animation, real-browser/touch usability, independently evaluated human realism, native UE, online server authority and owner RTX 3070 QHD 165Hz remain **unverified**; release gates stay open.

## 2026-10-28 injury-limited movement candidate

- **R-13/R-21/R-23 (partial):** The shared 60Hz browser movement code now applies a bounded continuous mobility reduction as player health declines (100% at full health, 78% at zero health). Both offline BR and CH01 expose the resulting percentage in the combat HUD. This is an authored *gameplay approximation*, not a measured clinical or biomechanical model; no healing, teleportation or extra resources are added. The existing class-specific mobility remains multiplicative. Deterministic movement, no-spontaneous-healing and CH01 checkpoint regression tests are included.
- The 2D team multiplayer rules are **not** covered by this change. Injury animations, real movement capture, accessibility playtests, production asset licensing, UE native physics, actual RTX 3070 QHD 165Hz profiling and independent realism review remain **unverified**. No release gate is closed.

## 2026-10-28 blocked-sprint fatigue correction candidate (PR #59)

- **R-13/R-21/R-23/R-27 — partial:** Both BR and CH01 60Hz controllers now base sprint stamina drain and exertion stress on resolved post-collision travel rather than a held sprint input. A fully blocked sprint no longer creates stress-related reload penalties; sliding along cover or moving freely still costs stamina. Four new deterministic regressions cover blocked and partial collisions in both modes. This is a bounded game abstraction, not a biomechanical claim.
- **Acceptance remains open:** PR CI must pass before merging; real-browser/touch controls, actual human realism and narrative reviews, production Unreal physics/graphics, RTX 3070 QHD 165Hz profiling, and three-mode end-to-end QA are unverified. R-28 narrative causality and independent 12-chapter continuity/playtesting remain mandatory.

## 2026-10-28 16:00 KST — CH01 finite hostile shot accuracy candidate

- **R-13 / R-21 / R-23 (partial):** CH01 human opponents no longer deal guaranteed damage on every visible volley. Shots still require existing sight, facing, range and finite carried rounds; the actual travel distance of the player and opponent range modify a bounded chance to miss. A shot-specific seed derived from the existing mission seed, opponent ID and saved shot count avoids rerolling a miss after checkpoint restore. Misses still expend ammunition and produce the same muzzle feedback, without revealing unseen enemy coordinates.
- **Verification boundary:** Added 60Hz deterministic replay, ranged miss, movement-versus-blocked-input and finite-round regression candidates. Node and GitHub CI results must be checked before merge. This is a deliberately simplified fictional browser aiming model, not verified human marksmanship, realistic projectile ballistics, real-browser gameplay, Unreal, independent realism assessment or RTX 3070 QHD 165Hz profiling.

## 2026-10-28 16:00 KST — injury mobility parity candidate across browser modes

- **R-03 / R-13 / R-21 / R-23 (partial):** Previously only the BR and CH01 **player** slowed when injured. This candidate applies the same bounded, non-healing movement multiplier to BR rival AI and the authoritative local team server's players, while CH01 human opponents scale the multiplier to their authored 90-point health maximum. Clients still cannot submit movement speed or health, and the 60Hz simulation owns the result.
- **Evidence boundary:** New deterministic tests compare healthy/injured BR opponents, CH01 opponents with save/replay and a server-validated team hit followed by movement. This does **not** establish medical realism, human animation, native UE physics, production multiplayer, RTX 3070/QHD/165Hz performance, or independent playtesting. Existing three-mode final gates remain open.

## 2026-10-28 16:00 KST — team network hit-confirmation privacy candidate

- **R-03 / R-12 / R-23 (partial):** The local team server still validates finite shots, cover, facing, range and damage, but successful fire command responses now reveal only acceptance and remaining ammunition. The browser no longer presents the server's internal hit result as a magical certainty; players must infer outcomes from visible in-world events. Server-side test diagnostics remain private to the authoritative process.
- **Verification boundary:** HTTP tests compare successful hit and miss response shapes, damage and ammunition conservation; DOM-mock tests check the actual feedback string and masked adapter. No public internet deployment, real-browser user evaluation, spatial audio, real-world projectile simulation, native UE or hardware benchmark is claimed.


## 2026-10-28 — team pointer aim lease hardening (P0 candidate)

- **R-03/R-12/R-23 (partial):** The local 60Hz authoritative match expires an abandoned pointer-aim override after 90 simulation ticks even when a heartbeat continues. A live browser client renews a held stationary pointer direction at a bounded 20-tick cadence; pointerleave, background suspension and tab resume still release aim. When aim expires, active movement regains facing control without teleportation, client-supplied target/damage or hidden information. This addresses stale aim after lost pointer events without weakening valid stationary aiming.
- **Evidence boundary:** deterministic rule tests and mock-browser input tests accompany the candidate. GitHub CI and actual two-browser manual play must be checked separately. This remains a localhost 2D server-authoritative prototype, not production online multiplayer or verified native UE, human realism, RTX 3070 QHD 165Hz performance or complete release readiness.


## 2026-10-28 — BR / CH01 standing-body footprint consistency (P0 candidate)

- **R-04/R-13/R-21/R-23 (partial):** The offline BR and CH01 fixed-step controllers now use standing-actor collision proxies sized to the corresponding authored actor radii (BR 0.85m; CH01 human opponent 0.75m, player 0.85m). Previously undersized proxies could let living actors visually overlap. Existing deterministic 60Hz, legacy-overlap escape and player/AI contact regressions now require separation consistent with those radius sums.
- **Evidence boundary:** AABB bodies remain a coarse 2D gameplay approximation; no animated character mesh, physically measured movement, real-browser capture, Unreal physics, production multiplayer or independent realism review is established. CI must pass at the exact branch/merge SHA before considering this candidate validated. Issue #15 remains a release blocker.

## 2026-10-28 shared crouch / sprint exhaustion P0 candidate

- **R-13 / R-21 / R-23 / R-27 — partial implementation, not real-world validated:** BR and CH01 now use the same 60Hz sprint eligibility rule. Crouching while holding sprint no longer spends sprint stamina or grants sprint speed; a player who exhausts stamina cannot alternate single-frame sprints and walks indefinitely. Sprint resumes after recovering 25/100 stamina. This is a deterministic game-feel approximation, not physiological measurement.
- **R-02 / R-14 — checkpoint compatibility:** CH01 persists sprint-exhaustion lockout; older v2 saves are accepted, and saves with depleted stamina migrate to locked-out movement. Boolean fatigue state is validated to reject malformed saves. Regression tests cover crouch, finite recovery, replay determinism, and save/restore. GitHub CI and human browser testing are separate gates; no UE or RTX 3070/QHD/165Hz measurement is implied.

## 2026-10-28 CH01 last-observed opponent search candidate (PR #72)

- **R-21 / R-23 — partial browser gameplay:** CH01 opponents now investigate only the player's last *directly visible* location for at most three simulated seconds after losing line of sight. Search turning and movement remain bounded to the authored patrol area; firing still requires current sight, facing, finite ammunition and physical cover. This replaces implausible immediate inactivity without granting omniscient tracking. It is a simplified AI behavior, not real tactical simulation.
- **R-02 / R-14 / R-28 — checkpoint/causality QA candidate:** Saved opponent observation coordinates and expiry time are validated, replayed at fixed 60Hz and migrated from older v2 saves without inventing past observations. Tests cover blocked vision, memory expiry, replay, malformed checkpoint rejection and legacy formats. The current CH01 mission and narrative remain a short preview; twelve playable chapters, credible full deployment arc and independent narrative plausibility assessment remain **unimplemented/unverified**.
- **Evidence boundary:** GitHub PR #72 CI and actual browser/device playthrough are separate gates. UE native compilation, production server multiplayer, original licensed PBR assets, owner RTX 3070 QHD 165Hz performance and independent realism evaluation remain **unverified**. Issues #15, #6, #9 and the 2026-11-27 demo acceptance gate remain open.

## 2026-10-28 BR bounded observed-position search candidate (PR #73)

- **R-04 / R-23 — partial offline gameplay:** BR rival AI retains an observed target's last visible position for 2.5 simulated seconds and can investigate that point without querying a concealed target's live coordinates. The original 60Hz rules still require current visibility and facing before any finite-ammunition shot. CH01 has a separately tested three-second memory; the 2D localhost team mode has **not** gained opponent-search AI.
- **R-14 / R-26 — candidate regression:** Automated deterministic replay, newly introduced solid-cover occlusion and ammunition-conservation tests accompany the source change. GitHub CI, human browser playthrough, CPU/GPU profiling and memory usage are distinct verification gates. This is an abstract browser bot, **not** realistic full-body human behavior, verified UE AI or a production BR server.
- **Remaining blockers:** strict realism audit (#15), three full modes, ~12h authored playable campaign, narrative independent review, original licensed PBR assets, native UE and RTX 3070/QHD/165Hz measurements, and 2026-11-27 demo sign-off remain open.


## 2026-10-28 21:00 KST — seven-class browser firearm expansion (P0 candidate)
- **R-13 / R-21 / R-23 / R-27 / issue #20 — PARTIAL:** The shared browser firearm catalogue expands from three to seven **original fictional** handling classes (carbine, compact, marksman, shotgun, support, sidearm, precision). Existing finite magazine/reserve, class-specific cadence, reload timing, movement weight, aim tolerance, shot feedback and stress-reload correction now apply to the four added classes. Each class also has an explicit **gameplay engagement range**, preventing the shotgun class from affecting distant opponents through the common 85-unit ray. Both BR and CH01 launch menus expose all seven; BR finite loot cycles across all compatible classes, and CH01 checkpoint serialization remains class-aware.
- **Regression scope:** Class-specific damage/range, missed-shot ammunition conservation, 60Hz seeded replay, compatible pickup depletion, menu options and CH01 save/restore are covered in `tests/firearm-classes.test.cjs`. GitHub CI and human browser launch remain separate gates; do not infer hardware, acoustic realism, animation quality or weapon-specific physical authenticity from passing Node tests.
- **Remaining release blockers:** Real/licensed model/audio provenance, believable reload animations and measured handling, independent realism/narrative playtests, server-authoritative per-class competitive inventory, 12 playable chapters/12h, native UE packaging, RTX 3070 QHD 165Hz benchmark and 2026-11-27 end-to-end demo sign-off are **NOT COMPLETE**. No real-world firearm-use instructions or endorsement are implied.


## 2026-10-28 21:00 KST — mixed-class BR ammunition selection P0 candidate
- **R-13 / R-23 / R-27 (PARTIAL):** In a reachable mixed ammunition pile, the shared BR pickup selector now prefers the nearest **compatible** finite cache over incompatible caches, while retaining an incompatible warning when no compatible cache is reachable. Both E/touch action and the HUD use the same selection, preventing a nearby incompatible item from indefinitely blocking an accessible class-specific supply. Cover/distance, single-use depletion and maximum carried-round constraints remain in force. Deterministic unit and simulated browser controller tests cover mixed piles and desktop/touch parity.
- **Not verified:** actual mobile/browser hardware playthrough, realism of physical ammunition assets, complete UE/online inventory, RTX 3070 QHD/165Hz performance and final demo release gates. No new ammunition is generated; issue #15 and issue #20 remain open.

## 2026-10-28 bounded audible-footstep candidate and honest campaign completion

- **R-23 / R-13 (partial code candidate):** Shared 60Hz BR/CH01 AI can investigate a runner's last audible position only when actual sprint movement occurs. Solid cover reduces the authored hearing radius; quiet/blocked movement and distant occluded players do not continuously reveal positions. Hearing alone never authorizes a shot. Deterministic BR/CH01 tests and CH01 checkpoint replay cover this behavior. These are simplified game acoustics, not measured human hearing, sound propagation or human-level AI; real-browser/UE QA remains outstanding.
- **R-02 / R-21 / R-28 (honesty gate):** Campaign metadata can record all twelve *planned* chapter choices without asserting that any chapter is a verified playable mission. `metadataSequenceComplete` describes only that planning sequence; `fullyCompleted` remains false and `playableMissionsVerified` remains zero until actual implementation/verification. CH01 is still a short browser preview, not M01's full 50-minute mission. Independent narrative plausibility review remains outstanding.

## 2026-10-28 finite gunfire acoustics candidate

- **R-13 / R-23 (partial browser-code candidate):** A fired finite round, including a miss, can now trigger a bounded, cover-attenuated acoustic investigation in BR and CH01. AI receives a coarse 2 m estimated source position, not a magical exact target or permission to shoot through cover. The sound event consumes no extra ammunition, creates no damage, persists in CH01's existing checkpoint search memory, and has deterministic regression coverage. It is not measured physical acoustics, real human hearing, sound rendering or native Unreal AI. Browser playtest and 165Hz hardware performance remain unverified.

## 2026-10-28 canonical narrative regression gate

- **R-19 / R-20 / R-28 (QA candidate):** Current-facing campaign, immersion and demo documents now consistently describe Captain 이수혁, male NIS liaison 김지윤, female NIS analyst 조현지 and the actual finite-ammo human-opponent CH01 browser encounter. Retired 'Yoon' references and obsolete current drone-encounter claims are corrected. An automated test guards these active documents against character-name drift and falsely describing historical arcade mechanics as present gameplay. This is editorial/code QA, **not** a human assessment of political plausibility, a fully authored 12-chapter timeline or a verified playable 12-hour campaign.

## 2026-10-28 — walking/crouch hearing and imprecise sound memory (P0 candidate)

- **R-04/R-13/R-21/R-23 — partial:** BR and CH01 opponents now hear nearby walking, with reduced crouch range and cover attenuation. Sound-only awareness uses an existing 2m-rounded last-heard position instead of perfect hidden coordinates; visible observations still locate actors directly. Fixed 60Hz updates and existing CH01 checkpoint schema are preserved.
- **Verification:** walking/stealth/cover, replay and save tests require passing CI at the PR head. Hearing radii are uncalibrated gameplay abstractions. Real browser/audio, Unreal, full 3-mode realism, human narrative review and RTX 3070 QHD 165Hz measurements remain unverified.

## 2026-10-28 BR rival-shot sound and invalid-frame guard candidate (PR #80)

- **R-23 / R-04 — partially implemented, browser-only:** A finite round fired by a rival bot now alerts nearby living rival listeners using the same 38m unobstructed / 18m cover-attenuated acoustic rule as player gunfire. The listener records only a rounded source cell for 2.5s, not live enemy coordinates, and cannot damage a target without the ordinary visible, aligned and unobstructed shot. Empty weapons are silent. No measured real-world acoustics or human playtest is claimed.
- **R-10 / R-17 — deterministic-simulation hardening:** `Sim.tick` rejects zero, negative, NaN and infinite elapsed deltas before moving actors, consuming ammunition or advancing the random stream. Normal 60Hz steps remain unchanged. Added regression tests for finite sound, cover, silence, no through-cover damage, reproducible seeded replay and malformed frames.
- **Verification gate:** Source/test changes are candidate until the PR head passes `npm run check`, `npm test`, demo ZIP verification and PR CI. Real browser launch, multiplayer authority, Unreal packaging, photorealism and RTX 3070 QHD 165Hz remain unverified. Issue #15 is still a P0 release blocker.

## 2026-10-29 CH01 audio and fixed-step candidate

- **R-13 / R-22 — partial candidate:** CH01 browser integrates six original, lightweight synthesized action/feedback cues (shot, reload, interaction, report, impact and completion), with a persistent explicit mute option, accessibility-preserving subtitles and lazy Web Audio initialization. This is **not** recorded/spatial/production-quality audio and has not been listened to or measured on actual user hardware.
- **R-23 — partial candidate:** CH01 rejects nonpositive/non-finite time steps before hostile-volley or checkpoint-gate state can mutate, preserving the existing 60Hz gameplay contract. Regression and GitHub Actions are required before considering this validated.


## 2026-10-29 CH01 finite-cache conservation candidate (PR #82)

- **R-23 / R-27 — partial implementation, pending CI and browser playtest:** CH01's marked aid cache has exactly 12 finite rounds. A player with limited carrying capacity takes only the rounds that fit; the remaining rounds stay in the same physical cache for later collection. Empty caches disappear from the objective marker. No automatic ammunition replenishment or inventory overflow.
- The existing v2 checkpoint retains the remaining round count; older checkpoints with only the boolean `supplyUsed` migrate to 0 or 12 remaining rounds. Invalid, fractional, out-of-range or contradictory saved balances are rejected. Deterministic round-trip tests and existing BR/story regression are required before merge.
- **Not achieved:** licensed production firearm assets, physical magazine animation, native UE play, 165Hz hardware measurements, complete campaign or all-mode firearm parity. This improvement does not close realism issue #15 or firearm issue #20.


## 2026-10-29 BR finite-loot conservation candidate

- **R-04 / R-23 / R-27 — partial, CI and real-browser validation required:** BR ammo and magazine caches now track 12/24 finite rounds respectively. Picking up fewer rounds than a cache holds leaves the rest at the same location, available only while reachable and compatible with the selected fictional firearm. The existing E/touch prompt displays remaining stock. Tests cover capacity, repeat visits, cover, incompatible ammunition and deterministic 60Hz replay.
- The BR offline match has no durable inventory checkpoint in this increment; this change is **not** proof of online/server authority, complete firearm realism, physical magazine animation, 165FPS, or a fully released battle royale. CH01 and BR remain independently tested; multiplayer parity is still pending.

## 2026-10-29 BR pause/input fairness P0 candidate (PR #85)

- **R-04 / R-10 / R-23 — partial browser-controller improvement:** A paused BR match retains `status='playing'` for explicit resume, but keyboard, pointer and touch fire, reload, finite supply pickup, assist toggle, aim and movement now require an active unpaused match. Opening graphics settings during live play pauses the world instead of letting AI continue to attack while the player adjusts settings. Closing the settings panel does not silently resume; the existing Continue action is required. No world state, ammunition or time is advanced by paused input.
- **Evidence boundary:** Automated desktop/touch DOM-controller regressions and fixed 60Hz checks are in PR #85. CI success at the final head, real browser/device QA, full BR match acceptance, Unreal, public authoritative multiplayer and RTX 3070 QHD 165Hz measurements remain separate gates. This is not completion of the realism release blocker #15.

## 2026-10-29 team-authoritative stress reload candidate

- **R-23 / R-27 (partial, local two-client prototype):** TeamMatch now derives a bounded stress state from actual server-validated injury, decays it at fixed 60Hz, and applies a recoverable 36-tick reload hesitation above a defined threshold. A second deliberate reload input after 15 ticks removes only the hesitation, never accelerates below the ordinary 90-tick baseline or duplicates ammunition. Validated per-player reload-assist accessibility preferences persist across rounds; only self stress is disclosed in snapshots. Browser UI shows stress, hesitation and assist controls. Unit/HTTP tests cover server authority, deterministic replay, recovery, inventory conservation, spoof rejection and round reset. **This is a candidate pending PR CI, real two-browser playtest and latency QA**, not full multiplayer production netcode, seven online firearm classes, native UE animation, medical realism or a measured stress model. Issue #20 and realism blocker #15 remain open.

## 2026-10-29 BR grounded shot-feedback candidate

- **R-04 / R-23 (partial browser visual realism):** BR missed rounds no longer spawn floating blue impact cubes. Confirmed hits create a brief, muted ground-contact debris cue and rival gunfire uses a smaller, warm muzzle cue rather than large red energy cubes. Existing finite ammunition, deterministic 60Hz decay, view culling and vertex-count accounting are covered by new simulation/WebGL-mock regressions. This is a stylized procedural approximation, **not** physically measured ballistic effects, production VFX or proof of photorealism. The abstract shrinking damage boundary and remaining in-world visual/causal realism audit stay P0 release blockers in issue #15; real-browser visual review, GPU/165Hz profiling and Unreal tests remain unverified.
