## 2026-11-02 local team voluntary exit and safe rejoin (R-12 / R-14 / R-23)

- **Partial P0 PC session UX:** The loopback two-client 2D UI now exposes an explicit server-acknowledged leave action. It stops accepting new held PC input, drains earlier sequenced commands, vacates the authoritative seat, clears the tab token only after acknowledgment, and permits immediate rejoin without waiting for the 30-second session lease. On an uncertain HTTP failure the token remains for retry rather than allocating a duplicate identity.
- **Verification boundary:** Two new DOM/network-mock regressions cover leaving a live round, immediate re-pairing, and a failed leave followed by retry. GitHub CI at the PR head and real Windows two-browser behavior remain separate gates. This is not a public internet service, a finished team FPS, Unreal build, RTX 3070 QHD 165Hz / **16GB system RAM** benchmark, or full three-mode release.

## 2026-11-02 CH01 PC silent pointer-lock watchdog (R-08 / R-14 / R-23 / R-25)

- **Partial P0 reliability fix:** CH01 now pauses and saves if desktop pointer-lock permission stays silent for four seconds of animation-frame time, or if a previously observed lock disappears without an event. A lock acquired without an event cancels the watchdog. A late grant after pause is rejected by the existing attempt guard. No hidden 60Hz hostile simulation advances without desktop mouse capture.
- **Evidence boundary:** Four new Node browser-controller regressions cover silent timeout, eventless success, silent loss and late-grant cancellation. GitHub CI must pass at this PR head. Actual Windows browser permission behavior, 2026-11-27 end-to-end demo, native UE5, real QHD 165Hz RTX 3070 with **16GB system RAM**, human realism and final three-mode release remain **unverified**. PC-only scope; no touch development.

## 2026-11-01 PC silent pointer-lock permission watchdog (R-08 / R-23 / R-25)

- **Partial P0 desktop input reliability candidate:** A Windows/desktop browser that never resolves or rejects a pointer-lock permission request now returns the offline BR to an explicit, resumable pause after four seconds of animation-frame time. The fixed 60Hz match remains frozen and the existing local checkpoint is preserved; a fresh user click retries permission. A successful lock observed without a dispatched browser event cancels the timeout; a subsequently lost lock without an event also pauses before another hostile simulation tick, while a stale permission grant after pause cannot reclaim the mouse.
- **Verification scope:** Four deterministic Node browser-controller regressions cover the silent timeout, canceled late grant, eventless success and eventless lock loss. GitHub CI at the PR head and actual Windows Chrome/Edge permission prompts, OS focus behavior, QHD 165Hz RTX 3070 with **16GB system RAM**, Unreal native play and three complete modes remain separate **unverified** gates. No new mobile or touch functionality.

## 2026-11-01 PC benchmark sample integrity / actual canvas backing size (R-08 / R-23 / R-25)

- **Partial P0 measurement integrity candidate:** The offline BR benchmark now records CPU draw times, effective render scale and actual canvas backing dimensions only for complete post-warmup render intervals. Changing graphics settings while a benchmark is merely armed now terminates it explicitly, preventing an exported JSON report from silently describing a different preset. The JSON exposes observed min/max backing pixel width and height, not the operating system's verified QHD output or physical 165Hz refresh.
- **Evidence boundary:** Deterministic Node unit and browser-controller regression cases target warmup alignment, malformed canvas dimensions, re-arming and preset changes. CI at the PR head and Windows RTX 3070 / QHD 165Hz / **16GB system RAM** measurements remain separate gates. Neither this instrumentation nor its passing tests establish actual 165FPS, GPU P95/P99, native Unreal performance, or completed three-mode play.

## 2026-11-01 offline demo ZIP closure / archive integrity (R-01 / R-23 / demo P0)

- **Partial packaging/QA improvement (PR #210):** The offline ZIP verifier now rejects missing HTML-referenced local scripts/assets even if its per-file manifest hashes are internally consistent, rejects missing README/delivery documents, and requires contiguous non-aliased local ZIP records. Packager and verifier share the same direct HTML reference policy. Regression fixtures exercise missing dependencies, missing documentation, remote scripts and untracked ZIP padding.
- **Evidence boundary:** GitHub Actions passed syntax, 678 Node tests and offline ZIP packaging at PR #210 head; merged main CI also passed. These are automated checks, not a Windows browser playthrough. Archive integrity does not prove actual Windows browser launch or full BR gameplay completion. 2026-11-27 demo delivery, native UE5, 3-mode final release, RTX 3070 QHD 165Hz with **16GB system RAM**, licensed photoreal assets and independent QA remain **unverified**. PC keyboard/mouse scope only.

## 2026-11-01 BR boundary disqualification health integrity (R-14 / R-23 / P0)

- **Partial realism correction, CI passed on PR #209 head:** At a published BR boundary deadline, a rival is now marked administratively disqualified without zeroing physical health. A separate checkpoint flag distinguishes disqualification from combat incapacitation; existing saves without the flag migrate to the previous combat-elimination semantics. The same 60Hz rule still applies to player and opponents, and finite ammunition is unchanged.
- **Verification boundary:** Node regressions cover positive-health disqualification, replay, save/restore and invalid flag injection. PR #209 head passed 680 Node tests, syntax checks and offline ZIP packaging; actual Windows offline play remains unverified. This does not close realism issue #15 or establish final 3-mode physical realism, UE5, QHD 165Hz RTX 3070 / **16GB system RAM** performance, or the 2026-11-27 demo gate. PC-only keyboard/mouse scope remains; no touch-specific work.

## 2026-11-01 authoritative team round deadline (R-12 / R-14 / R-23)

- **Partial P0 gameplay/reliability implementation:** The loopback-only two-client 2D team round now ends at an authoritative 18,000-tick (five-minute at fixed 60Hz) simulation deadline. A server-owned score lead wins; tied scores draw. A fully completed relay objective on the final tick takes precedence over the timeout; interrupted/contested progress does not count. Rematches reset the clock. Both clients receive the same remaining-tick snapshot and the PC UI displays an approximate mm:ss countdown from that snapshot, not a client-controlled clock.
- **Evidence boundary:** New deterministic Node/HTTP regressions cover exact expiry, lead/draw, final-tick objective, contest, rematch and two-client snapshot parity. This is a small local 2D rules prototype, **not** a finished team FPS or public internet multiplayer. Real Windows two-browser end-to-end play, full offline BR demo, three-mode release, native Unreal build, independent realism QA and RTX 3070 QHD 165Hz / **16GB system RAM** measurements remain unverified. GitHub CI must pass at the final PR head.

## 2026-11-01 local team HTTP request body cap (R-12 / R-23)
- **Partial P0 hardening, PR #206:** The loopback-only two-client server now rejects JSON uploads immediately when a declared Content-Length exceeds 2048 bytes or a chunked stream crosses that limit, without waiting for a possibly abandoned sender to finish. Exact-limit valid UTF-8 JSON remains accepted; this is not a public-internet security certification.
- **Verification boundary:** Four new Node regressions cover unfinished oversized streams, header preflight, exact-limit chunked input and an actual two-client-prototype HTTP 413 response before upload completion. Full PR-head CI and actual Windows two-client operation are separate gates. Native UE, public multiplayer, QHD 165Hz RTX 3070 / 16GB system RAM and human realism tests remain unverified.

## 2026-11-01 local team equipment parity and server-owned mobility (R-12 / R-13 / R-20 / R-23)
- **Partial code candidate:** The loopback 2D team rules now expose the same seven original class names as offline BR/CH01, with finite class-specific magazines, carried reserves, shot cadence, abstract ranges and equipment-dependent server-owned movement speed. The original three profiles retain their existing ammunition/damage/cadence values. This does not implement real-world weapon physics, animations, 3D first-person online play or public internet multiplayer.
- **Evidence gate:** New Node regressions cover all seven finite-inventory/reload paths, deterministic 60Hz mobility and a short-range miss. Full GitHub CI and actual two-browser Windows testing are separate gates. RTX 3070 QHD 165Hz with **16GB system RAM**, UE5 and independent realism/asset-rights evaluation remain **unverified**.

## 2026-11-01 PC modifier remapping integrity (R-08 / R-14 / R-23 / R-25)
- **Partial P0 fix candidate:** The shared Windows keyboard remapper no longer accepts bare Ctrl/Alt as action bindings because the gameplay shortcut/IME isolation intentionally filters those modifiers. Older persisted invalid bindings fall back to working defaults while preserving unrelated valid custom keys and sensitivity when fallback keys remain unique; conflicting mappings reset safely to defaults. Bare AltGraph is also excluded even if a browser omits its modifier flags.
- **Regression scope:** New Node tests cover rejected Ctrl/Alt assignments, legacy preferences and an invalid-then-valid remapping interaction. GitHub CI at PR head and real Windows Korean/Arabic IME plus physical keyboard verification remain separate gates. No touch/mobile changes; RTX 3070 QHD 165Hz with **16GB system RAM**, UE5 and full three-mode release remain **unverified**.

## 2026-11-01 PC held-input release on IME/OS shortcut transition (R-08 / R-14 / R-23 / R-25)
- **Partial, CI required:** BR and CH01 clear already held keyboard/mouse movement and fire when a composing/OS chord begins. Team browser sends neutral movement, trigger and capture/aim releases to the authoritative local server rather than leaving intents active. Fresh keydown is required to resume.
- **Evidence:** Three browser-controller regressions. Actual Windows Korean IME, AltGraph, pointer-lock behavior, network latency and RTX 3070 QHD 165Hz / **16GB system RAM** remain unverified. No touch/mobile work.

## 2026-11-01 PC Korean IME and OS shortcut isolation (R-08 / R-14 / R-23 / R-25)
- **Partial, CI required at final PR head:** BR, CH01 and team PC keyboard controllers reject IME composition, dead-key/AltGraph events, legacy Process/keyCode 229 and Ctrl/Alt/Meta chords before gameplay. PC remapping leaves those events untouched; Shift+fire/movement and keyup releases remain enabled.
- **Evidence:** Shared controls and three browser-controller Node regressions. Real Windows Korean IME, RTX 3070 QHD 165Hz with **16GB system RAM**, native UE and latency remain **unverified**. No mobile/touch work added.

## 2026-11-01 CH01 exposed-body sight and physical occlusion (R-02 / R-14 / R-23 / R-28)
- **Partial P0 implementation (PR #198):** CH01 opponents now inspect three finite standing-body silhouette rays rather than requiring an unobstructed centre ray. A shoulder visible beside cover can trigger a bounded 42m direct-sight response, while solid cover, intervening living actors and the facing cone still prevent impossible perception. This shares BR's approximate visibility principle but does not replace the existing finite shot-ray cover check.
- **Verification:** Four new Node regressions cover edge exposure, full concealment, living-body occlusion and deterministic 60Hz replay. GitHub Actions must pass at the final PR head; actual Windows browser gameplay, human AI realism, RTX 3070 QHD 165Hz with **16GB system RAM**, Unreal native build and the full 12-chapter/three-mode release remain **unverified**.

## 2026-11-01 PC team-client bounded HTTP recovery (R-12 / R-14 / R-23)
- **Partial P0 reliability candidate:** The loopback two-client browser UI now caps each HTTP request plus JSON-response wait at 8 seconds, aborting a stalled transport where supported. A stalled state poll can recover, and a stalled sequenced command no longer blocks later PC key/ready commands indefinitely. Existing server authority and 60Hz simulation are unchanged.
- **Evidence boundary:** Two new deterministic DOM/network-mock regressions cover abort, polling recovery and post-timeout sequence advancement. GitHub Actions at the PR head, real Windows two-browser/network-stall behavior, public-internet multiplayer, UE5 native and RTX 3070 QHD 165Hz / **16GB system RAM** remain **unverified**. The timeout does not prove reliable connectivity or public internet security.

## 2026-11-01 local team display-name integrity (R-12 / R-14 / R-23)
- **Partial P0 fix (PR #188):** The two-client loopback lobby now rejects Unicode line/paragraph separators and invisible formatting controls before a player occupies a seat; the displayed Korean/Arabic name is NFC-normalized and trimmed before enforcing its 24-code-unit limit. This closes a text-spoofing/identity-consistency gap without altering authoritative 60Hz gameplay or adding touch work.
- **Evidence boundary:** Three Node regression cases cover direct name rejection, canonicalized Korean text and an HTTP join/state round trip. CI at the final PR head, real Windows two-browser testing, public-internet security and accessibility, Unreal native packaging, three complete modes, RTX 3070 QHD 165Hz / **16GB system RAM** and independent realism evaluation remain separate **unverified** gates.

## 2026-11-01 team lobby pairing consent (R-12 / R-14 / R-23)
- **Partial local-server P0 candidate:** A ready vote made while alone is invalidated when another participant joins. Both players must explicitly ready for the current pairing; existing timeout/departure ready invalidation remains in place.
- **Verification boundary:** New unit and two-client loopback HTTP regressions target the ready-before-join case. GitHub CI at the final PR head and actual Windows two-browser play remain separate gates; internet multiplayer, three complete modes, native UE, realism review and RTX 3070 QHD 165Hz / **16GB system RAM** measurements remain unverified.

## 2026-11-01 shared BR/CH01 finite weapon sight kick (R-13 / R-23 / R-27)
- **Partial gameplay candidate:** Each of seven original firearm classes now produces a distinct bounded upward first-person aim impulse after a valid finite shot; the current shot uses the pre-kick ray and later shots require player correction. Both offline BR and CH01 reuse the same deterministic simulation and persisted pitch, without new ammunition, supernatural hit correction, touch work or checkpoint schema changes.
- **Verification boundary:** Six new Node regressions cover class separation, a long-range second-shot miss, rejected-trigger invariance, pitch bounds, BR replay and CH01 checkpoint continuity. Final-head GitHub Actions and actual Windows mouse feel, accessibility, real weapon reference calibration, UE native build and RTX 3070 QHD 165Hz/16GB frame-time measurements remain separate unverified gates.

## 2026-11-01 team lobby ready-vote seat identity (R-12 / R-14 / R-23)
- **Partial local-server fix (pending PR CI):** When a lobby participant times out or voluntarily leaves, any remaining participant must explicitly ready again before a replacement can start a match. The vote is scoped to the original two-person pairing, not an interchangeable team seat. Existing 60Hz simulation, finite ammunition, loopback-only server and ready behavior for unchanged pairs remain intact.
- **Evidence scope:** New unit regressions for timeout and voluntary departure plus a two-client HTTP test; GitHub CI and actual Windows two-browser manual gameplay are separate gates. Public-internet multiplayer, UE5 native packaging, full three-mode play, RTX 3070 QHD 165Hz / **16GB system RAM** performance, and human realism evaluation remain **unverified**.

## 2026-11-01 team weapon-class authority candidate (R-12 / R-14 / R-20)
- **Partial implementation:** The local two-client 2D server supports three original, finite-ammunition gameplay profiles (carbine, compact, precision), with different shot cadence, damage, range and reload durations. A PC menu selects equipment before ready; the server rejects forged or mid-round changes, preserves chosen equipment through round start and owns ammo transfer. Mixed-profile held-trigger hits resolve together on the authoritative 60Hz tick.
- **Evidence gate:** New Node and browser-client mock regressions plus PR CI; real Windows two-browser play, public internet security/load, native UE, licensed 3D/audio, RTX 3070 QHD 165Hz with **16GB system RAM**, and complete cross-mode class parity are still **unverified**. Values are fictional game abstractions, not actual firearm measurements. The Nov 27 offline browser demo remains P0.

## 2026-11-01 browser vertical aim and marksman sight alignment (R-04 / R-14 / R-23 / R-27)
- **P0 code candidate:** Shared BR/CH01 hits now require the authored ray to cross a finite standing-actor vertical silhouette, with standing and crouched camera origins aligned to the WebGL/Canvas2D view. Far-above/far-below 210m misses still spend one finite round; mouse pitch, 60Hz cadence and saved world pitch remain unchanged. This is a simple fictional hitscan proxy, not measured ballistics or a full skeletal collision model.
- **Range parity:** Marksman-class 185m shots also require low-LOD visibility beyond the old 155m limit; its new 195m silhouette horizon matches the already implemented 270m precision-class horizon without extending ordinary scene geometry.
- **Evidence gate:** New tests cover vertical misses, crouched shot origin, 170m marksman visibility and CH01 save/replay. `npm run verify` and PR CI, actual browser/Windows gameplay, QHD 165Hz RTX 3070/16GB, UE5 native and independent visual realism are separate gates.

## 2026-10-31 precision-class long-range rendering parity (R-04 / R-08 / R-23 / R-27)
- **P0 candidate:** The offline BR and CH01 shared renderer now preserves low-LOD actor silhouettes out to 270 fictional world metres for the precision class (260m authored shot limit), instead of culling physically hittable targets at 155m. WebGL and Canvas2D fallback use the same extended actor horizon; distant brief impact cues follow the visible actor budget while ordinary classes, caches, vegetation and cover culling retain their previous limits.
- **Verification boundary:** New planner, cover, range, fallback and WebGL regression cases require `npm run verify` and GitHub Actions at the PR head. The prototype still has approximate 2D occlusion/fog and no real Windows browser playthrough; this is not measured RTX 3070 QHD 165Hz / 16GB RAM performance, UE5 rendering or commercial-grade photorealism.

## 2026-10-31 team lobby lease reconciliation (R-12 / R-14 / R-23)
- **Partial P0 code candidate:** The loopback two-client authority now prunes expired lobby seats before commands or state snapshots, and expires finished-round seats when a new ready command arrives, even without a 60Hz tick. Completed-round result snapshots remain readable until a new command is issued; late finished-round heartbeats also cannot revive an expired seat, while an explicit leave retains its previous semantics. An expired guest's delayed `ready` cannot start a phantom round or reserve a slot; an active heartbeat-renewed peer may pair with a new guest.
- **Regression evidence:** Six Node tests cover a stale ready command, read-only polling without lease renewal, expired rematch readiness, two-client HTTP seat replacement, and finished-round heartbeat expiry while preserving readable results. This remains a local prototype, not validated public internet multiplayer. Real two-browser Windows play, server soak/security, Unreal native, RTX 3070 QHD 165Hz with **16GB system RAM**, and all three release modes remain **unverified**.

## 2026-10-31 PC pointer-lock cancellation guard (R-08 / R-25 / desktop control P0)
- **Partial P0 candidate:** A pending Windows browser pointer-lock request now checks its cancellation lease before and after the browser permission promise, including the cached standard-lock fallback. A late grant after pause/menu exit is immediately released when the browser exposes the active lock; this prevents a superseded request from reclaiming the player's mouse.
- **Regression evidence:** Three Node tests cover a canceled cached fallback, a late raw-input grant, and a late ordinary-lock grant. This is desktop-browser input integrity, not a verified Windows hardware run. QHD 165Hz RTX 3070 / **16GB system RAM**, real input latency, native Unreal and three-mode release gates remain **unverified**.

# VEILPOINT — User Requirements Traceability (living document)

## 2026-10-31 CH01 hostile direct-sight volley gate (R-02 / R-14 / R-23 / R-28)
- **Partial P0 code candidate:** CH01 human opponents now require their existing bounded 42m direct-visibility check **at the actual scheduled shot**, not the old 48m firing threshold. Hearing or stale search memory may guide movement but cannot authorize a shot beyond current visual range. Finite rounds, cover occlusion and 60Hz timing remain unchanged.
- **Evidence boundary:** New Node regressions check no invisible 43m volley, reacquisition at 40m, checkpoint restore and fixed-60Hz replay. CI and real Windows keyboard/mouse playthrough remain separate gates; UE5, owner RTX 3070 QHD 165Hz / **16GB system RAM**, complete three-mode realism and independent human AI assessment are **unverified**.

## 2026-10-31 browser GPU disjoint telemetry integrity (R-08 / R-10 / R-11 / R-25)
- **Partial P0 candidate:** WebGL2 timer disjoint now invalidates active and pending queries, suppresses new queries until recovery, and resets stale CPU/GPU/RAF telemetry through the renderer-to-BR controller callback. This prevents outdated GPU timing samples from triggering adaptive resolution after a timing discontinuity.
- **Evidence:** Two Node regression cases cover repeated disjoint, active query cleanup, recovery and stale-sample governor guard. Actual Windows RTX 3070 / QHD 165Hz / 16GB tests, GPU measurement and Unreal native performance remain **unverified**.


## 2026-10-31 BR living-actor visual occlusion (R-04 / R-14 / R-23 / issue #15)
- **Partial P0 candidate:** Offline BR visual awareness and fresh gunfire evidence now treat intervening **living actor bodies** as sight blockers, rather than granting exact shooter coordinates through another person. An audible but screened shot still yields only a coarse 2m estimate; fallen actors no longer obstruct sight. One reused actor roster per 60Hz AI step and per shot avoids per-target obstacle allocations.
- **Automated regression:** Node tests cover living-body occlusion, fallen-body visibility, finite ammunition, checkpoint preservation and fixed-60Hz save/replay. This is a browser simulation approximation, **not** measured FPS or fully realistic human vision. Windows PC playthrough, RTX 3070 QHD 165Hz with **16GB system RAM**, UE native build, full three-mode realism and independent visual QA remain **unverified**.


## 2026-10-31 CH01 direct-sight gunfire evidence (R-02 / R-14 / R-23 / R-28)
- **Partial P0 candidate (PR #169):** CH01 now uses one bounded line-of-sight rule for hostile pursuit and reaction to a player shot. An opponent who directly observes the shooter keeps the exact visible location instead of having it overwritten by a rounded acoustic estimate. A turned-away or cover-obstructed opponent retains only a coarse 2m audible clue, not hidden-player coordinates.
- **Regression evidence:** Four new Node tests exercise visible shot evidence with checkpoint persistence, facing-away hearing, solid cover and 60Hz deterministic replay. CI, actual Windows keyboard/mouse play, native UE, full campaign AI realism and RTX 3070 QHD 165Hz / **16GB system RAM** measurements remain distinct gates; no three-mode completion is implied.

## 2026-10-31 CH01 legacy actor-overlap recovery (R-02 / R-14 / R-23 / R-28)
- **Partial checkpoint/realism fix (PR #166):** Restoring a CH01 engagement checkpoint that places the player inside a living hostile's collision body now deterministically selects the nearest collision-free adjacent pose, using the same player/actor/cover collision geometry as live movement. The correction happens **only on restore**; valid poses, fallen opponents and historical v2 saves without hostile positions retain compatibility. This avoids turning a save migration into in-game teleportation.
- **Evidence boundary:** A regression covers corrupt/legacy overlap recovery, deterministic save round-trips and unchanged adjacent saves; the pre-fix PR head failed an existing legacy-overlap regression and was corrected. Full npm run verify at the final commit, Windows browser end-to-end play, native UE collision, 16GB/QHD RTX 3070 benchmarks and the 2026-11-27 demo acceptance remain separate gates.


## 2026-10-31 BR fresh gunfire evidence supersedes stale sound memory (R-04 / R-13 / R-23)
- **Partial AI realism candidate:** Offline BR opponents can react to a newly audible player or rival shot even while older footstep/search memory remains active. A visible shooter yields exact sight evidence; an unseen audible shooter yields only a coarse 2m sound estimate. No ammunition generation, inaudible location reveal or magic tracking.
- **Regression gates:** Three new tests cover hidden gunfire memory refresh with checkpoint/replay, direct-sight precedence and finite rival gunfire refresh. Full `npm run verify`, GitHub CI and actual Windows PC playthrough remain separate gates; human AI-believability assessment, native UE and full release criteria are not claimed complete.


## 2026-10-31 team request termination and malformed display-name guard (R-12 / R-14 / R-23)
- **Partial local-server hardening candidate:** Bounded UTF-8 JSON parsing now rejects an incomplete stream that closes without the legacy `aborted` event, while allowing a normal `end` → `close` sequence. This avoids leaving the local two-client command handler waiting forever for a disconnected request.
- **International name integrity:** The server rejects JSON-escaped isolated UTF-16 surrogate code units but still accepts well-formed emoji, Korean and Arabic. A malformed name must never occupy a competitive slot.
- **Regression gates:** Four additional Node tests cover premature close, normal close, direct lobby rejection and HTTP join rejection. Full `npm run verify`/GitHub CI and real two-browser play remain separate acceptance checks. This is not public-network hardening certification or a completed native multiplayer mode.


## 2026-10-31 team HTTP UTF-8 integrity candidate (R-04 / R-14 / multiplayer P0)
- **Proposed browser/server reliability fix:** The loopback two-client team server now decodes bounded request bodies as complete UTF-8 byte streams instead of converting arbitrary TCP chunks to strings. This prevents fragmented multibyte Korean player names from being corrupted and rejects malformed UTF-8; the 2,048-byte limit and aborted-request handling remain explicit.
- **Name integrity:** Team lobby now rejects control characters, line breaks and bidi/invisible formatting controls without excluding normal Korean, Arabic or emoji text; direct lobby and HTTP regressions cover this UI-spoofing class.
- **Verification:** Four isolated Node parser tests (split Unicode, invalid encoding, byte boundary and abort) plus one HTTP join/state integration regression. CI at the proposed commit and Windows two-browser playthrough are separate gates; this is not public internet security certification, UE native multiplayer, full three-mode QA or RTX 3070 QHD 165Hz/16GB hardware validation.


## 2026-10-31 BR living-actor checkpoint collision (R-04 / R-14 / R-23)
- **Partial P0 candidate (PR #162):** Offline BR autosave and restore now refuse overlapping **living** player/rival footprints; fallen opponents may still occupy the same location. This guards against physically impossible checkpoint resume states without changing the v1 save schema or 60Hz simulation.
- **Regression scope:** Four Node tests for writer refusal, tampered player/rival and rival/rival positions, fallen-actor compatibility and deterministic replay. GitHub CI at the final PR head and actual Windows PC browser play remain required. Native UE collision, realistic full-body physics, three complete modes, RTX 3070 QHD 165Hz/**16GB system RAM** performance and full release gates remain **unverified**.

## 2026-10-31 BR checkpoint boolean restore integrity (R-04 / R-14 / R-23)
- **Partial P0 candidate (PR #161):** Restore now rejects malformed player, rival and loot boolean flags rather than silently coercing them to false. Optional player reload/fatigue flags absent from older v1 saves default safely to false; explicit malformed values fail. This complements the prior autosave-writer parity PR #160 without changing the 60Hz world or save version.
- **Regression coverage:** Four new Node tests for malformed player flags, rival/cache flags, legacy optional flag compatibility and deterministic 60Hz replay. CI at the final PR head is required before merging. Windows desktop browser save/resume, end-to-end demo, UE5 native build, RTX 3070 QHD 165Hz with owner-reported **16GB system RAM**, full realism and release QA remain **unverified**.

## 2026-10-31 offline BR autosave write/read parity (R-04 / R-14 / R-23)
- **P0 reliability candidate (PR #160):** Before overwriting an offline BR checkpoint, the writer now rejects malformed seed/RNG, elimination counts, messages/timers, unsupported effect markers and non-boolean player/loot flags that the restore path would reject or reinterpret. Three Node regression tests cover these cases and a valid effect round trip.
- **Gate remains open:** CI at the final commit, actual Windows browser save/resume/playthrough, 2026-11-27 demo packaging acceptance, native UE, RTX 3070 QHD 165Hz/16GB memory benchmarks and full three-mode realism QA are separate unverified requirements.


## 2026-10-31 PC BR/CH01 rapid-fire responsiveness and save durability (R-02 / R-04 / R-10 / R-11 / R-14 / R-25)
- **Partial browser candidate:** BR 60Hz held-fire checkpoints are limited to one per simulated second **after the immediately saved first manual shot**; CH01 uses a tighter 450ms interval to retain short-mission durability while reducing per-shot writes. CH01 manual shots and encounter completion also save immediately. Explicit pause/pagehide and inventory interactions still flush immediately; regular autosave remains. Ammo HUD/minimap refresh is batched at 250ms while the first shot responds immediately; older shot-feedback timers cannot clear a newer cue.
- **Evidence scope:** Three mocked PC browser regressions check bounded BR/CH01 write counts, final pause-save ammunition parity, BR HUD freshness and feedback-timer ordering. This is an event-count optimization, **not measured frame-time improvement**; actual Windows RTX 3070/QHD 165Hz, 16GB system RAM, GPU/CPU P50/P95/P99, native UE, full realism and 2026-11-27 release acceptance remain unverified.


## 2026-10-31 fictional class range + PC loadout visibility candidate (R-04 / R-13 / R-23 / R-27)
- **Playable browser source:** Seven original fictional weapon classes now have distinct bounded shot ranges (22–260 world metres); the precision class can interact across a clear 210m arena corridor while cover and finite rounds still constrain shots. BR and CH01 use the shared deterministic hit ray, not target-seeking or infinite-distance damage.
- **Player-facing:** Windows-oriented BR and CH01 loadout menus show the current per-class gameplay range and explicitly warn that these are **not real firearm specifications**. This is an abstract zero-asset browser prototype, not ballistic physics or verified native Unreal weapon behavior.
- **Verification candidate:** New Node regressions cover class separation, off-axis misses, cover, ammunition, CH01 objective transition, PC menu/source consistency, and BR save/replay. Source-level V8 smoke confirmed a clear 210m precision hit and CH01 phase progression; Node CI, real-browser playtests and UE/RTX 3070 benchmarks remain unverified.


## 2026-10-31 Windows coarse-pointer input safety candidate (R-03 / R-04 / R-13)
- **PC-only input P0:** Windows devices reporting only a coarse pointer (convertible/touchscreen) now follow the same pointer-lock gate as other desktop hardware in offline BR and CH01. Legacy touch logic remains for non-Windows platforms but cannot bypass Windows gameplay pause/aim ownership. The CH01 coarse-pointer mobile overlay is hidden on Windows.
- **Evidence boundary:** Added Windows-platform classification and two mocked browser end-to-end pointer-lock regressions. This is a proposed code change pending Node suite and GitHub CI; not a measured Windows 165Hz, UE native or human gameplay validation.

## 2026-10-31 offline BR physical spawn-spacing candidate (R-04 / R-23)
- **Code candidate:** Initial seeded BR rivals now reserve non-overlapping physical footprints, and finite ground caches avoid actors and one another. Failed placement raises an explicit error rather than silently spawning at the player's position. No change to the 60Hz simulation clock, checkpoint schema or existing saved positions.
- **Verification:** Seed-sweep regression and save/restore test added. GitHub CI and actual Windows browser playtesting remain required; this is a collision-plausibility fix, not measured rendering/165FPS or native UE validation.

> **Latest owner hardware correction (2026-10-29):** System RAM is **16GB**, not 8GB. Earlier historical references below to an 8GB owner machine reflect superseded assumptions, not the active test configuration. No measured FPS, peak RAM, Unreal compilation or native graphical quality is inferred from this correction.

## 2026-10-30 grounded BR/CH01 placeholder rendering candidate (R-13 / R-23)
- **Visual realism P0:** Browser WebGL no longer creates a floating ring of moving blue pylons; 2D fallback likewise omits the world-space energy-like circle. The authoritative eligibility circle remains legible on the minimap and HUD. Dynamic ammunition/evidence props now rest on the ground rather than hovering and pulsing. This reduces nonphysical geometry but is **not** photoreal PBR or licensed production asset work.
- **Verification:** culling/renderer regression tests should prove zero impossible boundary geometry and grounded props; real Windows browser visibility/readability and gameplay UX need independent checking. Do not interpret a lower geometry count as measured RTX 3070 performance improvement.

## 2026-10-30 BR boundary deadline realism candidate (R-04 / R-23)
- **Playable-rule change:** The offline BR no longer inflicts unexplained periodic health damage merely for crossing a shrinking circle. The displayed match boundary is a competitive eligibility rule: players and opponents outside at the *announced next phase deadline* are disqualified, with no fabricated injury. A proximity/return prompt now includes the remaining phase deadline where applicable. This is an original game abstraction, not a physical weather hazard or a claim of fully realistic battle-royale world design.
- **Verification scope:** deterministic 60Hz deadline/return/health tests and existing checkpoint/browser regressions are required; the checkpoint schema is unchanged because eligibility is derived from the authoritative phase clock and current position. Actual desktop browser playtesting, narrative justification, native UE, independent realism review and full-match release acceptance remain outstanding.

## 2026-10-30 PC BR ammunition HUD readability candidate (R-13 / R-14)
- **Real Chromium smoke evidence (Linux headless, script-injected due sandbox navigation restrictions):** BR and CH01 menu-to-render transitions completed with no page exceptions using a mocked localStorage; a visible BR overlap was found between the large ammunition number and the stress/reload line. The BR ammo HUD now uses a separate compact status row; a repeat screenshot showed legible separated digits/status. This is **not** Windows/RTX 3070 hardware QA, full match completion or a real performance benchmark.
- **Automated regression candidate:** BR DOM controller checks distinct magazine/reserve and status elements before and during reload. CI and native Windows browser acceptance remain separate gates.

## 2026-10-30 offline BR checkpoint write-integrity candidate (R-04 / R-14 / realism P0)
- **Code + regression candidate:** BR autosave now rejects malformed finite magazines/reserves, class capacities, stale reload hesitation, actors embedded in cover, contradictory pickup identities/remaining stock and zone clocks **before overwriting** the previous local save. Tests include a 60Hz deterministic save/restore replay. This is offline checkpoint integrity, not anti-cheat or native browser/hardware QA; the full demo delivery gate remains open.
- **Acceptance remains pending:** the PR's Node regression and GitHub CI must pass, followed by actual desktop browser resume/restart and packaging tests before counting this as a verified release fix.

## 2026-10-30 PC cross-tab control synchronization candidate (R-03 / R-04 / R-13)

- **Partial browser fix:** The shared Windows keyboard/mouse preferences controller used by BR and CH01 now listens for other-tab changes to `veilpoint.desktopControls.v1`, including storage clear. It reloads validated sensitivity, inverted-Y and unique key bindings, cancels pending rebinding and releases held fire/movement through the existing game callbacks. Team client already had its own storage listener; this does not add touch support.
- **Evidence boundary:** Node mocked-DOM regressions check remote remap, old-key invalidation, held-input release, UI refresh, duplicate/unrelated event filtering and reset on storage clear. GitHub CI must pass at the final branch SHA; real Windows browser, pointer lock, Unreal engine and RTX 3070 QHD 165Hz/16GB performance remain unverified. Strict realism issue #15 and the 2026-11-27 demo gate remain open.

Updated 2026-10-30. Status labels are evidence-based: **Implemented**, **Partially implemented**, **Planned**, **Blocked / unverified**. A requirement being described in a document is *not* its implementation.

| ID | Owner requirement | Priority | Acceptance evidence | Evidence-based current state |
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
**2026-10-31 R-12 lifecycle candidate:** Authenticated `/state` and localhost `/health` now reconcile expired server-owned player leases before reporting match phase even if the 60Hz timer is delayed. State reads never renew leases or advance combat ticks. Five new unit/HTTP regression cases cover single/both-client expiry and live heartbeats; CI, real browser, packet loss and UE server remain separate gates.

| R-12 | Server-authoritative multiplayer fairness/security | P0 | Real dedicated-server build, invalid input tests, reconnect & packet-loss testing | **Partial candidate:** Node localhost server owns movement, cover collision, finite forward-facing opponent visibility, contest/score and lifecycle with 60Hz pure rules; two independent HTTP clients tested, sequence replay and score/teleport/facing injection rejected. Candidate adds server-owned cover-aware hits (including actual shot-ray contact and exposed-edge visibility), cadence, finite ammunition/reload, no client-authored damage, and end-of-round incapacitation tests. Tab-scoped guest resume and heartbeat lease implemented; local HTTP candidate also validates exact origin scheme/host/port, rejects malformed origins and caps JSON bodies by UTF-8 bytes. DOM/HTTP regression candidates are not real-browser or public-network QA. No public security audit, latency/packet-loss test, persistent accounts or UE dedicated server. |
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

| R-25 | Owner-reported **RTX 3070 + QHD 2560×1440 165Hz + 16GB system RAM** (corrected from 8GB on 2026-10-29), with **AMD mobile '9-series' CPU (SKU unknown)** | P0 test environment | Verify actual OS-installed RAM, identify CPU/GPU variant and laptop TGP when benchmarking becomes available; record QHD output/internal scale, real FPS 1%-low, P50/P95/P99 CPU/GPU/frame intervals and memory/VRAM usage; do not block gameplay development pending CPU details | **Owner report updated; not benchmarked.** 16GB improves memory headroom vs the previously reported 8GB, but is below UE5's recommended 32GB development RAM. QHD 165FPS is still unverified. See GRAPHICS_PROFILES.md |
| R-26 | 16GB system-RAM compatibility, finite memory use and honest performance reporting (supersedes former 8GB owner assumption) | P0 | Verify packaged run, loading, peak working set, commit/paging and asset streaming with 16GB system RAM; measure VRAM separately and test OS headroom. Do not treat a former 8GB planning target as a measured game requirement | **Not benchmarked / owner PC not connected**; memory test procedure updated in GRAPHICS_PROFILES.md |

| R-27 | Distinct original firearm classes and stress/fatigue-linked, recoverable reload mistakes across all three modes (issue #20) | P0 gameplay | Actually playable class-specific handling and animation/audio, finite inventory, predictable feedback, accessibility, checkpoint migration, 60Hz deterministic tests and authoritative server verification | **Partial candidate**: deterministic exertion/injury stress, recoverable reload hesitation, H/touch accessibility assist, BR/CH01 UI and checkpoint regression; **seven fictional class profiles in BR and CH01 browser code candidate** with selectable start loadout, distinct finite magazine, cadence, damage, movement and synthetic cue, CH01 class-specific reload and legacy checkpoint migration; production-quality models/animation/recorded audio for seven classes, **team prototype has one finite-ammo authoritative weapon (not class diversity)**, production online inventory and real-browser QA remain unimplemented/unverified |

| R-28 | **Causally coherent 12-chapter narrative:** credible fictional deployment mandate and inter-agency limits, character motives, dated evidence and uncertainty, travel/injury/equipment continuity, foreshadowing/payoff, consequential player choices and independent narrative QA | P0 story | Playable scene consequences, checkpoint/route consistency tests, chapter timeline and independent plausibility reviews | **Partial CH01 candidate (2026-10-28):** fictional civilian evacuation authorization and distinct NIS information roles appear in browser briefing; 04:07/04:12 records remain explicitly uncertain; evidence-verified branch authorizes a finite-duration sliding east checkpoint gate; collision and WebGL dynamic geometry follow the same live world obstacle and restore from saved elapsed time/authorization. A person in the travel path pauses clearance rather than being displaced. This is a browser-code candidate pending CI and human visual QA. Remaining 12 chapters, timeline, human narrative QA and native cinematic playtest are unimplemented/unverified. |

## 2026-10-30 Windows PC team input ownership (merged PR #135)

- **R-03 / R-13 — tested browser-client improvement:** Team-mode form/button focus now explicitly releases held server-owned movement, objective capture, fire and pointer aim. In-page focus changes do not trigger a window blur, so waiting for the server's input lease previously allowed unintended continued actions.
- **R-03 / R-13 — tested shared PC preferences:** Team-mode tabs now consume `storage` changes to the shared desktop keymap, release old held commands and refresh visible key labels; remapped movement/fire take effect without reloading. No new mobile/touch work was performed.
- **Evidence:** [PR #135](https://github.com/bjw05099-design/veilpoint-battle-royale/pull/135) merged at commit `817b073e346f1d4bc807ae0945f75526b3238b45`. [PR CI](https://github.com/bjw05099-design/veilpoint-battle-royale/actions/runs/40995436684) and [push CI](https://github.com/bjw05099-design/veilpoint-battle-royale/actions/runs/40995431268) succeeded: Node tests **448/448**, syntax, UE descriptor JSON and reproducible offline ZIP/checksum validation. These are mocked DOM/two-client tests, **not** a human Windows browser test, UE native compilation, public multiplayer validation or 165Hz hardware measurement.
- **Status:** Partially implemented; the three required modes, realism audit issue #15, full 12-chapter story and independent performance/playtesting remain open.

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
- **Verification boundary:** PR #52 must pass `npm run verify` and GitHub CI before merge. Real target RTX 3070/QHD 165Hz, owner-reported 16GB RAM, Unreal compilation and production network stability are unmeasured.

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
- **Still open:** issue #15 strict realism audit across all three modes, CH01/full campaign, real BR browser smoke, production multiplayer, licensed assets, UE native compile, and owner RTX 3070 QHD 165Hz/16GB system-RAM measurements. No release gate is declared complete.

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
- **R-02 / R-21 / R-22 / R-24 / R-27 / R-28:** no new full-story chapter, PBR asset, native UE build, complete firearm family or independent narrative playtest is claimed by this work. **R-08 / R-25 / R-26:** RTX 3070 / QHD 165Hz / owner-reported 16GB system RAM remain unbenchmarked. The 2026-11-27 offline demo gate and 2027-04-27 aspirational final release gate remain open.

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

## 2026-10-29 CH01 checkpoint shield-field retirement candidate

- **R-02 / R-23 — partial code candidate:** Newly serialized CH01 v2 checkpoints omit the obsolete `player.shield` property. Older v2 checkpoints with the legacy numeric shield field still load for compatibility, but their shield value is discarded and never appears in the live player or subsequent saves. Unknown/invalid shield values remain rejected. The fixed-60Hz mission, health, ammunition, firearm selection and checkpoint version remain unchanged.
- **Verification boundary:** Local isolated JavaScript checks passed for serialization and legacy migration; full Node regression/CI is required before merge. This does not resolve BR's artificial shrinking damage zone, human browser/UE QA, 12-chapter completion, photoreal assets or measured QHD 165Hz performance.

## 2026-10-29 CH01 quiet-traversal checkpoint reliability candidate

- **R-02 / R-10 / R-21 / R-23 (partial browser integration):** CH01 now attempts an offline checkpoint every five seconds of *active 60Hz simulated play* even when the player only moves or waits, preserving actual pose, fatigue and route progress across refresh. Existing immediate saves for interactions, finite hostile shots, injury and route clearance remain intact; pause/background frames cannot trigger periodic writes. Restart resets the deadline. Browser-controller tests verify restore, write cadence, pause and restart. This is a bounded crash-loss mitigation, not guaranteed persistence when browser storage is denied or a real-device end-to-end playtest.
- **Remaining:** Actual browser/mobile crash/refresh QA, localStorage quota/failure UX, UE native saves, all-mode persistence and final demo release sign-off are unverified. CI must pass before merge.

- **R-10 / R-21 (storage failure visibility, partial):** If offline checkpoint storage is unavailable (e.g. browser privacy restriction or quota), CH01 now exposes an accessible warning in the objective HUD and pause menu instead of silently implying progress was saved. A later successful save clears the warning. Mocked browser storage-failure/recovery regression added; real browser storage-denial and accessibility screen-reader tests remain outstanding.

## 2026-10-29 BR offline checkpoint/resume candidate (R-04 / R-14 / R-23 / R-27)

- **Partially implemented, not release-accepted:** BR now serializes the active fixed-60Hz match including PRNG state, living opponents, finite rounds/reloads, partial caches, injury, zone clock and effects. A separate `veilpoint.brCheckpoint.v1` localStorage key cannot overwrite CH01 progress. The player explicitly chooses **resume saved match** or **new match**; pause/pagehide and bounded 15-second simulated-time intervals persist progress, with earlier saves after meaningful actions and damage. Terminal win/loss clears the save; storage failure is visible without halting offline play.
- **Realism/migration guard:** restore validates finite coordinates, resources, actors, loot, timing and zone continuity; obsolete/injected shield and arbitrary object keys are not serialized or restored. No automatic ammunition, health, shield or bot regeneration is introduced. Invalid saves are discarded and a fresh match remains playable.
- **Evidence scope:** new `tests/br-checkpoint.test.cjs` and `tests/br-checkpoint-browser.test.cjs` cover deterministic replay, inventory conservation, refresh/pause/new-match, corrupt saves and quota failure in Node/DOM stubs. Actual desktop/mobile browser, persistent-storage restrictions, GPU/UE and user hardware acceptance remain **unverified**. This does not close issue #15 or the 2026-11-27 release gate.

## 2026-10-29 BR cover-navigation and rival-footstep candidate

- **R-04 / R-13 / R-23 — partial browser AI:** When a BR rival is physically blocked by cover, it attempts a collision-bounded sidestep at its existing walking speed instead of repeatedly walking into the obstacle. This is a deterministic local movement fallback, not full pathfinding or measured human locomotion.
- **R-04 / R-23 — partial grounded perception:** Moving rival opponents now produce short-range footsteps that other rivals can investigate at rounded last-heard positions, using the existing cover-attenuated hearing check. Sound cannot authorize a shot, disclose a hidden opponent's live position or create ammunition. New Node regressions cover cover traversal, near/far hearing and 60Hz replay.
- **Acceptance still open:** This code candidate requires GitHub CI at the final head, real-browser playtests, acoustic/animation quality review and a complete realism audit. The arbitrary shrinking damage boundary remains a release-blocking P0 under issue #15; this change does not claim a finished BR, online match, UE renderer or RTX 3070 QHD 165Hz measurement.

## 2026-10-29 BR browser sound accessibility candidate

- **R-13 / R-14 — partial:** The offline BR browser now exposes an explicit persistent effect-audio checkbox and M keyboard toggle. Muting prevents lazy Web Audio creation without blocking finite shots, desktop/touch input, HUD or messages. Browser DOM regression covers toggling, persistence and touch/keyboard parity.
- **Not verified:** Real browser audio playback, assistive technology, production-quality sound assets, spatial audio, UE integration or device latency. Existing synthetic cues remain temporary and must not be described as realistic recorded weapon sounds.


## 2026-10-29 offline BR input and checkpoint integrity candidate

- **R-02 / R-13 / R-14 — partial candidate:** Starting a fresh BR match or resuming a local checkpoint now explicitly neutralizes held keyboard/sprint and orphaned touch-stick/look input. The existing 60Hz world continues only from fresh input after restart; browser-mock regression covers lost keyup/pointerup and fresh movement.
- **R-02 / R-23 — partial candidate:** BR restore rejects player, opponent or loot positions embedded in authored solid cover/outside playable bounds, and rejects elimination totals exceeding actually defeated rivals. It preserves legitimate rival/zone deaths without fabricated player kill credit. This is local save integrity, **not** multiplayer anti-cheat.
- **Verification boundary:** Proposed Node/DOM tests and GitHub CI must pass; real-browser human launch, RTX 3070 QHD 165Hz, Unreal build and independent realism evaluation remain unverified.


## 2026-10-29 BR desktop pointer-lock pause candidate

- **R-13 / R-14 / R-23 — partial candidate:** Escape or external pointer-lock loss now opens the existing explicit-resume pause and clears held input, rather than leaving live opponents advancing while desktop aiming is unavailable. Browser DOM regressions exercise both native lock-loss ordering and a delayed pointerlockchange event; touch controls and the 60Hz fixed-step clock remain unchanged.
- **Verification boundary:** GitHub Node/DOM tests and CI are required. Actual desktop Escape/pointer-lock behavior, device focus changes and GPU rendering are still pending human browser QA.

## 2026-10-29 BR + CH01 desktop input-availability gate (R-02 / R-04 / R-13 / R-14 / R-23)

- **Partial browser implementation; real-device QA pending.** BR and CH01 now block the 60Hz world and player-authored gameplay while desktop pointer lock is absent/pending or the document is hidden. Both preserve finite-resource checkpoints and show an explicit-resume menu on denied, missing or throwing pointer-lock APIs; pagehide pauses before bfcache. The BR controller also rejects stale asynchronous permission errors and blocks actions before delayed pointerlockchange/visibility events. Ten added Node/DOM-VM regression cases cover these conditions across both modes; CI and real browser permission testing are separate gates. No change to story canon, UE compile, online authority or QHD 165Hz performance claims. R-14 and R-23 remain open.

## 2026-10-29 server-authoritative natural coastal mist candidate (R-03/R-06/R-12/R-23)

- The **localhost-only 2D team prototype** now models a public, tick-driven coastal-mist warning, visibility reduction and clearing phase; both players receive the same event, with server-owned line-of-sight limits. Mist neither harms players nor reveals opponents; no client can supply weather state. The one-time passing-mist timeline is an accelerated **test abstraction**, not a realistic meteorological duration.
- Added deterministic 60Hz replay/round-reset, anti-spoof, HTTP two-client and browser-DOM presentation regressions. This is only a small Signal Weather foundation; dynamic UE atmosphere, independent human playtests, real-world meteorological fidelity, production multiplayer, and all offline BR/campaign weather integration remain **unverified/unimplemented**. Issue #15 remains open.

## 2026-10-29 — gradual server-authoritative coastal mist candidate

- **R-03 / R-06 / R-12 / R-23 (partial, local team prototype only):** Signal Weather now transitions its symmetric, server-owned sight range continuously from 14m to 9m during the incoming phase and back during clearing. Previously visibility jumped instantly at phase boundaries, despite the weather cue. The two-client UI shows the same approximate sight range and gradually tints the procedural 2D arena; no client-authored weather, automatic damage, omniscient opponent reveal or ammunition change is introduced.
- Fixed-60Hz transition/boundary tests and DOM two-client regressions cover the gameplay-facing change. This is not physical volumetric fog, measured meteorology, native UE rendering, a public multiplayer service or real-browser/GPU performance verification. The 2026-11-27 offline demo and final three-mode release gates remain open.

## 2026-10-29 local team mist / automatic-combat consistency candidate

- **R-03 / R-06 / R-13 / R-23 — partial implementation:** The 2D team server's aim-cone auto-hit check now uses the same gradually changing, server-owned coastal-mist sight range as both players' opponent snapshots. Previously a hidden 11m opponent could still be automatically hit inside the 12m fire range. Shots outside current sight still consume finite ammunition; sight and damage remain server-owned and deterministic at 60Hz. Regression covers the exact 480/481 tick boundary, both teams, clearing weather, close-range shots, ammo conservation and replay.
- **Unverified:** This is an intentional limitation of the prototype's automatic target resolution, **not** a claim that real bullets cannot strike unseen targets. Native projectile/occlusion simulation, real-browser multiplayer playthrough, hardware frame-time measurement, Unreal build, photorealism and public online service remain release-blocking gates.

## 2026-10-29 — correct sight/shot separation in local 2D team candidate (PR #100)

- **R-03 / R-06 / R-13 / R-23: partial, not native ballistics.** The earlier 12m firing cap and 14m clear-weather opponent-disclosure range are prototype constants, **not** real firearm effective ranges. The server-owned shot query now checks a narrow directional ray against the opponent's 2D body radius and solid cover across the small test arena; the 250m query ceiling is only an arena-safe bound, **not** a measured weapon performance specification. Coastal mist restricts opponent disclosure, **not** physical hit resolution. Hidden hits do not return omniscient hit confirmations. Fixed-60Hz replay, finite ammunition, aim offset, cover and 480/481 weather boundary have regressions. The existing finite-ammo reload test now deliberately keeps its opponent outside the ray so the match cannot end before the inventory assertions.
- **Verification status:** GitHub CI must pass at the final PR head; two real browser clients, full visual smoke occlusion, physically measured trajectories, human fairness assessment, 165Hz/QHD hardware and UE compilation are **not verified**. The remaining 14m clear-weather disclosure limit is still a constrained prototype visibility rule, not a physically realistic open-air sight distance; full scene/occlusion modelling remains a release P0. This supersedes the preceding entry claiming mist must stop a shot.

## 2026-10-29 — arena-wide clear-weather visibility candidate

- **R-03 / R-06 / R-13 / R-23 — partial localhost 2D prototype:** clear-air opponent disclosure now covers the bounded 48m × 48m test arena (80m query bound exceeds its diagonal), rather than inexplicably hiding unobstructed actors beyond 14m. The 120° facing field and solid-cover checks remain server-owned. Dense coastal mist still reduces disclosure to 9m, with deterministic fixed-60Hz gradual transitions; directional shot collision and finite ammunition remain independent of mist. The browser's procedural tint follows the new transition scale. Regressions cover 30m clear-air visibility, dense-mist concealment without a bullet barrier, transition thresholds, two-client weather text and replay.
- **Evidence limit:** Neither 80m nor 9m is a measured human detection range or a weapon specification. This is a small 2D test arena with accelerated weather, not volumetric atmospheric optics, native ballistics, production multiplayer, actual firearm effectiveness or real-browser/hardware QA. PR CI must pass at final head. Full realistic visibility modelling remains a release gate.

## 2026-10-29 BR terminal placement and oversized-checkpoint protection candidate

- **R-04 / R-14 / R-23 — partial implementation:** The offline BR result overlay now distinguishes *survivors remaining* from the eliminated player's actual finishing place. A loss ranks behind surviving rivals (minimum second place), and only a won match can report first. This fixes misleading terminal feedback without altering fixed-60Hz gameplay, bot health, ammunition or score authority.
- **R-04 / R-14 — partial stability improvement:** The BR checkpoint serializer and parser enforce a bounded 65,536-character save size; a malicious/corrupt oversized browser-storage string is rejected before JSON parsing. The previous deterministic PRNG/finite-resource round-trip and maximum 20-rival saves remain supported.
- **Verification boundary:** Isolated V8 source and DOM-mock regressions passed; full Node CI, actual browser playthrough and final release acceptance must still be independently verified. The BR shrinking damage boundary remains an open realism P0 under issue #15; UE5 native compilation, QHD 165Hz GPU/CPU timing and photorealism remain unverified. The owner-reported system RAM is **16GB**, not 8GB.

## 2026-10-29 offline critical-path 60Hz integration candidate

- **R-02 / R-04 / R-14 / R-21 / R-23 / R-28 — partial test evidence:** `tests/offline-critical-path.test.cjs` drives real deterministic simulation movement and finite shots through both CH01 endings, verifies records/choice consequences, moving-gate clearance and mid-action checkpoints; it also runs a one-opponent BR victory with identical resume replay and a full-size BR loss with correct placement. No test teleports the player, grants ammunition or heals injury.
- **Evidence limit:** Isolated V8 test execution passed; GitHub Node CI and reproducible ZIP verification are required before merge. This is not an actual human/browser start-to-finish playthrough, UE5 compile, completed 12-chapter campaign, public authoritative multiplayer, measured RTX 3070/QHD 165Hz rendering or an independent narrative plausibility review. System RAM baseline remains owner-reported **16GB**.


### 2026-10-29 boundary warning and ammo-display candidate

- **R-04/R-13 (partial, not signed off):** BR now derives near/outside HUD warnings from the live zone radius, preserving reload and other event feedback; initial ammo label reflects 12 loaded / 36 reserve rounds rather than a misleading 48 / 60 display. Fixed-step simulation and DOM-mock tests were added, pending CI and human browser QA.
- **R-23 (P0 still open):** This is a transparency and usability improvement only. The existing arbitrary shrinking circle with direct health loss is **not** physically credible merely because the boundary is announced. A believable, tested BR play-area mechanism remains a mandatory realism redesign before release.


### 2026-10-29 browser graphics diagnostics (partial R-08/R-10/R-11)

The browser graphics settings panel now reports per-window sample counts and P50/P95/P99 for CPU draw time, supported WebGL2 GPU timer queries and render callback intervals. Unsupported GPU timing is explicitly unavailable. This is a **code-level diagnostic candidate**, not measured QHD RTX 3070/16GB owner-PC performance, actual monitor presentation, 1%-low FPS, end-to-end latency, Unreal native rendering or proven 165FPS. Keep R-08/R-11 hardware acceptance **unverified**.

## 2026-10-29 — local team touch aim lifecycle candidate (PR #107)

- **R-03 / R-06 / R-14 / R-23 — partial browser input fix:** In the localhost two-client prototype, lifting or canceling the originating touch pointer now sends an explicit `aimRelease` rather than indefinitely refreshing the server's 90-tick aim lease. A second touch pointer cannot steer or release the first gesture. This restores keyboard/touch movement-facing after a canceled aim and does not alter server-owned hit validation, 60Hz simulation or ammunition.
- **Regression evidence:** DOM/network tests cover finger lift, OS cancellation, unrelated fingers, no stale aim renewal and resumed movement-facing. GitHub CI at the PR head is required; actual touch-device/browser playthrough, public multiplayer security, full realism and Unreal hardware testing remain **unverified**.

## 2026-10-29 PC-only input priority and shared control candidate (R-13 / R-14 / R-25)

- **Owner scope (binding):** Windows PC keyboard/mouse first-person gameplay only. Mobile/tablet/touch are not required targets and new touch UX/regressions are not planned. Existing touch code is left in place only while it does not interfere with PC. The owner-reported hardware baseline is RTX 3070, **16GB system RAM**, QHD 2560×1440 165Hz; exact CPU/GPU variant and actual performance remain unverified.
- **Browser implementation candidate (partial):** BR and CH01 load a shared, local-only PC control profile. The menu/settings expose persistent 0.25–3.00× mouse sensitivity, invert-Y, remappable movement/fire/reload/interact/sprint/crouch/assist/support keys, collision/reserved-key rejection, Escape-to-cancel, defaults reset and best-effort fullscreen request. Existing WASD/arrow movement and fixed-60Hz gameplay defaults remain; campaign saves and BR checkpoints are separate from control preferences. A remapped support key is active only in CH01; the local 2D team prototype does not yet use the shared control UI.
- **Validation required:** New pure Node tests and BR/CH01 DOM/controller regressions are added; run `npm run verify` and PR CI. Actual desktop browser fullscreen/pointer-lock, key-layout/accessibility and mouse-feel QA remain unverified. UE native input settings, OS fullscreen/QHD refresh, RTX 3070 frame pacing, public team multiplayer and final 12h campaign remain **unverified or unimplemented**, not completed by this browser feature.

## 2026-10-29 — PC keyboard consistency across all three browser prototypes (candidate)

- **R-03/R-13/R-14/R-25 — partial implementation:** The localhost two-client 2D team proof now reads the same saved PC keyboard profile as BR and CH01. Remapped movement, capture/interact, fire and reload keys issue server-authoritative commands; the legacy F fire alias remains only with the default Space binding and only if F has not been assigned another action. An allowlisted static route serves the shared input module. Player-name typing no longer triggers gameplay or blocks spaces. BR/CH01 ignore OS key-repeat for discrete controls, preventing accidental assist/audio/graphics toggles while preserving the existing firearm cooldown for repeated fire.
- **Verification boundary:** Node DOM/network and HTTP regressions are added; GitHub CI and real desktop-browser/two-client input tests must pass before acceptance. The team proof remains 2D, not a finished PC FPS. The pending authoritative cover-edge fix tests ray contact against walls and samples visible actor silhouettes; Node CI is required, and full 3D occlusion/real desktop playtesting remain unverified. Windows fullscreen, QHD/165Hz frame pacing, 16GB system RAM behavior and Unreal native input remain unverified. Mobile/touch development is out of scope.

## 2026-10-29 P0 candidate: PC UI focus and BR physical shot-ray consistency

- **R-04 / R-23 / R-27 — partial candidate:** Offline BR player shots now resolve a fixed 0.85-unit actor footprint and the first contact along the actual facing ray. Distance-based target magnetism and center-to-center wall-edge penetration are removed from this prototype hit test. Finite rounds, shot cadence, cover and deterministic 60Hz gameplay remain in force; geometry remains a 2D approximation rather than measured ballistics, UE collision or human-verified weapon realism.
- **R-13 / PC-only input — partial candidate:** Shared desktop controls reject gameplay keydown events when a form/menu element owns focus across BR, CH01 and the local team client; keyup still releases held team input after focus changes. Keyboard capture for remapping remains available. No new touch feature or touch-only regression is in scope.
- **Validation gate:** Run Node simulation, browser-controller and multiplayer regressions plus GitHub CI. The owner's RTX 3070, QHD 165Hz, **16GB system RAM**, real-browser pointer lock, Unreal build and photoreal quality remain unverified.

## 2026-10-29 P0 candidate: BR opponent shots resolve physical contact

- **R-04 / R-23 — partial candidate:** BR rival shots now use a bounded, skill-dependent aim deviation and the same finite actor-radius ray-contact principle as player fire, rather than awarding damage from a target-independent success roll. Solid cover and intervening actors block the actual shot segment; off-axis misses consume finite ammunition and still produce audible events. Node 60Hz tests cover misses and wall-edge occlusion. This remains 2D simplified simulation, not validated UE physics, actual firearm ballistics or human playtest.

## 2026-10-29 P0 PC hybrid pointer-lock regression (R-13 / R-14 / R-25)
- **Partial implementation candidate:** BR and CH01 browser controllers now treat a coarse-primary Windows hybrid as a PC mouse device when `(any-pointer: fine)` matches. This prevents touchscreen presence from bypassing required pointer lock, allowing unguarded keyboard firing and untracked mouse aim. Legacy touch-only fallback remains unchanged, without new touch development.
- **Verification:** Node DOM-mock regression scenarios exercise coarse+fine hybrid lock pending, keyboard/mouse gating and aim recovery. GitHub CI and actual Windows convertible/fullscreen/QHD hardware validation remain required; RTX 3070 165Hz and 16GB system-RAM performance remain unverified.

- **PC pending-capture recovery (R-13 / R-14):** BR Escape now pauses an active session even while the browser has not granted pointer lock; focused launch controls cannot trap the player behind a pending permission prompt. DOM regression verifies no 60Hz advancement while suspended. Requires CI and real Windows browser QA before acceptance.

## 2026-10-29 CH01 hostile physical contact ray (R-04 / R-23)
- **Partial implementation candidate:** CH01 human opponents now spend finite ammunition on a deterministic spread ray with player-body contact and intervening-cover checks. Replaces the post-fire hit-probability roll, preserving 60Hz checkpoint replay and movement-dependent stability. Offset-cover regression distinguishes center visibility from actual shot-ray obstruction. This remains a 2D game approximation, not measured ballistics or native UE collision.
- **Acceptance:** `npm run verify`, GitHub CI and browser visual QA required. Broader combat animation, AI judgment, photoreal quality, 165Hz target-PC measurement and all 12 chapters remain unverified.

## 2026-10-29 Windows PC gameplay-focus and discrete-input candidate

- **R-13 / R-14 (partial):** BR and CH01 now explicitly move keyboard focus from a Start/Resume menu button to the first-person canvas before requesting desktop pointer lock. This prevents a hidden focused button from swallowing Space/arrow input or activating native button actions. A refused focus request is nonfatal and does not bypass pointer-lock safety.
- **R-10 / R-13 / R-23 (partial):** OS key-repeat events no longer generate extra shots or one-shot gameplay actions; finite ammunition is spent only on actual discrete keydowns/clicks. Any future continuous automatic fire must use fixed 60Hz gameplay rules, not OS repeat frequency. Browser DOM-mock tests cover focus and finite rounds; real Windows keyboard/mouse, QHD 165Hz input latency, Unreal and human playtests remain unverified. Touch-only functionality is not a new development requirement.

- **R-03 / R-13 PC team follow-up:** The localhost team prototype now moves keyboard focus from Ready to the arena once on the server-authoritative transition into playing. Lobby name entry and subsequent intentional UI focus remain untouched. A mocked two-client round test checks this transition and movement command; this is not a native first-person multiplayer or real-browser certification.

- **R-03 / R-12 / R-23 follow-up:** Team browser client now discards held keys at any authoritative round-phase transition. An un-released lobby/previous-round key cannot generate movement or capture in a new round without a fresh keydown; DOM/server regression verifies fresh-input recovery. This is a deterministic client lifecycle fix, not production netcode or measured keyboard latency.

## 2026-10-30 — PC-only team phase transition input safety candidate

- **R-03 / R-12 / R-13 / R-23 (partial):** The localhost two-client PC controller discards lobby-held objective-capture intent on every authoritative phase transition. A keyboard OS auto-repeat after that transition cannot resurrect pre-round movement or capture; only a fresh keydown is accepted. Server-owned capture, score, and ordinary post-start input remain unchanged.
- **Verification boundary:** Two deterministic simulated-browser regressions cover held E, OS key repeats, and fresh keydown recovery. Final GitHub CI and two real Windows browser clients remain required. No mobile/touch work was added; this does not establish production internet multiplayer, native UE, photorealism or QHD 165Hz performance.

## 2026-10-30 — server-owned fair simultaneous disconnect result candidate

- **R-03 / R-12 / R-23 (partial):** Before any 60Hz actor update, the localhost team authority checks both connection leases together. If only one player times out, the connected side wins; if both time out, the round ends without awarding a fictitious winner. The PC result HUD explicitly reports no winner. Existing ready/replay flow is retained.
- **Verification boundary:** Deterministic rules and simulated PC browser HUD tests are added; GitHub CI and real two-browser sessions remain separate acceptance gates. This does not establish production multiplayer uptime or native UE verification.

## 2026-10-30 — PC held-trigger candidate (R-13 / R-21 / R-23)

- **Partial implementation, not a final weapon model:** BR and CH01 browser PC keyboard/mouse input can hold the trigger for fictional carbine, compact and support classes. The first press fires immediately for PC input responsiveness; subsequent held automatic shots advance on fixed 60Hz simulation steps, with existing per-class cooldown, finite magazine, reload, damage and mission transitions. Precision/marksman/shotgun/sidearm remain discrete fire; keyboard OS repeats do not generate extra shots. Pause, focus loss and pointer-lock loss clear held input.
- **Verification boundary:** Pure simulation/CH01 replay, save continuity and static PC integration regressions are provided. Real Windows pointer-lock/mouse playtests, audio mix, full weapon animations, server-authoritative automatic team combat, Unreal compilation and QHD 165Hz frame-time tests remain **unverified**. No new touch functionality was developed.

## 2026-10-30 — PC dual-trigger held-fire correction (merged PR #122)

- **R-04 / R-13 / R-14 / R-21 / R-23 — browser implementation:** The shared PC control layer now tracks keyboard and primary-mouse automatic-fire holds independently. Releasing one physical trigger cannot incorrectly cancel the other. BR and CH01 both keep immediate first-shot feedback and existing fixed-60Hz fire cadence, finite magazines, cooldowns, reloads and pause/background/remap input reset. This corrects a specific controller regression rather than adding a new weapon class or finishing the combat system.
- **Verified automated evidence:** Three new Node/DOM-mock regressions cover the shared latch, simultaneous BR keyboard/mouse holds and CH01 keyboard/mouse holds, including either release order and pause cleanup. GitHub Actions workflow [40927632409](https://github.com/bjw05099-design/veilpoint-battle-royale/actions/runs/40927632409) completed successfully for PR #122; syntax checks, deterministic tests, Unreal descriptor validation and reproducible offline ZIP verification were green. The Unreal *descriptor* check is **not** an Unreal compilation or playable packaged UE game.
- **Still open:** Real Windows keyboard/mouse and 165Hz input-latency playtests, RTX 3070 QHD 2560×1440 performance with owner-reported **16GB system RAM**, native UE compilation, human campaign QA, physical realism of the BR shrinking damage zone, server-authoritative automatic team fire and complete three-mode release acceptance. PC-only scope remains binding; no new touch feature or touch regression was added.

## 2026-10-30 — PC saved-BR focus and Custom graphics selector (PR #124)

- **R-08 / R-13 / R-14 / R-23 — partial browser fixes:** Restoring a saved offline BR match now moves keyboard focus off the Resume button and onto the first-person canvas before pointer lock, matching new-match and ordinary-resume paths. This prevents a focused menu button from consuming the first Space/arrow input after a checkpoint reload.
- **R-08 / R-25 — partial browser settings fix:** Selecting the BR `Custom` graphics profile now actually activates and persists Custom mode while retaining the independently selected frame cap, internal render scale, vegetation and effects. Changing a single control still preserves the others.
- **Regression evidence gate:** DOM-mock tests cover saved-match blur/refresh/focus/finite first shot and Custom selection/persistence/independent editing. Require `npm run verify` and GitHub Actions at the final PR SHA before merge. Real Windows pointer lock, QHD 2560×1440 at 165Hz, RTX 3070 with owner-reported **16GB system RAM**, Unreal compilation and image quality remain **unverified**. No mobile/touch feature was added.

## 2026-10-30 — authoritative PC team held-trigger prototype (R-03 / R-12 / R-13 / R-23)

- **Partial implementation candidate:** The localhost two-client 2D team authority now accepts a strictly validated `trigger {active:boolean}` intent and advances repeat shots on its own fixed 60Hz tick. The first PC keyboard press still uses the existing one-shot command for immediate feedback; subsequent shots share the same server-owned finite magazine, reload, rate limit, cover ray, damage and round-end rules. The client renews held intent while focused and releases it on keyup/blur; the server expires an abandoned intent after 90 ticks without accepting heartbeat/state polling as renewal. Phase changes and reconnect cleanup clear the held trigger.
- **Regression evidence:** Added isolated server tests for 60Hz cadence, finite ammunition, command injection/replay rejection, missing-keyup expiry, hit/round termination, plus a two-client simulated-browser keyboard/blur test. Require green `npm run verify`, reproducible demo packaging and final PR-head GitHub CI before merge.
- **Still not complete:** This is a bounded 2D team test rig, not production first-person online netcode, realistic ballistics or all weapon classes. Native Unreal compilation, real Windows two-client playtests, public network/security soak, RTX 3070 QHD 165Hz input/frametime measurements with **16GB system RAM**, and full three-mode release gates remain unverified. PC-only scope excludes new touch work.

### PC team dual-source trigger follow-up (R-03 / R-13, partial)

The 2D localhost team client now maps left mouse down/up and keyboard fire onto independent physical hold sources, reusing the shared PC latch already used by offline BR/CH01. Releasing one source leaves the other held; mouse release outside the arena, pointer cancellation, blur, and round transition clear the appropriate state. The server continues to own finite ammunition, ray checks, shot cadence and the 90-tick missing-input lease. DOM/network regression covers either release order and focus loss; actual Windows mouse play, public online service, native UE and QHD 165Hz performance remain **unverified**.

## 2026-10-30 team held-fire simultaneous resolution (R-03 / R-12 / R-23)

Local authoritative 60Hz team rules now stage **same-tick held-trigger** hits before applying damage, so two legitimate simultaneous final hits produce a draw rather than awarding the first-joined player an artificial win. The change preserves finite ammunition, cover-aware server rays, one-shot HTTP command behavior, and round restart; deterministic tests cover insertion-order independence, nonlethal exchanges, unilateral hits, draw rematches and replay. The two-tab DOM mock also checks that a mutual draw is announced correctly to both clients, not misreported as a disconnect. This is a **source/CI candidate**, not latency-compensated public netcode, real browser playtest, first-person multiplayer, Unreal build or hardware benchmark. Real network jitter, discrete HTTP command ordering and client-visible draw UX still need dedicated validation.

## 2026-10-30 — P0 team same-tick movement fairness candidate (R-03 / R-04 / R-23)
- **Partial server-authoritative gameplay fix:** The local two-client 60Hz team prototype computes both movement proposals from the same starting tick, then uses deterministic shared collision clearance. A head-on contest no longer awards physical position to the first Map/join entry; stationary and parallel travel retain their original intent. Old overlapping positions can still separate, but may not move deeper into one another.
- **Code-level regressions:** `tests/team-simultaneous-movement.test.cjs` covers join-order independence, stationary contact, parallel full-speed travel, old overlap separation and blocked penetration. The pure Node test and full `npm run verify` plus GitHub CI must pass at the final PR head before this is considered merged.
- **Realism audit remains open:** The BR shrinking health-damage boundary is still an unexplained physical hazard and remains a release-blocking issue #15. The local team prototype remains 2D and loopback-only; public authoritative networking, actual desktop two-client browser QA, UE5 native builds, licensed high-fidelity assets, owner RTX 3070/QHD 165Hz/**16GB system RAM** measurements and independent realism evaluation remain **unverified**. No touch-specific feature or test is part of this change.

## 2026-10-30 — P0 swept glancing collision follow-up (R-03 / R-12 / R-23)

- **Partial, 2D local-server collision candidate:** The same-tick movement resolver now checks the closest approach along both actors' relative 60Hz swept paths, not only their final positions. This prevents two actors from briefly intersecting and crossing through each other in a glancing encounter whose starting and ending positions are both outside the collision radius. The shared first-contact fraction retains join-order fairness; clear near-misses retain full movement speed.
- **Regression scope:** deterministic reverse-order/replay tests, a clear near-miss and two authenticated localhost HTTP clients exercising the same crossing. CI must pass at the PR head; this does not validate UE physics, full 3D actor capsules, real Windows browser play, server jitter/packet loss, RTX 3070 QHD 165Hz performance or owner-reported 16GB system RAM. The unrealistic BR boundary and other issue #15 release blockers remain open. PC-only development; no touch-specific work.

## 2026-10-30 — localhost team real-time 60Hz pacing correction (R-03 / R-10 / R-12)

- **Partial server-clock fix:** The local Node HTTP team prototype previously used `setInterval(1000/60)`; Node's integer-millisecond timer truncation can request ~16ms rather than 16.667ms, advancing the 60Hz simulation faster than wall time. A monotonic elapsed-time accumulator now advances complete 60Hz steps, with an 8ms polling interval and a five-step maximum after event-loop stalls. Suspended-time backlog is deliberately discarded rather than causing an invisible combat burst.
- **Tests and limits:** deterministic 1s/2s 60Hz totals, irregular wakeups, bounded long stalls and clock rollback. GitHub CI at the PR head must pass. This does **not** establish real network latency compensation, native 165Hz frame pacing, Unreal packaging, Windows hardware timing, public-server uptime, real-browser feel or 16GB owner-PC measurements. The server remains loopback-only and 2D; strict realism issue #15 remains open. No touch development.

## 2026-10-30 — local team monotonic session lease and same-instant expiry (R-03 / R-12 / R-23)

- **Partial authoritative-server reliability fix:** the local two-client team server now measures session inactivity with Node's monotonic `performance.now()` instead of adjustable wall time, consistent with the 60Hz server pacing clock. Each lobby reclamation or live-round disconnect decision samples time once for both participants, preventing unfair one-sided expiration if the clock changes between player checks.
- **Regression boundary:** isolated Node tests cover default monotonic timebase, simultaneous expiry/no fictitious winner and atomic lobby reclamation; full `npm run verify` and GitHub Actions must pass before merge. This does not establish public-internet uptime, packet-loss tolerance, production matchmaking, real Windows two-client gameplay, UE compilation, QHD 165Hz or RTX 3070/**16GB system RAM** measurements. Realism blocker #15 (especially BR zone) remains open; no mobile/touch feature was added.

### 2026-10-30 — no fictitious win on late player departure (R-03 / R-12 / R-23)

- **Partial local-server fairness fix:** if one player explicitly leaves after the other participant's inactivity lease has already expired, the server no longer awards the disconnected side a fictitious victory before its next scheduled timeout tick. A genuinely connected remaining player still wins; the PC team HUD distinguishes this outcome from two simultaneous timeouts. Deterministic rule and simulated-browser tests cover both cases.
- **Limits:** this is a loopback 2D rules prototype, not public network resilience, verified Windows two-client play, UE5 or RTX 3070 QHD 165Hz performance. Realism release blocker #15 and the full three-mode launch gates remain open. Owner-reported system RAM is **16GB**; no touch work was performed.

### 2026-10-30 — P0 pre-tick session-expiry fairness (R-03 / R-12 / R-23)

- **Partial localhost server fix:** An HTTP heartbeat, movement, or other non-departure command arriving after a session lease expires but before the next 60Hz tick can no longer revive the expired session or change the authoritative winner. The shared monotonic expiry check settles the round before updating sequence numbers or held input; both expired peers yield no winner. A deliberate `leave` retains the existing `player_left` semantics and cannot award victory to an expired peer.
- **Regression evidence:** Three pure 60Hz-rule cases and one two-client localhost HTTP case, plus pre-existing voluntary-departure tests. Require a green final-head `npm run verify` GitHub Actions run before merge. This does **not** prove public-network resilience, real PC browser play, Unreal packaging, BR realism compliance, or RTX 3070/QHD 165Hz performance on the owner's **16GB system RAM** machine. No touch-specific development.

## 2026-10-30 PC raw mouse-input candidate (R-08/R-13/R-25)

BR and CH01 browser pointer-lock requests now prefer `unadjustedMovement` for precise desktop mouse input, falling back to ordinary pointer lock only when the raw option is unsupported. The fallback is cached per canvas; denied permissions are not silently retried, and canceled/pause-superseded requests cannot reacquire a stale lock. PC-only unit regressions cover asynchronous and synchronous fallback, permission denial, and pause cancellation. **Partial code implementation only:** actual raw-input availability, OS acceleration behavior, mouse latency, real-browser operation, RTX 3070/QHD 165Hz FPS and UE input are unverified. No mobile/touch work is included.


## 2026-10-30 — PC team live-session recovery and event-only pointer-lock denial (R-02 / R-03 / R-08 / R-12 / R-13)

- **Partial browser reliability fixes:** The local two-client team tab now clears an expired server token and stale PC held input on live `unknown_player` responses, allowing a new join without refreshing. Pending commands capture their original session identity, so old keyboard movement cannot be replayed under a new token. Both BR and CH01 browser slices now handle `pointerlockerror` on desktop browsers that signal failure by event rather than a rejected Promise, checkpoint/pause safely and ignore a late error if pointer lock was already acquired.
- **Validation boundary:** deterministic simulated-browser and server-adapter regressions, plus the full Node/GitHub CI suite, are required; real Windows pointer-lock events, two real browser clients, owner RTX 3070/QHD 165Hz/**16GB system RAM** profiling and Unreal native packaging are **unverified**. No touch features were added. Strict realism issue #15, particularly the BR boundary/hazard representation, remains a release blocker; all three final game modes and 12-hour campaign remain incomplete.

## 2026-10-30 — P0 PC team mouse aim responsiveness (R-03 / R-08 / R-12 / R-13)

- **Partial browser gameplay improvement:** the localhost two-client map prototype no longer waits for three server snapshot ticks (polled every 150ms) before sending a materially changed PC mouse aim direction. Client commands are bounded to 60Hz with a monotonic clock; a single trailing send preserves the last rapid pointer movement without waiting for the next poll. The authoritative 60Hz server still owns movement, visibility, hit tests and finite ammunition. Stationary aim renewals and blur/leave/session-change release remain in place.
- **Regression scope:** mocked two-client UI test verifies changed aim without a new server tick, throttling, last-flick delivery without polling and focus release. GitHub CI at the final PR head is required; real Windows mouse latency, 3D first-person online aiming, Internet jitter, UE build and RTX 3070 QHD 165Hz performance remain **unverified**. The owner reports **16GB system RAM**, not 8GB; touch development is out of scope. Strict realism blocker #15, the 11/27 offline demo and all three final modes remain open acceptance gates.

## 2026-10-30 PC team hidden-tab session fairness candidate

- **R-03 / R-12 / R-13:** A hidden desktop tab now releases held inputs and stops both background heartbeats and unnecessary state polling. This prevents an abandoned tab from retaining an online match slot indefinitely solely through periodic heartbeats. Returning to the foreground immediately renews the session before the normal 10-second heartbeat interval. The authoritative server's existing 30-second session lease and 60Hz simulation remain unchanged.
- **Verification:** Added two deterministic mocked-client regressions for background timeout with a connected opponent and prompt short-alt-tab recovery. Requires PR CI; no human-browser, real-network or public matchmaking validation is implied.

## 2026-10-30 visible-window PC focus fairness follow-up candidate

- **R-03 / R-12:** Some desktop window switches produce `blur` while `document.hidden` remains false. The team client now suspends heartbeat and polling in that state too, releasing held input immediately and renewing once on `focus`. This closes the remaining inactive-visible-window lease loophole without changing the 30-second server timeout or 60Hz authority.
- **Verification:** Two additional deterministic mocked-client focus/blur regressions. Human desktop focus behavior and public network operation remain unverified pending actual browser QA.

## 2026-10-30 — BR checkpoint temporal integrity (PR #141; R-04/R-12/R-23)

- **Partial implementation, Node CI green at code head:** Offline BR checkpoint writer and restore now reject a player shot timestamp later than the saved simulation time, bot sight/hearing memory later than the 2.5-second authored window, and physically impossible pending reload durations/full-magazine or no-reserve reloads. This prevents a corrupt save from causing prolonged weapon lockout or granting enemies unearned future perception.
- **Regression scope:** Five new Node tests cover tampered string/object saves, rejected invalid checkpoint writes, legitimate finite reload and exact 60Hz resume/replay. GitHub Actions `verify` passed on the code head; recheck the final documentation head before merge. No new mobile/touch functionality or tests.
- **Not completed:** BR's unexplained shrinking health-damage zone remains an open strict-realism release blocker (#15). The three complete modes, real PC keyboard/mouse playtest, UE5 packaging, QHD 165Hz RTX 3070 measurements with owner-reported **16GB system RAM**, human narrative QA and licensed photoreal assets remain unverified.


## 2026-10-30 — BR opponent reload checkpoint integrity (PR #143; R-04/R-12/R-23)

- **Partial offline save-fairness fix:** BR checkpoint write and restore now reject opponent reload timers with a nonempty magazine or zero remaining carried rounds. The writer also refuses contradictory live/dead actor flags, impossible bot ammunition or fabricated elimination credits before replacing an existing autosave. This preserves the existing version-1 checkpoint format and deterministic 60Hz simulation.
- **Regression scope:** corrupted JSON/object restore, invalid live-state writer, contradictory actor state and valid opponent reload round-trip with deterministic replay. Final-head GitHub Actions verification is required before merge; real PC browser playthrough and native Unreal/165Hz measurements are **unverified**.
- **Remaining P0:** the arbitrary shrinking-zone health damage still violates the owner's strict realism gate (#15); full story, public multiplayer, real graphics and asset rights are not accepted by this change. Owner-reported hardware remains RTX 3070, QHD 2560×1440 165Hz, **16GB system RAM**. PC-only scope; no touch work.

## 2026-10-30 — Server-authoritative stationary objective interaction candidate (R-03 / R-12 / R-23)

- **Partial local multiplayer realism/fairness fix:** Objective scoring now requires a stationary participant with an active capture intent and free hands. Moving through the control radius, completing a reload, or holding a trigger (including an empty one) cannot accumulate points; interruptions clear partial progress. No client-supplied score or position is trusted, and 60Hz match timing is unchanged.
- **Regression candidate:** deterministic Node tests cover movement-through-objective, finite reload interruption, empty-trigger interaction, re-engagement and ammunition conservation. Existing HTTP two-client and capture scoring regressions must remain green at the final PR head. This is a 2D localhost proof, **not** a finished 3D/UE objective animation, physical input test, public-network service or RTX 3070/QHD 165Hz benchmark. The arbitrary BR shrinking-zone damage in issue #15 remains an unresolved realism P0; no touch work is scheduled.

## 2026-10-30 — Team relay capture re-arm candidate (R-03 / R-12 / R-23)

- **Partial server-authoritative objective fairness:** A continuous held capture or repeated `active:true` network renewals can now transmit only one objective point. A new point requires a deliberate release then press; server-owned `captureArmed` resets on round start/finish and is disclosed only as the local player's input status. The PC team HUD explains the re-arm step. This builds on the stationary, free-handed capture rule without changing the 60Hz simulation.
- **Evidence:** Node unit, two-client HTTP and mocked-PC-client regressions cover anti-farming, legitimate three-point match completion, round reset and visible feedback. Actual Windows two-browser play, UE/native physics, public multiplayer, RTX 3070 QHD 165Hz/16GB benchmarks and the BR shrinking-boundary realism blocker (#15) remain unverified. No touch-specific development.

### 2026-10-30 relay-interaction integrity candidate (branch-only until CI/merge)

- Team-mode server now requires a **fresh capture press within the relay radius**; a held key from outside cannot remotely queue a future point. Leaving the relay radius disarms the interaction; returning requires release and a new press. Releasing/re-pressing or toggling movement, trigger, firing or reload **within one 60Hz tick** also clears banked progress instead of preserving a near-complete point. The desktop team HUD explains re-arming.
- Added deterministic 60Hz regressions for remote press/renewal and exit/re-entry, including finite scoring after a valid re-press. **Status: code candidate**, not real Windows two-browser human QA or full team FPS completion. Existing team-mode and offline-demo tests must pass at the PR head before merging. This does not establish the realism of BR/CH01, native UE or RTX 3070 QHD 165Hz.


### 2026-10-30 — BR final-phase deadline enforcement candidate (PR #151; R-04 / R-14 / realism P0)

- **Partial offline BR gameplay fix:** All announced boundary phase deadlines, including the end of the final phase, disqualify out-of-bounds players and rivals by the same rule. Once the final countdown reaches zero, leaving the last boundary cannot create an indefinitely unresolved match. No supernatural health drain is reintroduced. The PC HUD shows the final deadline and its active-limit state.
- **Evidence boundary:** Four deterministic Node regressions cover player and rival parity, post-expiry movement and checkpoint replay. GitHub CI must pass at the final PR head. This is a match-eligibility abstraction, not a realistic physical barrier or completed online BR. Earlier historical notes about BR shrinking-zone HP damage refer to superseded code; the broad realism audit issue #15 remains open for other rules and actual browser QA.
- **Unverified:** Windows PC browser end-to-end play, RTX 3070 QHD 165Hz/16GB performance, Unreal packaging, final visual realism and release acceptance. No new touch work.

### 2026-10-31 — PC team aim queue backpressure candidate (R-03 / R-08 / R-12 / R-13)

- **Partial client reliability fix:** Consecutive unsent mouse-aim **and keyboard movement** directions are coalesced to their latest same-type intent when an earlier HTTP command stalls. Fire, release and other commands are ordering barriers, so an older aim cannot be replayed after a shot or a release. The server retains authoritative 60Hz gameplay, sequence validation and finite ammunition. Expired sessions discard pending aim.
- **Verification required:** Mocked two-client HTTP regressions exercise 24 pointer movements under stalled transport, shot ordering, monotonic sequence numbers and release ordering; final-head `npm run verify` and GitHub Actions must pass. This reduces queued obsolete directions, **not measured latency**. Public-network jitter, human Windows mouse feel, UE5, RTX 3070/QHD 165Hz with **16GB system RAM** and full realism gates remain unverified. No touch-specific work.

### 2026-10-31 — PC team expired relay intent lease (R-03 / R-12 / R-23)

- **Partial local multiplayer fairness fix:** After 90 server-owned 60Hz ticks without a capture-intent renewal, the physical relay authorization is revoked as well as the active capture flag. A delayed or replayed held `active:true` command cannot resume an abandoned press; only a fresh release and press at the console re-arms the objective. Heartbeats remain unrelated to capture authority. The existing objective-scoring and finite-resource rules remain unchanged.
- **Evidence gate:** deterministic 60Hz rule test and real two-client localhost HTTP regression, plus full `npm run verify` and final-head GitHub Actions CI. This is **not** proof of Internet multiplayer, 3D first-person team play, human PC browser QA, full three-mode realism, Unreal packaging or RTX 3070/QHD 165Hz performance with owner-reported **16GB system RAM**. No touch development.

### 2026-10-31 — Team relay physical-press interruption fairness (R-03 / R-12 / R-23)

- **Partial 2-client authoritative gameplay candidate:** A relay interaction can only be armed by a fresh press while stationary, in range and with hands free. Movement, starting reload, trigger/fire or receiving a hit cancels the armed interaction and any partial score. Continued `active:true` renewals cannot queue a score when movement/reload/combat stops; release and press again is required. PC HUD now names hit interruption and prompts the release/repress.
- **Evidence boundary:** Added deterministic hit/held-trigger regressions, two-client localhost HTTP scoring and PC DOM feedback tests; updated prior stationary/reload/trigger expectations. Final branch `npm run verify` and GitHub CI must pass before merge. This is a 2D prototype, not native Unreal/Internet-scale play or a measured RTX 3070 QHD 165Hz/16GB performance result. Remaining BR/CH01 realism, three-mode completion and 12-hour story gates stay open; no touch-specific work.

### 2026-10-31 — BR/CH01 solid-cover render disclosure candidate (R-08 / R-14 / R-23 / R-25)

- **Partial realism/renderer correction (PR #167):** The shared browser visibility planner now excludes fully occluded standing opponents, local caches and short hostile flash effects behind authored solid cover, while retaining edge-exposed silhouettes. It changes render geometry only; authoritative 60Hz gameplay, finite ammunition, AI and checkpoints are untouched. A scalar ray/AABB path avoids new per-ray array allocations.
- **Evidence boundary:** Four local Node cover/edge/legacy-state regressions pass; final-head CI and full-repository verify are separately required. Actual Windows browser/WebGL2/Canvas2D appearance, graphics quality, native Unreal 5 and RTX 3070 QHD 165Hz/16GB frame-time or memory behavior remain **unverified**. This conservative 2D proxy does not establish physically complete 3D occlusion or finished cross-mode realism.

### 2026-10-31 — GPU disjoint adaptive hysteresis continuity (R-08 / R-25; PR #172)

- **Partial browser reliability candidate:** A WebGL GPU timer disjoint now resets both sampled CPU/GPU telemetry and the adaptive resolution governor's pending low-load streak. Invalid or insufficient measurements also break the required three-consecutive-window upscale evidence; the user-selected resolution ceiling and cooldown are preserved.
- **Evidence:** Three deterministic Node regressions cover disjoint recovery, invalid timing gaps and cooldown preservation. Full `npm run verify` and GitHub Actions at the final PR head are required before merging. This changes browser rendering controls only, not the fixed 60Hz game simulation.
- **Unverified:** Actual Windows browser/WebGL2 disjoint recovery, RTX 3070 QHD 165Hz with **16GB system RAM**, P50/P95/P99 GPU/CPU timing, UE5 native graphics, photorealism and final release gates. No touch development.

## 2026-10-31 PC WebGL context interruption (R-02/R-13/R-14/R-23/R-25; candidate)

- **Partial implementation:** Offline BR and CH01 now checkpoint/pause on `webglcontextlost`, prevent invisible 60Hz world progression, disable resume/new-game controls while the renderer is unavailable, and rebuild WebGL renderer resources on `webglcontextrestored`. Restoration never auto-resumes player actions. Reinitialization failure keeps controls disabled and preserves the checkpoint for a page reload.
- **Verification:** Node desktop DOM-mock loss/recovery/failure regressions and GitHub CI required at the final PR SHA. Real Windows desktop GPU context-loss/recovery, actual WebGL buffer restoration, renderer artifacts, input responsiveness, QHD RTX 3070/16GB and 165Hz performance remain **unverified**. Mobile/touch-specific work remains excluded.
- **Release gate:** This is a browser stability candidate, not proof of Unreal native compilation, production graphics, multiplayer authority, 12-hour story or full release readiness. The broader realism P0 and physical BR boundary remain open.

### 2026-10-31 — BR terminal combat atomicity (R-04 / R-14 / realism P0)
- **Code candidate:** once a BR round has ended from a published boundary ruling or player incapacitation, subsequent rivals cannot expend rounds, reload or generate new perception/combat events in that tick. Rival movement and deadline eligibility are still resolved before returning; later ticks remain frozen. Deterministic Node regression checks the terminal boundary and preserves legitimate live-rival combat.
- **Gate:** local Node verification and final-head GitHub CI are required before merge. This is not proof of realistic ballistics, complete cross-mode realism, a real Windows browser playthrough, Unreal native packaging or RTX 3070 QHD 165Hz / 16GB RAM performance. No mobile/touch work.

### 2026-11-01 — Offline demo delivery integrity (R-02 / R-12 / R-23; release P0)
- **Partial code implementation:** The 2026-11-27 browser demo packager now rejects direct HTML network/unbundled asset references and unsupported CSS import/URL dependencies. An independent stored-ZIP verifier checks entry headers, duplicate paths, CRC32, canonical per-file SHA256 manifest and ZIP sidecar; packaging fails closed if these checks fail. New negative and positive Node tests run in GitHub Actions.
- **Reality audit boundary:** BR live simulation strips legacy shield state, finite ammunition pickups remain bounded, CH01 legacy checkpoint shield fields are migration-only, and the local team proof retains server-owned finite resources. These observations do **not** close realism issue #15: simplified BR boundary rules, human AI/physical plausibility, visual assets and all three final modes still need independent playable assessment.
- **Unverified:** Actual Windows offline ZIP launch, full 11/27 end-to-end human QA, Unreal compilation, real 165Hz QHD RTX 3070/16GB system RAM frame timing, photoreal visual comparison and production server multiplayer. No new touch feature or touch-only test is required.

### 2026-11-01 — Atomic PC team session resume (R-12 / R-14 / R-23 / R-25)
- **Partial local-team implementation (PR #189):** A resumed Windows browser tab now sends one authenticated, sequence-validated `resetInput` command to cancel old movement, pointer aim, held trigger and relay capture together, instead of four separate HTTP round trips. The authority clears partial relay progress without healing, replenishing ammunition, resetting the opponent or changing the 60Hz simulation.
- **Verification scope:** Four new Node regressions exercise relay interruption/finite ammunition, held-fire and movement cancellation, malformed/replayed commands and two-client loopback HTTP isolation; existing PC browser resume regressions are updated. Final PR-head CI must pass before merge.
- **Remaining gates:** This is not public-internet multiplayer or a complete team FPS. Real Windows two-browser gameplay, 2026-11-27 offline demo, native UE5 compilation, RTX 3070 QHD 165Hz / **16GB system RAM** profiling and independent realism evaluation remain unverified. No touch-specific development was performed.

## 2026-11-01 PC multiplayer resume acknowledgement gate (R-03 / R-12 / R-23)

- **Implemented candidate:** A restored team browser tab does not accept new keyboard/mouse or heartbeat commands while the server-owned movement, aim, trigger and relay state is being reset. It sends one authenticated, sequenced `resetInput` request directly and only resumes rendering/controls after an explicit `{ok:true}` acknowledgement. A rejected request or unacknowledged 200 response fails closed instead of silently restoring stale held input.
- **Regression evidence:** Node DOM/network-mock cases cover a rejected reset, a missing acknowledgement and delayed reset with attempted PC input. GitHub Actions must pass at the final commit; this is not a Windows real-browser, packet-loss, public-server or UE5 multiplayer validation.
- **Follow-up recovery candidate:** A transient reset rejection now leaves the old server seat safely disconnected but retains its tab-scoped token for an explicit PC **재연결** retry. The retry re-fetches the server sequence and requires a new acknowledged reset before controls resume; expired/unknown sessions still clear. DOM/network mocks cover HTTP failure and unacknowledged 200 followed by successful same-seat retry.
- **Remaining P0:** Real two-browser reconnection, packet loss and server soak tests, production auth, all other realism/release gates and target-hardware performance remain unverified. No mobile/touch work was added.

## 2026-11-01 BR terminal-state AI freeze (R-14 / R-23 / realism P0)
- **Partial code candidate:** Once a live rival shot ends the offline BR match, later rivals no longer move, turn or advance their patrol timers within that same 60Hz tick. The published boundary-deadline pass still evaluates every rival, so simultaneous out-of-bounds rulings are not skipped.
- **Verification boundary:** Added Node regressions for terminal actor freeze and multi-rival boundary assessment; `npm run verify` and PR CI must pass before treating this as merged. A real Windows browser playthrough, QHD 165Hz RTX 3070 with **16GB system RAM**, Unreal native packaging and human realism assessment remain **unverified**.

## 2026-11-01 PC nested UI focus regression (R-04 / R-23 / demo P0)
- **Partial PC-input fix candidate (PR #193):** Shared BR/CH01/team desktop keyboard gating now follows a bounded, cycle-safe parent/shadow-host chain for focused menu buttons, editable descendants and option labels. Previously only the direct event target was inspected; nested focused descendants could leak Space or remapped keys into live gameplay. No touch-specific changes.
- **Verification boundary:** New Node regressions exercise nested button/icon, editable text, select option, shadow host and malformed cyclic targets. Final-head GitHub Actions, real Windows keyboard focus, browser pointer lock and 2026-11-27 end-to-end offline demo acceptance remain separately unverified until executed. QHD 165Hz RTX 3070 / **16GB system RAM**, UE5 native compilation, licensed assets and full three-mode release remain unverified.

## 2026-11-01 — BR cover-edge human visibility (R-14 / R-23 / realism P0)

- **Partial implementation candidate:** BR opponents now check three bounded standing-body silhouette rays rather than only the actor centre, so a physically exposed shoulder beside solid cover may be observed. Full cover and other standing bodies still occlude the corresponding rays. A follow-up allows a visible-edge opponent to attempt a finite shot even when the centre is covered; the existing physical shot-ray test still blocks actual cover penetration. No magical detection or extra ammunition is introduced; 60Hz perception remains deterministic.
- **Evidence gate:** New Node tests cover partial exposure, complete concealment and repeatable fixed-step perception; GitHub Actions must pass at the final branch SHA before merge. Actual Windows browser appearance, independent AI realism review, 165Hz/QHD RTX 3070 with **16GB system RAM**, UE5 native compile and all final-mode realism remain **unverified**. This is not a completion claim for issue #15.

## 2026-11-01 team incapacitation visual parity (R-12 / R-14 / R-23)
- **Partial PC two-client realism fix:** A player actually incapacitated by finite server-owned combat is now marked as such in authorized visible snapshots and drawn as a subdued horizontal 2D cue, not a still-standing combatant. Opaque cover and mist continue to restrict which actors are disclosed. No private opponent HP/stress is transmitted, and rematches reset the cue.
- **Verification boundary:** Four Node regressions cover finite combat, cover privacy, rematch reset and two-client HTTP state. This is not a ragdoll or native first-person animation. Windows two-browser gameplay, public internet security, complete three-mode realism, UE native packaging, and RTX 3070 QHD 165Hz / 16GB measurements remain unverified.

## 2026-11-01 Windows PC focused-link / ARIA control input guard (R-08 / R-23 / R-25)
- **Partial, CI pending:** Shared desktop keyboard focus detection now recognizes focused help anchors, summary disclosures, ARIA widgets and contenteditable regions (including nested children) so PC navigation cannot accidentally move/fire in BR, CH01 or the two-client team prototype. Added Node unit and browser-controller regressions for all three playable slices. Existing touch code is unchanged and no new touch feature/test is introduced.
- **Evidence boundary:** GitHub Actions must pass syntax, Node, and offline package checks before merge. Real Windows browser focus behavior, pointer-lock latency, RTX 3070 QHD 165Hz with **16GB system RAM**, UE5 native, and release-grade three-mode realism remain **unverified**.


## 2026-11-01 — Local team stalled-upload deadline (R-12 / R-23, P0)
- **Implementation candidate:** A partial, under-2KiB JSON request now has a bounded 5-second body deadline; the loopback server responds with HTTP 408 and does not allocate a lobby seat. Existing early HTTP 413 for oversized uploads is preserved. This deadline protects local prototype availability; it is **not** production-grade internet DoS mitigation.
- **Regression:** Node unit cases for incomplete, late and valid UTF-8 JSON, plus a real loopback HTTP stalled-join and recovery test. Verify the branch CI and actual Windows browser behavior before merging. All three final modes, Unreal native packaging, photorealism and RTX 3070 QHD 165Hz / 16GB RAM remain **unverified**.


## 2026-11-01 opt-in Windows browser benchmark candidate (R-08 / R-25 / R-26)

- **Partial code implementation:** The offline BR graphics settings now expose a user-triggered 120-second benchmark with 5 seconds of warmup, a render-callback FPS/1%-low estimate, P50/P95/P99 callback intervals and CPU renderer-draw duration, optional WebGL2 GPU timer percentiles, a stutter count, effective render-scale range, and a local JSON download. No upload, analytics, or background collection. Browser-tab focus loss, menu pause, graphics changes, match termination, invalid timing gaps and GPU disjoint do not silently generate a completed result.
- **Verification boundary:** Node tests cover timing windows, invalid data and GPU disjoint; CI is pending until this PR runs. The browser's CPU draw call is **not** total CPU frame time, WebGL2 GPU timer data may be unsupported, the estimated 1%-low is **not** a native benchmark, and the 165 Hz monitor/CPU/GPU identities cannot be independently verified by this code. Physical Windows RTX 3070, QHD 2560x1440 at 165 Hz, **16 GB system RAM**, input latency, native Unreal compilation, photoreal quality and complete end-to-end play are still **unverified**. No touch/mobile development was introduced.
