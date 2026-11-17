# Native finite magazine and reload

The native prototype keeps its existing total-ammunition field (`Charges`,
initially 48, pickup cap 60). Thirty rounds start loaded; eighteen are reserve.
One accepted shot decrements both total and loaded rounds. An empty magazine
cannot fire even if reserve ammunition remains.

R requests a reload without sending client counts, amounts or deadlines. The
server checks the current story/BR phase, life state, magazine invariant and
available reserve. A 2.6-second prototype timer fills up to thirty rounds from
the existing total. Reloading creates no ammunition and repeated R does not
extend/restart an active timer. Waiting/completed rounds, death, full magazines,
empty reserve and an open local PC menu reject a reload. Death/round end cancel
an in-progress reload without crediting rounds. An offline pause freezes world
time; an online menu does not pause the server.

The HUD displays the actual loaded/reserve counts or remaining reload time in
both modes. Owner-only telemetry uses synchronized server time. New checkpoint
formats still do not claim to preserve player ammunition/health/position.

`VPWeaponRules.h` is the production numeric gate compiled in host CI. Tests
cover every magazine/total combination from 0–30/0–60, malformed counts,
authority, life, phase and reload restrictions, bounds and conservation. The
private gameplay diagnostic fires once through the real primary-action entry,
starts/repeats reload through the public R entry, rejects a shot during reload
and waits for the real server timer before checking ammunition conservation.

These are prototype mechanics, not a researched real-weapon capacity, magazine
animation, chamber model, ballistics model, sound recording or recoil proof.
