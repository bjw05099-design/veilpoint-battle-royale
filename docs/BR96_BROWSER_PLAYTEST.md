# VEILPOINT local 16×6 BR movement and combat playtest (updated November 13, 2026)

This is a **loopback-only authenticated movement and basic hitscan combat prototype**,
with a diagnostic map and a CPU-rendered first-person view. It is not the final FPS, a production battle
royale, an Internet host or a 96-human load-test certificate.

## Launch

Requires Node.js 18+ on Windows PC; no dependency download is needed.

```powershell
npm run br96:server
```

Open **http://127.0.0.1:8130/** in your Windows PC browser. The host binds
only to `127.0.0.1`. To choose a different unused TCP port, set
`VEILPOINT_BR96_PORT` between 1024 and 65535 before launching.

Each browser tab joins with a separate session and can share a privately
issued **32-character squad invite code**. An actual locked movement round
starts only after all **96 seats (16 teams × 6)** join and signal **ready**.
No simulated guests are inserted to manufacture a full lobby.

Controls: WASD/arrow keys move the authenticated actor, Shift or the
on-screen toggle requests finite sprint, Q sends a server-positioned private
regroup signal. Press the mouse wheel for a local-position mark; F performs nearby interactions. A faint public circle
represents the published play-area rule. The map shows the player, their
six-person squad, physically observed rivals, and legitimately discovered
public landmarks. No opponent identity, remote position or authentication
token is added outside the already filtered server snapshot.

If a player explicitly **withdraws from an active round**, the PC UI requires
two clicks within eight seconds before sending the server-authoritative
withdrawal. This is irreversible for the ongoing match. The withdrawn player
can then select **one still-active member of their own six-person squad** in
the spectator dropdown. The observed rival list is calculated from that
teammate's real, obstacle-tested sightlines; the UI never invents a free-flying
camera or reveals arbitrary opponent locations. A retiring teammate cannot
remain a valid camera target. The public server-created squad standings show
eligible members and confirmed placement, not invented live rankings.

### Physically operable public ferry access

The new 96-person local 2D world includes one **original fictional ferry
waiting-hall sliding access panel**. Walk beside either public-side switch and
press **F** (or the on-map **F · 여객 문** button). The server checks the actual
player position and moves the solid barrier gradually at 60 Hz. The panel
stops if any active player occupies its swept physical path, and opening the
panel clears a genuinely traversable opening rather than hiding a painted
door. The same public collider and open/closed state are visible to every
squad, but no rival positions or credentials are leaked by the static city
map. This is a gameplay and collision feature, not a reproduction of any
real Aden security checkpoint.

### Shared harbor ground and movement

The BR96 local 2D server now uses the **same fictional waterlogged loading
apron as the offline BR**. The public ground footprint is downloaded once and
drawn on the map; entering it changes a participant's actual **server-owned
60Hz travel distance** rather than simply showing a slowdown label. Shallow
wave wash follows a fixed server-tick cycle, without artificial injury,
teleporting, client-supplied terrain or secret rival tracking. The HUD only
shows the authenticated player's own current ground status. This is a
small-waterfront terrain interaction, **not** a completed large Aden map or an
online-performance benchmark.

### Public match results without false ranking

Press **V** (or the on-map **V · 분대 결과** button) to view the actual
server-computed status of all **16 squads**, arranged in a four-by-four
no-scroll PC board. A team whose result is not yet final is labeled
**in progress** and has no invented current placement. Confirmed places
come only from the authoritative match state, and simultaneous retirements
retain the server's genuine ties. Only team numbers, active counts and
confirmed placements are shown; other squads' player names, tokens,
and off-screen positions never appear. **Escape** or the close button
returns focus to the normal map. While reviewing the board, the keyboard
movement intent is neutral, not allowed to keep steering a player off-screen.
This is the local round prototype, not production matchmaking.

### Nearby map and spectator-follow camera

The local PC 2D field-test now has **M / 주변 지도** to switch between
a 350-metre full-city map and an 110-metre neighborhood view, including an
honest 20-metre scale bar. While playing, the view follows the authenticated
server's own player coordinates. Once withdrawn, an eligible, explicitly
selected teammate may be followed in the spectator view; a rival's position
can NEVER become the camera target. The buildings, public ferry gate and
published zone use the exact same world-to-pixel transform, so visual
location does not drift away from server collision. Zoom is a **local display
setting only**, with no move command, teleport, free-flying spectator camera
or new server permission. The 1024×600 through 2560×1440 no-scroll PC
geometry gate checks that its control is still clickable and keyboard
focusable. Use **M** or the on-screen button to toggle; V remains the 16-squad
results overlay.

### Six-person squad entry choice (new playable lobby action)

Before pressing **Ready**, each of the six actual squad members can tap
**출발 투표** to cycle between three public, original neighborhood walk-in
approaches: the block, waterfront promenade, and residential lane. Each vote
belongs to one authenticated human seat; another squad cannot read its
ballots. The server counts only expressed votes, resolves tied choices in a
stable order, and freezes the result when all 96 real human seats are ready.
The selected approach changes each squad's actual collision-tested initial
position **inside its assigned district** at round start; it never changes
team membership, awards equipment, reveals opponents or teleports players
after start. A ready member must unready to revise the vote. The unchanged
default is the old district center, preserving existing sessions that do not
vote. This is not parachute physics or a complete Internet lobby.

### Native shared ferry-hall blockout

The independent UE5 project now reproduces the seven browser/shared-world
ferry waiting-hall collision footprints **on both native BR and CH01 sides**
before any mode-specific actors are created. Its public northern doorway
remains walkable; it is still only editor/source-authored blockout, not a
tested UE5 packaged map, a real Aden landmark, or full-sized city content.
Native Unreal build and traversal remain unverified on the owner's PC.

### Opt-in coastal ambient sound

The local BR96 PC movement client now has a separate **환경음 OFF/ON**
control over the map. The browser creates an original two-tone synthesized
port ambience **only after the player clicks the button** during an active
round. Sound pitch and quiet volume adapt solely to the player's own
server-authenticated dry, wet-apron and shallow-wave status; no microphone,
recording, third-party audio, enemy detection or browser autoplay is involved.
The sound stops when disabled, the session ends or the page unloads. Its
actual button hit region and keyboard focus are checked at four PC viewport
sizes. This remains a simple synthesized ambient prototype, **not** authentic
spatial audio, a final sound design or UE5 native audio.

The player token is **never placed in a URL or a downloadable match file**.
The current tab's `sessionStorage` retains it across reloads. On reload
the UI reconciles the authoritative command sequence before sending the next
movement. Leaving the pre-round lobby removes that session. There is no
persistent account, anti-cheat client agent, WAN routing or matchmaking yet.

Important: the normal `index.html` offline BR and `story.html` CH01 browser
preview remain separate and unchanged launch paths. The November 27 Windows
EXE host is still a locally packaged browser prototype, **not** a UE5 build.

## Additional authored world work

The native UE5 C++ source now adds the six **original civilian seafront
market** collision footprints to both the story and BR world bootstraps,
matching the browser's shared coordinates. Static source parity tests pass
only if those footprints and corridor remain consistent. This code has
**not** been compiled or physically tested in Unreal Editor on the owner's
Windows PC. Do not label it a finished UE5 environment.

CH01's existing E-key exit remains usable; a physically traversed, clear
exit also triggers the same ending if the player is not carrying a civilian
aid crate or abandoning an accepted escort. The chapter still retains the
already-received-in-Korea deployment and the unexpected later escalation.

## Verification

```powershell
npm run verify
```

CI tests validate local page serving, no URL/session leakage, safe HTTP
routing, selected gameplay requests, shared Unreal/browser market geometry,
and CH01 arrival preconditions. An actual Windows playthrough, 96-browser
concurrent test, Unreal UBT/PIE run, complete game rendering, and production
performance measurements remain outstanding.

## Server-owned basic combat (November 13)

Press P for first-person view, click the scene to acquire mouse lock, then use
left mouse (hold for repeated fire) and R to reload. Acquiring the lock does not
fire. Escape, chat focus, menus and window blur release held fire. The HUD shows
only your own health, loaded magazine and carried reserve. No automatic healing.

The existing fictional carbine profile supplies 12 loaded / 36 reserve rounds,
a 1.8-second reload and a 12-tick minimum shot interval at 60 Hz. These are
prototype class parameters, **not verified specifications for a real weapon**.
Friendly bodies stop shots; friendly damage is disabled in this prototype.
The server resolves the nearest finite body and physical cover height. Three
45-point hits retire a 100-point opponent and use the existing squad standings
and same-squad spectating. Ammunition, health, cadence and sequence survive
session rotation. No client-provided target, damage, position or timestamp is accepted.

`POST /fire` accepts exactly `{seq,yaw,pitch}`; `POST /reload` exactly `{seq}`.
Both require the normal `x-player-token` and `x-round-number` headers. View angles
are bounded to ±π yaw / ±0.44 pitch; sequence is shared by fire and reload.
Unknown fields, stale sequences, a stale round, busy hands and invalid aim are
rejected. The fire response does not reveal a hit flag or enemy health. A
monotonic world revision prevents delayed same-tick responses from restoring
older health or ammunition in the client.

The Chromium release gate runs 96 **synthetic loopback sessions**, physical mouse
fire and keyboard reload, checks chat isolation and verifies a server elimination.
That is not 96-human testing, WAN certification, lag compensation or a production
anti-cheat. Other players' gunshot audio, richer weapon/animation assets, hit
reactions and network prediction remain further work; the own-shot cue is synthesized.
