# VEILPOINT — Multiplayer and Battle Royale Specification
**Design 0.1; 2026-11-10 release-order correction.** The first release
is the standalone Windows **single-player story**, and Battle Royale is a
**later release**. The BR96 target is **16 squads of 6 (96 humans)**; the
local 96-seat 2D server/test UI is not a 96-human gameplay load test,
internet FPS or finished public Battle Royale. This supersedes the older
24-player fallback concepts below. See
[story-first release plan](STORY_FIRST_RELEASE_PLAN.md) and
[local BR96 test constraints](BR96_BROWSER_PLAYTEST.md).

## Modes
| Mode | Target launch configuration | Primary player experience | Implementation truth |
|---|---|---|---|
| **DISTRICT CONTROL** | 6v6 objective teams, smaller 2v2 test server first | Cooperate to secure publicly signaled district services; readable scoring and respawns | Partial localhost-only Node 2-client objective proof (not native FPS or public online multiplayer); production backend and network QA still planned |
| **LAST SIGNAL / Battle Royale** | **Future target: 16 squads × 6 players = 96 real participants**, subject to real concurrency/performance proof | Publicly fair shared-world competitive rounds after story release | Separate offline bot prototype plus localhost-only 96-seat/2D movement server; **not** a complete 96-person network FPS or public Battle Royale |
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
- Test progression initially with tiny host-local lobbies, then named client/server configurations and measured concurrent clients. Do not claim a verified **96-human** session based on 96 empty seats, browser bots or a theoretical 60Hz world clock.

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

## 2026-10-27 isolated localhost authority proof

`npm run team:server` serves a separate two-browser-tab 2D objective arena on `http://127.0.0.1:8765/`. The Node server owns ready/start, movement capped by fixed 60Hz simulation, physical objective presence/contesting, scoring, result and replay. Commands use unpredictable session tokens and monotonic sequence IDs; clients cannot award score or teleport. Tests use two independent HTTP clients and a complete objective round. The prototype is **not** a networked FPS, a secure public deployment, production matchmaking, reconnection, measured packet-loss resilience or a UE server. Its 2D map is a temporary rules test UI, not final game art or an omniscient tactical display.
