# VEILPOINT — Multiplayer modes and shared-world originality

**Design status:** target specification only. **No shipping online multiplayer is claimed.** Complements [campaign](CAMPAIGN_DESIGN.md), [product vision](PROJECT_VISION.md) and [release roadmap](FINAL_RELEASE_ROADMAP.md).

## Mode selection

1. **Story Campaign (solo, optional co-op only as later stretch):** approximately 12 authored first-play hours across 12 chapters in a wholly fictional Middle Eastern federation affected by civil conflict. Set pieces, investigation, vehicle traversal, navigation, rescues, environmental reactions, cinematics and branching consequences. Single-player pause/checkpoint is a first-class feature.
2. **Operations Multiplayer (online):** original round-based and team-objective modes designed for fair, skill-expressive competition. Cooperative PvE events can be separate. Matchmaking, authoritative server and session infrastructure are development requirements, not existing capabilities.
3. **Battle Royale (online):** expanding the currently offline browser survival prototype into fair, server-authoritative matches with readable map hazards, looting and final-survivor conditions. Campaign choices cannot give competitive power.

## Multiplayer Operations variants (design targets, not implemented)

| Mode | Proposed format | Primary skill + dynamic event |
|---|---|---|
| **Signal Relay / 신호 중계** | 6v6, rotating map points | Teams contest **public** relay nodes; environment route information periodically changes for *both* sides |
| **Corridor / 회랑** | 8v8, moving objective | Teams shift safe passage corridors via clearly announced shared map state; map geometry is original |
| **Split Evidence / 분리된 기록** | 4v4, asymmetric information at first | Both teams collect contradictory publicly verifiable fragments; after a reveal both receive the same facts |
| **Stormline Royale / 경계선** | scalable player count, start smaller before tuning | Variable hazard perimeter and visible, announced routes; no hidden random unfair map control |

Any player count is a future server-load target, not tested capacity. No real-world conflict group, emblem or country is reconstructed. No pay-to-win, randomized gambling monetization, exploitative urgency or manipulative reward loops.

## VEILPOINT signature systems

**1. Living Chronicle / 움직이는 연대기:** A mission or online map can have a *physical layer* and a readable *record layer*. Story recordings are deliberately incomplete, the outcome depends on environmental/contextual information, and the player can ignore optional fragments without getting stuck.

**2. Consequence Geometry / 변화하는 경로:** A resolved mission decision can open/close an authored passage, change civilian safety status, replace an NPC encounter or alter lights. In competitive play these changes are symmetric, deterministic or broadcast with fair warning; single-player paths may branch narratively.

**3. One shared cinematic language, three different rulesets:** Consistent controls, sound, camera and rendering, different save/match authority. Campaign has checkpoints, Operations uses dedicated authoritative round state, Royale uses authoritative zone/player state.

**4. Novelty through PLAY, not random noise:** Controlled 3–7 minute goal shifts, new interactive consequences, route changes and unique set-piece pacing. Quiet scenes must still involve a meaningful choice, navigation, exploration or emotionally consequential interaction; don't require constant explosions, grinding or intrusive reward notifications.

## Hard requirements before claiming online-ready

- Dedicated server owns movement validity, inventory, objective state, team score and match transitions.
- Network roundtrip, packet loss, disconnect/rejoin, desync and cheating cases have repeatable tests.
- Server capacity, matchmaking, privacy, voice/text moderation and accessibility reviewed.
- Share game state and technical primitives where useful, but never reuse campaign save flags as competitive advantages.
- Graphics presets and 165Hz support apply uniformly with *actual measured hardware* needed for performance claims.
- Avoid proprietary assets/narrative/camera presets/UI from Call of Duty, GTA, PUBG or Bodycam; use original characters, map layouts, systems, world names and writing.

## Solo-development scheduling

**Nov 2026:** playable offline demo is still P0. Campaign first chapter vertical slice is a stretch. No need to promise complete online functionality that cannot be tested.

**By Apr 2027:** 12h story + polished Operations + Battle Royale + full photoreal visual quality is a stretch target, not a time estimate to guarantee. Use integrated playable milestones and continue past date if evidence is inadequate.
