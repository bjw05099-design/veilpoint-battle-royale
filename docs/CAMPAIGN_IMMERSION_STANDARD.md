# VEILPOINT — Campaign Immersion & Cinematic Quality Standard

**Owner requirement, 2026-10-27:** The single-player campaign must aspire to an experience more immersive than a film, **not merely imitate a film's visuals**. This is a mandatory product ambition and **not an achievement claim**. Measure what can actually be tested, gather independent human assessments, and state gaps.

**Binding canon:** [Combat Campaign Canon](COMBAT_CAMPAIGN_CANON.md). Twelve chapters / 720 minutes of *authored target* (actual duration unmeasured), Korean special-forces Captain **Seo Jin-hyeok** as playable lead, important fictional NIS agents **Yoon Seo-ha** and **Kang Min-jae**, fictional Middle Eastern conflict across Sahir Coast/Nahrin, dominant combat-first gameplay with variety, and three modes overall (campaign, Operations multiplayer, battle royale).

## Difference between cinematic appearance and participatory immersion

A film controls every shot; a compelling interactive campaign must remain coherent when the player approaches a scene at an unexpected angle, pauses, changes speed, misses a clue, uses accessibility settings or returns from a checkpoint.

**The intended experience:** You do not merely watch what Captain Seo does—you *are responsible for the next in-game decision*, and the people, city, soundscape and mission state react meaningfully. A spectacular cutscene without corresponding playable consequence does not satisfy this standard.

## Seven non-negotiable pillars

1. **Player agency within authored drama.** Keep player control through as much of the cinematic action as feasible. Avoid long non-interactive segments. When control is temporarily removed for a transition, establish a clear purpose, duration and skip/replay rule. Branches must influence at least one later playable consequence—not just change dialogue.
2. **Grounded physical presence.** Consistent first-person camera, plausible character height, contact with stairs/doorways/vehicles, responsive input and convincing animation blending. Camera shake/head movement/distortion must be optional, not mandatory for "realism."
3. **Cohesive visual realism.** Physically consistent materials, lighting and exposure; authored unique streets and architecture, depth, atmospheric conditions, character faces and animations. Lumen/Nanite/TSR are tools, not proof of visual quality. Validate in *moving gameplay*, including dim interiors, dusk/day/night and high-contrast transitions.
4. **Spatial audiovisual narrative.** Believable dialogue positions and transitions, clear ally/enemy/civilian vocal identity, sound propagation and environmental ambience, dynamic music that responds to narrative tension without overwhelming speech. Subtitles, audio cues and independent volume controls must preserve playability.
5. **Believable characters with memory and motives.** Captain Seo, NIS characters and local allies should react to the same event consistently across missions, remember limited earlier choices, have their own objectives and avoid constant exposition over gameplay. Provide context for uncertainty instead of omniscient plot messages.
6. **Combat-led but varied intensity.** Target ~60–65% of campaign *interactive* runtime as fictional combat/action encounters. Distinct mission goals, environmental reactions, readable feedback, AI credibility and movement variety matter more than uninterrupted repetitive fire or graphic effects. Short quiet stretches serve suspense and connection.
7. **Technical reliability protects immersion.** Maintain stable frame pacing and low input delay, quality settings and 165 Hz-capable options on supported hardware. Avoid clipping, teleporting NPCs, inconsistent objective prompts, broken checkpoints, intrusive UI, sudden audio cuts and immersion-breaking scene reloads.

## Interactive "scene grammar" — what to implement

At chapter/storyboard level, specify:
- **Intent:** what does the player actively want and know at the start?
- **Immediate verb:** what playable interaction moves the scene forward (movement, contesting an objective, assisting an ally, interpreting a clue, choosing a route)?
- **Reactive event:** what changes visibly/audibly as a result of the player's action?
- **Character consequence:** who notices/responds and how?
- **Transition:** how does the next activity flow without a jarring interruption?
- **Fallback:** what happens if the player waits, takes another route, misses optional material, pauses or loads a checkpoint?

No world event should rely solely on a static cinematic that ignores the player's physical position. A bounded scripted sequence can be acceptable if its input and follow-up state are reliable.

## Pacing across twelve chapters

- Keep the authored 12-hour/720-minute target, then independently measure the actual median first-run time (target near 12h, expected variance ~10–14h).
- Ensure **meaningful variety**, not constant noise. Across 10–20-minute windows, target a new playable development: a changed objective, novel environment response, consequential choice, character reveal or a sufficiently different encounter. Test actual perceived pacing; do not enforce arbitrary timers that reduce player agency.
- Each of the twelve planned chapters should have its own memorable game environment, signature interactive moment and character/plot consequence; do not recycle the same formula with a new skybox.
- Allow players to pause, skip previously viewed cinematic material, use reduced-motion options, read subtitles and adjust difficulty, without sacrificing chapter progression.
- Non-graphic and culturally respectful fictional conflict; no copied Call of Duty/GTA/PUBG/Bodycam plot beats, copyrighted audiovisual assets or UI.

## Concrete implementation gates

### CH01 (first priority after stable browser demo)
- [ ] Existing **noncombat** story browser slice remains functional and its characters/canon are consistent.
- [ ] Add a **playable fictional combat encounter** with game-oriented encounter AI, objective state, accessible feedback and checkpoint/resume; avoid scripting a victory that happens without player engagement.
- [ ] Captain Seo / NIS ally / Mara dialogue responds to player actions and the mission state, with readable subtitles; do not rely on an uninterruptible transcript.
- [ ] At least one scripted environmental transition happens **in gameplay** and correctly persists (or deterministically reconstructs) through reload.
- [ ] First-person camera, audio, UI, reduced-motion options and checkpoint consistency have automated checks where feasible, plus actual human/browser playthrough recording.
- [ ] Implement an independently testable 5–15-minute vertical slice, **then time actual play**. The existing CH01 preview is not a 50-minute production mission.

### Full 12-hour native campaign (long-term)
- [ ] All twelve chapters are physically playable, linked, checkpointable and reach an authored ending; no progress-blocking glitches.
- [ ] Major narrative choices affect later scenes/game-state, not merely dialogue.
- [ ] Real voice/subtitle/animation/environment work is authored/licensed and integrated across major characters.
- [ ] Real Unreal packaged builds show authored cinematics transitioning to gameplay smoothly.
- [ ] Image quality/performance tested with named CPU/GPU/resolution/refresh and objective CPU/GPU frametimes; no invented sustained 165FPS claim.
- [ ] Independent player review compares **presence, agency, emotional investment, audiovisual credibility, pacing, fatigue, and mission variation** against relevant high-quality narrative games and comparable film scenes under declared conditions.
- [ ] Blind playtests and event telemetry (where explicitly consented) show critical paths, restart/quit points, interruption rates and recoverable bugs; no forced prolonged sessions or manipulative reward loops.

## Review rubric (target only, never automatic proof)

For each playable chapter, collect at least three *independent* reviewers where feasible and use a **1–5 scale** for:
- Sense of being physically present (camera, image, audio, movement)
- Control and responsibility for decisions
- Character believability, emotional stakes and continuity
- Gameplay diversity, pacing and memorable moments
- Stability, accessibility and low-friction controls
- Originality, cultural care and distinction from inspiration titles

Track reviewer count, median scores, hardware and capture artifacts. Target **median ≥4/5 on each axis**, with **zero known P0 immersion-breaking soft-locks**, but recognize that subjective scores cannot establish globally superior quality on their own. A "better than movies" claim requires a stated comparison method and evidence, not marketing assertion.

## Scheduling and scope discipline

- The 2026-11-27 primary commitment remains a packaged, playable offline demo. Immersive **CH01 combat-first vertical slice** is a stretch until implemented and tested.
- The 2027-04-27 completed-game target is a major, non-guaranteed stretch for a solo developer. Keep building after the date if critical gates are unmet, subject to scheduled service limits.
- Hourly development prioritizes *end-to-end playable behavior* and tests over large, beautiful but non-functional design documents. Every progress report must distinguish **designed, coded, tested in Node, browser played, Unreal built, hardware measured**.
