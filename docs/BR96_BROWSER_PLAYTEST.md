# VEILPOINT local 16×6 BR movement playtest (November 8, 2026)

This is a **loopback-only, two-dimensional, authenticated multiplayer traversal and
squad-staging test screen**. It is not the final FPS, a production battle
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
regroup signal and E sends a local-position signal. A faint public circle
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
