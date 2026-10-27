# VEILPOINT — Game Design Bible (GDB)
**Version:** Design 0.1 · 2026-10-27 · **Status: proposal / NOT implemented**

## Product definition
VEILPOINT is an original, photorealism-aspiring first-person game with three distinct, connected experiences:
1. **STORY / The Broken Signal:** cinematic, character-driven single-player campaign set amid a fictional Middle Eastern-region war and internal civil conflict.
2. **MULTIPLAYER / District Conflict:** server-authoritative, competitive team-based FPS with accessible settings, meaningful objectives and fair progression.
3. **BATTLE ROYALE / Last Signal:** multi-squad survival on a changing map, with carefully optimized high-fidelity environments, shrinking play area and tense endgame.

The game combines **visual plausibility, deliberate first-person control, an explorable reactive district and evidence-driven dramatic context**. It must not look, sound or play as a reskin of any existing franchise.

## Inspiration boundary — take principles, never protected expression
| Inspiration | Transferable quality | Do NOT copy |
|---|---|---|
| Call of Duty franchise | Directed set-pieces, approachable FPS control, a distinct story campaign and replayable competitive formats | Named operators, stories, mission scripts, logos, UI layout, signature voice lines or map geometry |
| Grand Theft Auto franchise | Dense, responsive urban environments, ambient world behavior, natural traversal and environmental storytelling | Cities, satirical characters, police/wanted systems verbatim, maps, assets, iconography or missions |
| PUBG: Battlegrounds | A clearly readable battle-royale survival loop, high-stakes squad decisions, variable match geography | Distinctive map layouts, UI, item styling, rules presentation, icons or branded mechanics |
| Bodycam | A feeling of physical presence from camera, surface response, lighting, acoustics and proportion | Signature camera/look, effects setup copied 1:1, visual assets, marketing imagery or branding |

Independent art direction, names, music, audio, mission composition, weapons as fictionalized game objects, source code and UX are mandatory. Maintain an asset licence/attribution ledger. Avoid claims of comparative superiority without recorded evaluation.

## Original identity: **The Signal / The City / The Witness**
The fictional city **Nahrin** is a living setting on the **Sahir Coast**. A local civil communications and archive network, called **VEILPOINT**, was meant to preserve public infrastructure records and emergency broadcasts. During the Sahir civil conflict, conflicting reports and intermittent blackouts make it difficult to know what happened and whom to trust.

- **Signal Echo:** limited, authored fragments of radio recordings, signage, digital logs and visual evidence can be collected and arranged chronologically. It is *not* a supernatural radar or wallhack and cannot magically identify concealed opponents.
- **Living District:** campaign missions revisit coherent spaces after believable changes to lighting, weather, access routes, utilities and civilian activity. Competitive variants reuse modular *art assets* but receive separate balancing passes.
- **Integrity, not omniscience:** the campaign occasionally asks whether incomplete information is trustworthy. Player choices influence alliances, access to optional scenes and final interpretations, not simplistic binary ethnic or religious morality.
- **Multiplayer fairness:** every simultaneous gameplay-affecting blackout, weather change or map event is server-controlled, announced/readable to all and balanced; campaign achievements and purchases grant no competitive power.
- **Grounded sensory immersion:** physical camera motion is optional, with lower-motion defaults available; avoid exaggerated head bob, nausea-inducing distortion and obscuring the reticle.

The distinctiveness arises from systems and storytelling, not from copying other titles' recognizable expressions.

## Fictional world and thoughtful portrayal
- Location: the **fictional Sahir Coast / Nahrin metropolitan district**, inspired by diverse Middle Eastern landscapes: coastal waterfronts, mountains, old neighborhoods, modern infrastructure and desert edges. This is **not a retelling of any real current war**.
- Conflict: a fractured provisional administration, competing local councils, civilian rescue institutions, defecting security bodies and independent journalists. No ethnicity, nationality or religion is collectively a villain.
- The narrative foregrounds lived experience, trust, displaced communities, the fragility of public services and difficult choices without sensationalized graphic violence.
- Consult culture and language references for respect and authenticity. No real insignia, offensive stereotyping or invented history passed off as truth.

## Shared player foundation
- First-person traversal: walk, sprint, crouch, jump, mantle where physically plausible; clear stamina/readability and simple controller/keyboard support.
- A single interaction contract: interact, contextual examine/collect, objective state, audio feedback, pause, resume and restart.
- Strong visual feedback, an optional unobtrusive HUD, high-contrast/low-motion options and remapping plans.
- Maintain offline browser prototype as a practical design/test sandbox; high-fidelity end product should be Unreal Engine with a reproducibly built native release.
- Mode-specific inventories, progression, rules and match instances **must not leak** into one another.

## Game pillars and delivery gates
| Pillar | Measurable release evidence |
|---|---|
| Campaign | Opening and ending, authored missions with objectives and checkpoints, voice/subtitle accessibility, no blocking progression issues, narrative review |
| Competitive multiplayer | Authoritative dedicated-server matches, lobby/start/end, objectives, team balancing, disconnect/reconnect behavior and network abuse tests |
| Battle royale | Deploy/loot/zone/survival/result/requeue, reliable server-side world state and load tests; support larger lobbies only after measured scalability |
| Photorealism | High-quality original/licensed PBR assets, valid native builds, moving-scene visual comparisons, lighting/reflection/animation QA |
| HyperReal 165Hz | Six presets + Custom, named monitor/GPU/CPU and resolution, 165Hz mode vs FPS cap distinguished, measured frame time P50/P95/P99 |
| Product quality | Offline demo by 2026-11-27 as priority; longer-term full campaign and network features with automated tests, packaging, usability and rights |

## Scope governance for one-person development
**2026-11-27 demo:** preserve and ship the working offline browser BR loop, *plus* an introductory **narrative mission vertical-slice concept** if it can be implemented and tested without destabilizing the demo. Do not pretend online modes or an eight-mission campaign were delivered merely because menus/docs exist.

**2027-04-27 stretch:** seek a packaged native experience with one well-produced campaign chapter, working small-session multiplayer, BR vertical slice, meaningful graphics options and evidence of stability. The user's **complete** vision includes a fuller multi-mission campaign, wider player-count support and polished online operations; if these gates are unmet, continue development after target date rather than mislabeling it complete. See [campaign](STORY_CAMPAIGN.md), [multiplayer](MULTIPLAYER_MODES.md), [requirements](REQUIREMENTS_MATRIX.md), [long roadmap](FINAL_RELEASE_ROADMAP.md).

## Non-goals
- No verbatim adaptation of real Middle Eastern conflicts, real militant branding or sensitive political propaganda.
- No lifted character identities, maps, modes' protected audiovisual presentation or proprietary technology.
- No gore-focused depictions or unnecessary graphic violence.
- No falsely claimed UE compilation, multiplayer readiness, photoreal parity or stable 165FPS.

## Current CH01 implementation checkpoint (2026-10-27)

The offline browser now has `story.html` and `src/story-slice.js` for a **short** playable first-person relay/record/route-choice/exit loop, with local checkpoint saves, subtitles and optional evidence. This is only a **prototype vertical slice**, not a finished full chapter, twelve-hour campaign, server-authoritative multiplayer or native photoreal build. The 12-chapter/720-minute **planned** campaign budget is in [Campaign Design](CAMPAIGN_DESIGN.md), replacing the earlier eight-chapter count. Current BR remains an offline browser mode; the team mode and Signal Weather remain unimplemented.
