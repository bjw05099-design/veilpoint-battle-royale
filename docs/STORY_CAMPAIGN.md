# VEILPOINT — STORY / The Broken Signal
**Narrative blueprint 0.1 · Planned, not yet implemented**

## Logline
In the fictional Sahir Coast city of **Nahrin**, an emergency archive called VEILPOINT survives the failure of the city's communications network. As a regional war destabilizes an already divided state and the internal conflict deepens, three people following different leads discover that the same crucial night has been recorded three incompatible ways. Players experience a grounded first-person campaign in which decisive action and careful attention to evidence change which truths can be reconstructed.

**Tone:** immediate, tense, cinematic, human-centered, serious. Inspired by Middle Eastern landscape and the lived stakes of wartime and civil conflict without reproducing or attributing real-world atrocities to real communities. No graphic treatment of casualties.

## Main characters (original fiction)
- **Mara Dahan**, municipal communications engineer who knows the emergency network. Protagonist of the opening and most environmental investigation sequences; wants Nahrin's essential services restored.
- **Yusuf Rahal**, local emergency-response coordinator tasked with evacuations and escorting aid workers. Prioritizes civilians and struggles with rival groups' inconsistent information.
- **Samir Qadir**, former state investigator who now documents forged dispatches. His loyalty is questioned because he knows both official systems and the local councils.
- **Nadia Faris**, independent broadcaster and recurring ally, whose archive contextualizes competing testimonies.

Do not model these people on real politicians, operators, celebrities or protected fictional characters.

## Factions and environment
- **Interim Directorate:** fragmented administrative forces with disagreements inside their own leadership.
- **District Councils:** civilian institutions that sometimes cooperate and sometimes mistrust each other; never portrayed as a monolithic armed enemy.
- **Civic Relay:** volunteer technicians, medics and neighborhood coordinators who maintain services.
- **The Relay Broker:** a fictional opportunistic network that edits public messages for influence, with membership crossing faction boundaries.
- Locations: waterfront relay station, old market, municipal waterworks, hillside homes, transit interchange, desert-edge radio facility and floodplain nightscape. Distinct licensed-original architecture; culturally informed but no one-to-one copying of famous real sites.

## Three acts · eight chapter targets
| # | Chapter | Character | Experience and dramatic turn |
|---|---|---|---|
| 01 | **The Last Broadcast** | Mara | First-person introductory traversal, restoring a short-lived signal, learning examine/interact and discovering contradictory time stamps |
| 02 | **Waterline** | Yusuf | Guide displaced residents through a changing district, prioritize routes and restore a utility node; emphasizes world continuity |
| 03 | **Silent Courtyard** | Mara | Explore a dense residential block under an intermittent blackout; reconstruct two partial accounts from environmental clues |
| 04 | **Crossed Messages** | Samir | Meet competing witnesses and compare claims without a simplistic “correct group” marker |
| 05 | **The Long Road** | Yusuf | Traverse an expansive desert-to-city corridor and balance time-limited non-graphic protection objectives |
| 06 | **Signal Drift** | Mara | Revisit a familiar district altered by conflict, weather and access restrictions; players discover earlier choices have consequences |
| 07 | **Witness Protocol** | Samir | Discover that several archive timestamps were intentionally manipulated, then decide what can responsibly be disclosed |
| 08 | **Open Frequency** | Ensemble | Coordinated final return to the relay network; different endings reflect evidence quality, trust and services restored, not a simple kill count |

These are target chapter concepts, **not playable chapters at present**. A full cinematic campaign requires substantial writing, voice work, animations and visual assets beyond first-month demo scope.

## Campaign gameplay rules
1. No arbitrary “enemy ethnicity” indicator. Antagonism is grounded in particular in-game actions and contexts, not identity.
2. Evidence fragments have provenance, location and uncertain confidence. They may be incomplete; the player sees uncertainty rather than a fabricated perfect account.
3. Collectable evidence is optional for moment-to-moment traversal but may open alternative context and resolution in later chapters.
4. Checkpoints must restore coherent world and mission state; save/load never changes multiplayer rank or competitive power.
5. Story-critical accessibility: subtitles, adjustable font, dialogue log, reduced camera motion, objective recap and non-timing-critical assist modes.
6. Actions are conveyed through fictional, accessible game controls; no real-world dangerous tactics instruction or graphic effects.

## First vertical slice: CH01 / The Last Broadcast
**Target play time:** 10–15 minutes (aspiration; playtest-dependent).

**Locations:** narrow street → municipal relay office → rooftop overview → safe courtyard exit. Dense, meaningful detail is prioritized over map scale.

**Beat sequence:**
- 00, *Arrival*: a non-interactive opening establishes location, Mara and intermittent signals; prompt for movement and accessibility settings.
- 01, *Signal check*: approach a visible relay terminal and press Interact. A fully voiced/subtitled message may be presented later; initial build uses original text and audio placeholder.
- 02, *Compare records*: find two clearly legible local records; add them to a simple chronological Signal Echo board. Visualize timestamp disagreement.
- 03, *District change*: simulated power flicker changes lighting and navigation cues without hiding essential accessibility information.
- 04, *Exit*: lead the player to a marked courtyard, apply a checkpoint and conclude with a short summary of the unresolved account.
- 05, *Replay*: restart chapter from menu; collected state and options behave deterministically.

**Acceptance tests:**
- Start-to-finish progression with no soft lock or missing interaction.
- Missing a nonessential clue never blocks the main exit.
- Reloading a checkpoint restores objective and record state.
- Changes in settings do not invalidate objectives or player controls.
- Mission remains readable without audio and with reduced motion.
- If UE is unavailable, initial implementation may use browser story sandbox; must be clearly labeled as prototype.

## Narrative production checklist
- Original script, scene direction, subtitle/voice contracts, localization and cultural review.
- Art, audio and visual references with explicit licences.
- Non-graphic age-appropriate depiction; dignity and agency for noncombatants.
- Fresh playtests including clarity of motivation, uncertainty and ending.
- Reveal only what is actually implemented when describing campaign status.
