# VEILPOINT — Multiplayer and Battle Royale Specification
**Design 0.1 · Planned features, NOT live multiplayer**

## Modes
| Mode | Target launch configuration | Primary player experience | Implementation truth |
|---|---|---|---|
| **DISTRICT CONTROL** | 6v6 objective teams, smaller 2v2 test server first | Cooperate to secure publicly signaled district services; readable scoring and respawns | Planned; backend and authoritative match loop not yet implemented |
| **LAST SIGNAL / Battle Royale** | 24 players after network tests; larger matches only if measured viable | Drop, explore, collect, survive changing boundaries, place/win/return to lobby | Browser currently has **offline simulation vs bots**, not internet multiplayer |
| **RELAY RUN** | 4v4 or 6v6 rotating relay objectives | Relays briefly change environment state; emphasis on awareness and fairness | Planned original objective mode |
| **CIVIC RELAY Co-op** | 2–4 player story-linked session, post-core optional | Short joint PvE narrative chapter for cooperative players | Future stretch; do not block basic story + multiplayer + BR delivery |

Not every target player count is an unconditional requirement at day one. Real backend load and concurrency tests determine maximum safe capacity.

## Unique multiplayer system: Signal Weather
A **server-authoritative district event layer** changes the shared environment in defined, fair and legible ways:
- Relay blackout: a short, announced in-world power reduction affecting all teams in a region. Primary objective cues remain visible for accessibility.
- Interference pulse: selectively reduces *nonessential* minimap annotation for all participants, with audio/visual notice and explicit cooldown.
- District restoration: fulfilling a public objective visibly restores municipal lighting and communications, affecting the atmosphere and route readability equally.
- Environmental time/weather cycles: tested for visibility parity, no pay-to-win visibility advantage and no selective hidden-player reveal.

Events must not serve as random invisible punishments; clients receive identical event IDs and rules from the trusted server. Avoid gameplay-disruptive visual noise and motion sickness.

## Shared competitive match lifecycle
Menu → choose mode/party → server-authorized lobby → ready/start → round/match loop → verified result → return to lobby/requeue.

Authoritative server owns match phase, countdowns, scores, player positions validated against game constraints, pickups, zone clock, inventory transitions and end state. Clients may predict movement for responsiveness but never self-award health, points, inventory or the win. All events should be idempotent or assigned a sequence ID. Networked gameplay is an engine/server task and not demonstrated by an offline-only browser prototype.

## Distinct fairness and integrity rules
- Campaign collectibles, narrative choices and cosmetics never grant multiplayer stat advantages. Optional campaign lore can appear as contextual map information, not reveal opponent positions.
- Players can reduce motion, bloom, distortion and camera bob, and choose high-visibility HUD. Avoid forcing cinematic noise into ranked games.
- No gameplay-affecting store or exclusive items; cosmetics cannot obscure silhouettes or create camouflage imbalance.
- Spawn, matchmaking, objective scoring, timeout, abandoned sessions and reconnection are separately tested with actual concurrent clients.
- Include private/social lobby and reporting/moderation plans before internet launch.
- Dedicated server authoritative logic and anti-tamper validation are mandatory for public online release, along with abuse tests and privacy considerations.

## BR rules and cross-mode sharing
- BR starts in a separated session with server-owned map seed, safe-zone schedule and drop/collect/finish transitions.
- A shrinking area remains clear in both environment and accessible HUD; delays and late join rules must be specified before production.
- Shared rendering, movement, input, cosmetics, environment art and profile settings are reusable with campaign but **progression and rule state are isolated**.
- Server profiling should focus on replication relevancy/interest management, network payload bounds, physics and rendering bottlenecks.
- Test progression initially with tiny host-local lobbies, then named client/server configurations. Do not claim a 24/100-player match based on a simulation using bots.

## Technical minimum acceptance
- Automated server-side rule tests: join/leave, phase, score, objective reset, authoritative inventory and invalid client command.
- Concurrency: 2-player running test, then 2v2, then target 6v6; BR capacity scaling only with server load results.
- Reconnect and network fault injection: packet delay/loss and slow client, reproducible logs and no score duplication.
- Map and signal events produce the same authoritative state on clients; versioned event protocol and compatibility handling.
- Frame pacing and gameplay latency separately benchmarked on named hardware. 165 Hz display support never equals assured 165 FPS.
- Real multiplayer launch must include clear terms, privacy/security controls and player reporting channels.

## Differentiation through shared world without unfair cross-over
Narrative chapters give emotional context to neighborhoods and services. Multiplayer modes may take place in **alternate, explicitly non-canonical scenario layouts** inspired by those districts. The same environment changes dynamically by shared objective; every player experiences the same event rules. The world has history, but campaign progress cannot change live competitive balance for a particular player.

## Engineering priorities
1. Write pure mode/rule definitions and match-state tests independent of Unreal and browser drawing.
2. Build a local authoritative simulation test harness; enforce join/leave/match lifecycle.
3. Connect first 2-player network test in UE when engine and host/client environment are available.
4. Build a reliable small competitive mode; then adapt tested primitives to real battle royale.
5. Add public matching, region scaling, moderation and online services only after stability and security review.
