# Shared harbor, CH01 cover and BR96 combat increment

## Implemented scope

- The shared city building at (114, 10) and CH01 east harbor building at (42, -38)
  now reuse a loading-hall kit: six walls, two four-metre north/south entrances,
  and two solid 1.3-metre cargo bays. Actual 60Hz bodies can cross both rooms.
  All new pieces fit within the former solid footprint. Revision-zero BR terrain
  remains unchanged. The renderer consumes the same collision pieces.
- CH01's captain acknowledges the alternate hall only after actually crossing
  its doorway during the encounter. It is not a required investigation, objective
  vote, remote discovery or combat-clearance shortcut. Both old exits remain.
- Shared shot and sight segments use cover height; a standing shot can clear a
  low crate while a low shot is stopped. Finite cylinder hits select the nearest
  body and do not bend aim with distance. CH01 and offline BR share these rules.
  Visual actor culling retains exposed heads above low cover.
- BR96 now has authenticated, server-owned finite hitscan combat, manual reload,
  health, real combat retirement, private own-weapon HUD, held mouse fire and
  accepted-shot recoil/audio. Focus and pointer-lock guards stop stale inputs.
  Existing six-person squads and placement/spectating are reused. Fire/reload
  replay protection includes input sequence, round generation and world revision.
- BR96 public geometry publishes the real collider height. Its first-person
  renderer draws multiple depth layers, so low cargo does not erase farther
  walls, and clips concealed body portions. Camera and shot eye heights align.

## Validation and review gates

New behavior tests exercise finite-height impacts, thin walls, crouch, nearest
bodies, actual passage traversal, CH01 radio causality, finite magazines/reload,
session rotation, combat placement, request validation, privacy, same-tick stale
responses and foreground PC input. Existing geometry and input contract tests
were updated where an intentionally solid building / previously unbound R key
was replaced by the new feature, retaining their other assertions.

The real Chromium gate additionally loads the production BR96 client against a
loopback server with 96 synthetic authenticated sessions. It must pass trusted
mouse lock/fire, physical R reload, chat focus isolation and server elimination
on Linux and Windows. Its screenshot is retained with existing geometry evidence.
Full Node tests, four PC viewports, both CH01 route endings and both Windows/browser
package checks remain required. Passing CI is not a user-PC performance result.

## Limits and original requirements retained

These are functional prototype increments, not a finished chapter/campaign or a
production 96-player release. The original city blockout is not surveyed Aden;
no 1:1 reconstruction claim is made. Combat is hitscan without ballistic drop,
penetration, animation-quality damage, lag compensation or certified real weapon
data. The BR friendly-fire policy is explicitly disabled damage with solid bodies.
Only local accepted shots have the new synthesized cue; remote combat sound still
needs development. Body shapes and CPU layering are simplified, not photorealism.

Windows PC keyboard/mouse, F interaction and middle-click location marking remain.
Story-first release, later BR reuse, rolling map35/story35/BR20/stability10 and the
12h planning target at 50/20/22/8 remain unchanged. Native UE5 execution, 3070 QHD
performance, licensed real-world city data and production audio/assets remain
unverified. FortisGuard and automation schedules are outside this change.
