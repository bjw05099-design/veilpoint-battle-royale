# Native firearm production and reload

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

## First supported models

| Stable model ID | Exterior reference | In-game use |
| --- | --- | --- |
| `M4A1` | Dark receiver and furniture, telescoping stock and flat-top silhouette. [U.S. Army Infantry News, 2014, M4 Carbine Product Improvement Program figure](https://media-cdn.dvidshub.net/pubs/pdf_40342.pdf) | Default model, including CH02's Amina branch. |
| `AKM` | Soviet fixed-stock variant, with wood furniture and a strongly curved detachable magazine. [United Nations S/2014/452, page 90, Soviet AKM photographs](https://digitallibrary.un.org/record/774605/files/S_2014_452-EN.pdf#page=90) | CH02's Yusuf clinic branch and the alternate Battle Royale lobby selection. |

The game uses a common 30-round magazine capacity for these two profiles.
Each model has an individually authored Unreal first-person silhouette. The
stock, handguard, sight profile and magazine geometry are separate exterior
render pieces. The model is created on demand for the local first-person camera
and the active one alone is shown. Asset materials and poses represent the
shapes for the game camera.

Reload times, range, distance damage, heat and reserve limits are gameplay
parameters in `VPWeaponRules.h`. Story encounters assign a partly loaded
magazine from their scripted supply. In the Battle Royale lobby, both models
start with a full magazine and eighteen reserve rounds. The server confirms the
selected model and locks the choice once a player is ready. The model and
magazine state replicate to that player's client.

## Shared ammunition and reload

One accepted shot decrements both the total-ammunition field (`Charges`) and
the number loaded. An empty magazine requires a reload even with reserve
ammunition.

R requests a reload without sending client counts, amounts or deadlines. The
server checks the current story/BR phase, life state, magazine invariant and
available reserve. The weapon profile distinguishes partial and empty
magazines. Reloading fills the magazine from the existing total. Repeated R
leaves an active timer intact. Waiting/completed rounds, death, full magazines,
empty reserve and an open local PC menu reject a reload. Death/round end cancel
an in-progress reload without crediting rounds. An offline pause freezes world
time; an online menu does not pause the server.

Accepted shots also accumulate heat and use hit distance to look up gameplay
damage. The server blocks shots during overheating until the weapon has cooled
to the profile's resume threshold. The HUD shows magazine and reserve counts,
reload time or the cooling state. Heat telemetry is owner-only and cools
according to synchronized server time from the last shot. Retrying an Aden
encounter resets the weapon state with the encounter loadout.

`VPWeaponRules.h` is the production numeric gate compiled in host CI. Tests
cover the two models' magazine and reserve bounds, malformed counts, authority,
life, phase, reload differences, ammunition conservation, heat lock and
distance falloff. The Windows Aden diagnostic checks first-person model selection
and checkpoint restoration, both M4A1 R timers, the AKM partial R timer and a
live shot's ammo and heat. The Coast diagnostic starts and repeats reload
through R, rejects a shot during reload and waits for the timer to finish.

A server-timed reload animates the model's magazine pivot. Empty reloads
include additional movement and an accepted shot briefly moves the rig.
Holding the right mouse button raises the sights and narrows the local view.
Reloading, sprinting and contact with a close surface lower the rig. The
exterior pieces have no collision. The existing server checks determine hits
and cover.

Final first-person meshes, third-person assets, hand animation, audio, chamber
state, attachment fit and projectile drop are pending production work.
