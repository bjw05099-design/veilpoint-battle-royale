# Native firearm production and prototype reload

## Firearm production standard

Each production weapon has a stable identifier and a profile for a specific
real make, model and variant. Record a source for each reference-dependent
choice and distinguish verified details from gameplay tuning in the profile.

| Area | Per-weapon requirements |
| --- | --- |
| Identity and appearance | Use the actual model name and reference its exterior proportions, silhouette, controls, sights and markings. Author first- and third-person assets and sight alignment in UE5.8. |
| Magazine and attachments | Record supported magazine types and capacities, chamber and reserve behavior, and compatible optics, muzzle accessories and other equipment by variant. Test attachment fit, sockets, visibility and compatibility. |
| Reload and handling | Author the weapon's own hands, magazine and action animation. Distinguish empty and partial reloads when applicable. Derive the gameplay timing from reference footage and the authored animation, and synchronize the round count, sound and readiness with the corresponding animation events. |
| Trajectory and range | Give each supported weapon and ammunition pairing its own in-game trajectory, drop and effective-range behavior. Check indicator and impact agreement at near, intermediate and far points in the game. Tune damage falloff separately for gameplay and verify the distance-band transitions. |
| Heat, firing and feedback | Model weapon-specific heat buildup and cooling in the game, observable feedback, and the resulting changes in handling where supported by the design. Use per-weapon fire modes, cadence, recoil and sound. Record gameplay tuning where the real behavior has no reliable reference. |

Implement magazine, reload, attachment, firing and hit behavior in the shared
UE5.8 weapon system. Put assets and variant parameters in the profiles so a
mission can swap a loadout without changing firing code. Keep ammunition and
combat state authoritative on the server in Battle Royale.

Complete a playable profile end to end and validate equip, fire, both reload
states, interruption, compatible and incompatible attachments, distance-band
damage and heat recovery. Add a second distinct profile to verify that the same
system handles different capacities, timing and assets. Use an Unreal package
to verify animation and sound synchronization and check both offline and
host/client behavior where each weapon is supported.

## Current prototype implementation

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
