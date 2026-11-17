# CH01 Last Broadcast: native production slice

This extends the existing short relay/south/east approach. At either old exit,
follow the southeast paving connector to Yusuf's aid handover (60m, -35m).
Existing v1/v2/v3 mission saves are retained. This new slice has separate
versioned primary/backup checkpoints; no old route completion is relabelled as
completion of the entire campaign.

## Playable sequence

1. Confirm the aid handover and inspect the unsafe-street warning with F.
2. Follow two civilian proxies and a supply proxy to the roofed workshop.
3. Choose the south sign or east sign. Follow the corresponding physical lane.
   The group and supplies must actually reach its end before F confirms passage.
4. Account for the group by Nadim's parked vehicle proxy, then accompany them
   **on foot** to Salma's shelter reception. Driving/boarding animations are not
   implemented; the text explicitly describes the limited assembly slice.
5. Check the withdrawal channel. Enter the original loading hall through the
   four-metre doorway and press F at Mariam's radio desk. The twelve-second
   subtitled safety message is interrupted by leaving the desk, obstruction,
   turning away or death. It restarts rather than granting a false completion.

Shelter reception is confirmed; the Korean return remains unresolved. The
subtitles are working draft lines based on the recovered premise, not a claim
to have recovered the approved full fourteen-scene script or recorded voice.

## Map and art

`scripts/ch01-last-broadcast-layout.json` is the authoritative original,
unreferenced centimetre layout. A generated C++ header binds the real native
station/convoy coordinates to it. The map adds a roofed workshop, two lanes
around a solid median building, connected vehicle assembly and shelter spaces,
beds, parked vehicle proxy and walkways. It is not surveyed Aden geometry.

The committed Blender radio original is exported by the installed Blender on
the PC into nine per-part FBX files with nine matching convex UCX colliders.
Unreal imports them, saves the map, reloads it and verifies mesh/collider count,
120x65x106cm size, grounding and source hashes. This is original blockout art,
not photoreal production art or an authenticated historical radio.

The two people and supply cart are deliberately simple, colliding proxies.
Server-owned swept movement stops against obstacles and players. It does not
claim a finished crowd/navigation/animation or vehicle system.

## Saving and verification

New saves replay the bounded event history to reject reordered/forged stages.
Resume reconstructs the last confirmed assembly point; walking progress and an
unfinished broadcast restart. Player position, ammunition and health are not
saved. ESC's verified mission save checks both the old and new checkpoint.
Diagnostic runs use separate slots and never erase player progress.

Host checks compile the actual engine-independent C++ transition gate and
sample all convoy paths against the new solids, table stations and existing
public court. Private author-package diagnostics additionally use the real F
entrypoint for both routes, wait for actual swept convoy movement, require
verified save/readback, reject distant/behind interactions and a forged ending,
interrupt/restart the timed broadcast, and capture the actual radio scene.
Each render-mode process is owned and bounded to five minutes.

Engine compilation, map/import receipt, cook/package, offscreen render, main
window output, physical keyboard/mouse playtesting and QHD GPU performance are
separate results. Pending native execution must not be described as a pass.
Historical primary-source review, local human review, full approved screenplay,
combat encounters, final art/audio and full campaign completion remain open.
