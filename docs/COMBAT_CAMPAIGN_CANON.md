# VEILPOINT — Canon update: Korean special-forces captain, NIS cast, combat-first campaign

**Approved by owner:** 2026-10-27. **Priority:** binding narrative/design direction for future campaign work. **Implementation status:** specification, not 12 playable hours or a military combat system.

## Binding story inciting incident — 2026-11-08 owner clarification

**Confirmed cause-and-effect premise:** Captain **이수혁** is first dispatched to the fictional Sahir Coast/Nahrin region on a separate, authorized and limited international protection/observation assignment. **He is not deployed there with the original intention of fighting a civil war.** Only **after he arrives and begins that original mission** does a rapidly escalating internal conflict derail the assignment and entangle him and his squad in the civil war. This change of circumstances is the inciting incident of the **entire campaign**, not merely optional lore.

For production continuity, require every new chapter and introductory scene to preserve:
- **Before (in Korea, not Aden):** the captain receives his formal order, a narrow authorized assignment, and expected return arrangements **in Korea before departure**. The officer and his squad know their mission before boarding transport. Introduce that fact through a short pre-departure briefing in later production or through natural team dialogue in the current CH01 slice; **do not invent a dispatch order lying in an Aden street for the captain to discover and read by pressing E**. Exact commanding agency, unit identities and sensitive operational detail remain fictional and unspecified unless written consistently into canon later.
- **During:** visible changes to the civilian city, fractured local information, conflicting requests and disrupted expected support/return arrangements; these developments must occur *after* the captain's dispatch and must cause changes in his objectives rather than appearing as arbitrary action scenes.
- **After:** the captain and his team are caught in the expanding internal conflict and must make credible decisions about colleagues, civilian protection, mission legitimacy and exit, while original civilian partners retain independent agency. Neither government nor military is falsely said to have dispatched the captain specifically to prosecute the civil war.
- **Chronology and agency:** later chapters should refer back to the initial limited assignment, mark the escalation through grounded observable events, and never quietly rewrite the original deployment purpose. Fictional conflict is not a documentary depiction of Yemen's actual combatants or any real country's deployment.
- **Current status:** only the short browser CH01 slice exists; 12 chapters / 12 playable hours and fully cinematic escalation are **not** already implemented.

This explicit owner's storyline takes precedence over earlier ambiguous descriptions such as “in a regional war” that could imply the captain went to war intentionally.

## Story realism and pacing correction — 2026-11-08

The owner explicitly rejected the implausible on-site "original deployment orders" pickup and lengthy repetitive evidence-checklist loops. **Chronology, character motivation and credible human decisions are more important than accumulating tiny investigation actions.**

- The first briefing took place **before departure in Korea**. CH01 should begin after arrival and use brief organic squad radio dialogue to recall only details that matter to current decisions.
- The first serious disruption is the **unexpected escalation of internal conflict after arrival**, the resulting breakdown of the original schedule and uncertain return conditions. The captain does not begin his operation as a civil-war combatant.
- Do not require players to search a fictional coastal street for the paperwork they already received in Korea. The on-site dispatch-case object, associated pickup and its factual-debrief claim are retired in CH01. Old checkpoint keys are accepted only for backward compatibility.
- Priority playable verbs: character-led decisions, grounded traversal, urgent civilian assistance and consequential encounters. Keep genuinely useful optional field checks; do not inflate campaign runtime with repeated paper record comparisons, journal filing or long fetch-and-return trips.
- The public communications mysteries are **background context or a short optional route**, not the central dramatic engine of the entire story. Avoid always-visible distant markers for trivial errands; later chapters should escalate through authored events, team cohesion and regional change.
- **Implemented cleanup:** the second public-arcade water tap remains a solid, explorable environmental detail shared with BR, but the far-away `waterSite` inspection and `waterReportDesk` paperwork-return objectives are retired from new CH01 gameplay. Archived `waterSurveyed`/`waterReportFiled` v2 checkpoints retain readback compatibility. Do not recreate them as mandatory side chores.
- Preserve the fictional setting, local civilian agency, existing route outcomes, and save-file compatibility. Future plot/script reviews must explicitly check when and why each character learned a fact, whether they could be at a location in time, and what caused their next decision.



## Canon continuity decision

- **Geographic reference updated 2026-11-07:** The primary **real-world landscape, neighborhood and architectural reference is Aden, southern Yemen, in the 2015-era conflict context**; see [Aden world reference](WORLD_REFERENCE_ADEN.md). Keep **Sahir Coast / Nahrin** as the fictional *narrative* district and keep all named characters and incidents original. Reconstruct natural geography and civilian built environment from dated, licensed sources; do not copy current sensitive facilities, tactical sites or attribute fictional events to real groups. This supersedes the earlier generic-geography/no-specific-historical-reference sentence, **not** the fictional character or combat-first canon. Present browser and native maps remain grayboxes rather than verified historical replicas.
- **Playable protagonist across all twelve chapters:** **이수혁 (Lee Su-hyeok), 대한민국 특수부대 대위** — an entirely fictional Republic of Korea military officer. The narrative uses an original fictional international protection/observation mission as context; it does **not** claim that a real ROK unit or the Korean government undertook such an operation.
- Protagonist never abruptly switches to a secondary playable lead; viewpoint changes are optional short cinematics or radio/dialogue interludes only. The captain's first-person perspective anchors the campaign.
- **국가정보원(국정원) 소속 가상 요원** enter the cast as consequential fictional characters. Their conduct, technology, internal process and authorisation are invented for the story and must never be framed as a description of real intelligence methods or confidential practices.
- Existing CH01 browser prototype is a **short traversal/record-interaction slice with a short non-graphic three-human-opponent encounter with finite ammunition and bounded sight/sound awareness** (three targets, aim/fire, one-use ally support and failure/retry). It is **not** a completed combat-first 50-minute mission; full encounter variety, believable companions, character model/voice direction and real playtesting remain to be implemented. Previously authored Mara dialogue is now interpreted as an ally guiding the captain, not the player character.
- Mara Dahan, Yusuf Rahal, Samir Qadir and Nadia Faris remain original **local** supporting characters. Do not erase local agency or reduce civilians to background scenery.

## Principal cast (all fictional)

| Role | Character | Narrative function and internal conflict |
|---|---|---|
| **Player / Captain** | **이수혁 대위 (Lee Su-hyeok)** | ROK special-forces captain in a fictional multinational mission; responsible for squad and human consequences, personally decisive, not infallible |
| **NIS liaison (male)** | **김지윤 국정원 요원 (Kim Ji-yun, 남성)** | South Korean intelligence liaison who provides incomplete, often contested intelligence; trustworthy through actions rather than magical exposition |
| **NIS analyst (female)** | **조현지 국정원 요원 (Jo Hyeon-ji, 여성)** | Tracks inconsistencies in civic transmissions and local accounts; challenges assumptions and reveals costs of incomplete records |
| Squad sergeant | **김도겸 중사 (Kim Do-gyeom)** | Fictional ROK military squadmate who advocates caution and accountability, with an independent arc |
| Local systems partner | **마라 다한 (Mara Dahan)** | Municipal communications engineer; introduces the VEILPOINT civilian network and provides environmental context in CH01 |
| Local aid coordinator | **유수프 라할 (Yusuf Rahal)** | Emergency service coordinator, local decision-maker and essential ally with priorities of his own |
| Former investigator | **사미르 카디르 (Samir Qadir)** | Doubts official versions of events and exposes conflicting timelines |
| Independent journalist | **나디아 파리스 (Nadia Faris)** | Gives a public voice to evidence, not a universal truth oracle |

No real names, real unit insignia, genuine current operational procedures or exact emblems are required. All dialogue, ranks and fictional affiliations should be reviewed for accuracy and cultural sensitivity before release.

## Core creative direction: COMBAT-FIRST, NOT COMBAT-ONLY

**Target authored first-play length:** 12 chapters, **720 minutes (~12 h)**. These are planning allocations; actual playtime must be verified with testers.

**Latest owner-approved experiential allocation (2026-11-09; planning, NOT implemented playtime):**

| Exclusive primary activity | Target share | Budget at 12 hours |
|---|---:|---:|
| Fictional action/combat encounters | **50%** | 360 min |
| Urgent physical movement, evacuation and rescue | **20%** | 144 min |
| Character relationships, causal story scenes and dialogue-led drama | **22%** | 158 min 24 sec |
| Short optional exploration and contextual interactions | **8%** | 57 min 36 sec |

The 22% character/story budget is a creative emphasis, **not 22% forced dialogue menus or player-choice screens**. Character moments should frequently unfold while the captain remains in control; do not double-count simultaneous dialogue and movement when measuring actual time. The original Korean briefing and return arrangements precede the fictional Aden-inspired arrival. Escalation follows arrival, never serving as the original deployment purpose. Choices may change later consequences without becoming the core playable verb.

**Historical framing:** Prefer a **fictional 2015-era** Sahir/Nahrin crisis inspired by Aden's intense March–July 2015 conflict, with earlier Yemeni historical context embedded in credible character memories. The player does not reproduce a real Korean deployment or exact battles, uniforms, troop sites or operational maps. This is a creative reference, not a literal reenactment. **Continuity gate:** 2019/2022 events must not be described as *already happened* inside scenes set in 2015; any legacy CH01 references require a chronology pass before claiming 2015 setting is playable.

These are campaign-wide authored targets, not enforced per-chapter quotas. Actual shares require mutually exclusive first-play time samples from completed chapters; a short offline CH01 prototype cannot prove this budget. Use atmospheric contrast, preserve non-graphic treatment and readable subtitles.

### Combat-facing gameplay goals (game design only, not real-world combat guidance)
1. Strong fictional FPS feedback: responsive movement/camera, readable hit feedback, believable fictional weapons, distinct encounter objectives and consistent enemy reactions.
2. Varied **game scenarios**, such as protecting a moving objective, contesting a map location, timed escape, holding a damaged relay, dynamic weather interruptions, defending an ally and combined story/environment choices.
3. Companion characters drive the plot through voice lines, contextual assistance and personal decisions; the captain remains the active protagonist.
4. **The Signal** is an optional accelerator of combat choices, not an obligatory lengthy puzzle: new information changes objective priorities, accessible paths and the credibility of quest markers.
5. When local civilians are present, they are people with agency rather than indiscriminate targets. No faction defined as evil by race, nationality or religion.
6. Progression and combat are not allowed to soft-lock the campaign. Difficulty/accessibility options preserve a fully completable main critical path.

## Twelve-mission treatment — same authored runtime, new action focus

| ID | Working chapter (target min) | Combat-forward playable set-piece | Character/story pivot |
|---|---|---|---|
| M01 | 마지막 방송 / The Last Broadcast (50) | sudden first-person urban engagement, squad regrouping and restoring a damaged relay | Captain meets Mara, NIS liaison Kim Ji-yun introduces incomplete, sourced accounts |
| M02 | 두 개의 지도 / Two Maps (55) | mobile protection and contested road segments | Jo's report disagrees with apparent route safety |
| M03 | 소금바람 / Salt Wind (60) | fast-paced desert settlement encounter and team support | local aid leader Yusuf shifts the mission priority |
| M04 | 유리 회랑 / Glass Corridor (55) | vertical city building engagement with changing access | delayed message alters an objective halfway through |
| M05 | 갈라진 항구 / Split Harbor (65) | large dynamic harbor combat sequence | player-selected route changes later accessible district |
| M06 | 마지막 중계 / The Last Relay (60) | mountainous relay fight and escalating environmental events | Kim Ji-yun challenges a seemingly reliable field report |
| M07 | 거짓된 평온 / Borrowed Calm (55) | uneasy lull turning into sudden district-wide action | Captain, squad and local partners disagree on responsibility |
| M08 | 도시의 심장 / Heart of the City (65) | sustained urban multi-objective battle across changed familiar areas | prior decisions change ally support and the city's visible state |
| M09 | 부서진 약속 / Fractured Promise (60) | separated squad objectives rejoin during an intense major encounter | Captain stays playable; cutaways show conflicting witnesses |
| M10 | 다섯 번째 신호 / Fifth Signal (60) | cinematic moving transit battle and fast objective changes | choice between routes has consequences in the finale |
| M11 | 침묵의 시간 / Hours of Silence (65) | attritional narrative confrontation and desperate passage | hidden record casts doubt on both official accounts |
| M12 | 남은 빛 / After the Light (70) | lengthy multi-phase final mission with meaningful interactive changes | ending evaluates human impact, evidence and alliances |

**Total target = 720 minutes.** Every chapter should have a distinct traversal pattern, location grammar, objective mix and memorable original transition. Do not imitate recognisable scenes from Call of Duty or another game.

## Release sequencing and verification

- **Nov 27 demo:** preserve BR demo release as P0. Add original captain identity and NIS dialogue to CH01; actual playable action encounter is a separately testable next step. A UI label or script line is not combat implementation.
- **Dec–Apr stretch:** build reusable mission objective, companion AI and combat gameplay systems, then author/test all 12 chapters with real playable content and actual runtime.
- **Not complete until:** all twelve chapters play end-to-end with captain as protagonist, NIS supporting role coherent and plausible as fiction, combat is demonstrably the dominant interactive activity, story arcs make sense, original assets are licensed, QA/accessibility passes and median observed first-run duration approaches twelve hours.
- Online Operations + Battle Royale, photoreal UE builds, true 165 Hz support and all previous user requirements remain mandatory; none are replaced by these narrative changes.

## Binding immersion requirement (2026-10-27)

The user requires a story experience aspiring to **greater felt immersion than merely watching a movie**. This is not a graphics-only directive. Captain Lee must remain in player control during consequential cinematic action whenever practical; NPC dialogue, sound, environment, mission events and follow-on chapters react coherently. Preserve a believable first-person camera and original character arcs, varied combat-forward encounters, meaningful short quiet intervals, subtitles, accessibility/reduced camera motion and smooth checkpoint/replay. See the authoritative [Campaign Immersion Standard](CAMPAIGN_IMMERSION_STANDARD.md) for interactive-scene rules, seven quality pillars and player-test gates. **This remains a target, not a claim of current 12-hour or beyond-film quality.**

## Realism correction (2026-10-27)

CH01 story-only combat must not grant a shield or magical protection. Kim Ji-yun's one-use Q interaction is an informational radio report, not health restoration. Story combat damage bypasses the separate BR prototype's shield mechanic. Existing v2 saves may contain a shield field for backward compatibility, but restored CH01 shield is zero. This is a limited browser prototype change, **not** proof of realistic full-body injury, weapon ballistics, native UE performance, or completed campaign combat.

## Real-world object reference policy (owner direction, 2026-10-27)

Every tangible object class in VEILPOINT (firearms, hand tools, knives, cars, trucks, electronics, architecture, furniture, clothing and everyday props) should be modeled from documented real-world references wherever practical. Prioritize credible dimensions, material response, weight, moving parts, vehicle dynamics, audio, animation and environmental interactions. Preserve believable physical constraints instead of adding arcade shields, magic healing or superhuman handling.

**IP and production gate:** Real-world reference does not grant rights to copy proprietary CAD/3D assets, product photography, trademarks, logos, trade dress or licensed sounds. Track source, creator, usage rights and attribution for each asset. Use original game-ready geometry and audio unless explicitly licensed; substitute fictional branding where rights are uncertain. Avoid implying endorsement by manufacturers, armed forces or intelligence agencies. Real-world fidelity is a target and must be verified through side-by-side visual and gameplay review, not asserted as complete.

**Safety and scope:** Treat equipment as visual/interactive fiction, not a technical guide to real-world weapon use. Implement progressively with provenance-tracked reference sheets and representative assets; no claim that all world objects have been built.


## Non-negotiable physical realism gate — owner reaffirmation 2026-10-27

**This requirement supersedes earlier descriptions of arcade encounter mechanics across the entire finished game.** VEILPOINT's story, team multiplayer and battle royale must contain **no obviously nonphysical or supernatural features**. Photorealism alone is insufficient: consistent cause/effect, believable human movement/perception, material properties, physics, vehicle dynamics, environmental behavior, damage and recovery constraints, equipment weight and available resources are all mandatory. There may be game-engine approximations for performance/accessibility, but never present arbitrary rules, miracle treatments, energy shields, instant regeneration, spontaneous ammunition/charge creation, telepathic map knowledge or sci-fi technology as realistic. Provide believable real-world motivation for zones/hazards and rules before introducing them.

Signal Echo is only a grounded reconstruction from available evidence; Signal Weather must be naturally possible. Companions provide observable assistance and information, not protective magic. All real-world object models require source/rights checks, original or licensed game-ready assets, credible proportion/material/physics review; depiction does not imply official manufacturer or government endorsement.

**Known violations, NOT completed:** the shared BR prototype in src/simulation.js still includes default energy-style shield, damage absorption, shield loot, immediate health restoration, arcade signal charges/tagging and unexplained shrinking-zone damage. src/app.js still exposes shield/charge HUD and precise bot positions on its minimap. CH01 src/story-slice.js no longer receives shield protection and ally Q sends a radio report, but still has automatically replenished charges and the fictional signal-drone engagement. **Track as P0 release blocker in issue #15 and requirements R-23.** Remove/replace through actual code and tests; preserve save compatibility and 60 Hz determinism. Do not assert absolute simulation realism until independent hands-on validation; never claim these changes already done based on a design document.

## CH01 grounded encounter iteration (2026-10-27 candidate)

The original short CH01 browser slice now models three **fictional human hostile actors** rather than science-fiction signal drones. Each actor has a finite number of game-only shots and requires a nearby, unobstructed target within its facing arc; no invisible periodic damage or ammunition replenishment is permitted. The protagonist remains Captain Lee Su-hyeok and both fictional NIS allies remain support characters. This is still a fixed-position, non-graphic browser abstraction—not a full military simulation, real-world tactics guide, human-level AI, 50-minute authored mission or completed 12-hour campaign. Checkpoint compatibility and automated tests are necessary, but real browser/UE/human verification remains pending.
