# VEILPOINT development review — 2026-11-13

This pass integrates the pending runtime work from PRs #852 and #864 with new
world, CH01 combat and BR96 input fixes. The original commits retain their
authorship. It does not count those earlier changes as newly authored features.

## Playable changes

- **City walking:** eye-level WASD follows camera yaw while overhead movement
  remains aligned to the map. Diagonal input keeps the existing 1.7 m/s speed
  and 60 Hz collision. The explicit world-coordinate `walkStep` API is unchanged.
- **Public rooms:** first-person facades use the same registered 3 m openings
  and F-operated door state as walking collision. Actual resident bodies now
  appear in that view instead of stopping the player invisibly. Residents yield
  to other residents; a door cannot close onto any present pedestrian.
- **Terrain:** malformed source grids cannot pass the seam audit. Import and
  seam checks also reject sparse arrays, including absent interior samples that
  JavaScript `Array.every` previously skipped. No source elevations are invented.
- **CH01 sound:** successful nearby F interactions use distance and wall
  attenuation. Newly spent hostile rounds, including misses, emit one bounded
  stereo cue from their actual fixed-step origin. Pausing, extra render frames
  and checkpoint reload do not replay old shots. Mute and effects volume apply.
  These are synthesized preview sounds, not recorded or calibrated real firearms.
- **CH01 information:** the live HUD and brief objective no longer reveal a
  global remaining-enemy count. The captain reports his own observed result.
- **BR96:** the renderer checks the actual person-to-camera line against public
  walls, closing gaps between sampled rays. Focusing chat or another editable
  control clears held movement/sprint and sends the ordinary neutral command;
  returning focus does not restart an old key press.

## Preserved owner requirements

- Windows PC, keyboard/mouse; F for nearby interaction and middle-click marks.
- Story first, BR later with shared world assets; BR target remains 6 × 16 humans.
- Development allocation: map 35%, story 35%, BR 20%, stabilization 10%, assessed
  over multiple iterations rather than lines of code or test counts.
- Campaign target: 12 hours, combat 50%, urgent movement/rescue 20%,
  character/narrative 22%, exploration 8%. The obsolete 60–65% entry in the
  requirement matrix has been corrected.
- Full Aden at 1:1 remains the production goal. Today's artist-authored civilian
  preview is explicitly not a surveyed reconstruction. 이수혁, 김지윤, 조현지 and
  the pre-departure briefing in Korea remain in the story. Optional documents
  are not new progression requirements.
- Finite ammunition, no shield or magical healing, existing V2 checkpoints,
  60 Hz simulation independent of the 165 Hz display target, and no FortisGuard
  integration or modification of other repositories.

## Verification and remaining work

Regression coverage exercises actual camera-relative keyboard movement,
door collision/render agreement, drawn resident bodies, sparse terrain input,
editable-control movement release, stereo gain/pan, and a real CH01 missed-shot
step followed by pause and checkpoint restoration. Existing full Node,
four-viewport Chromium, both CH01 endings, offline ZIP and Windows host EXE
gates remain mandatory. Local Chromium startup is blocked by this workspace's
socket restrictions; browser acceptance must come from GitHub's actual Linux
and Windows runners, not a mock result.

The full surveyed city, game-ready environment/character assets and recorded
sound, remaining playable campaign chapters, native UE5 compilation/PIE,
96-human public-network playtesting, and RTX 3070/QHD/16 GB performance measurements
are still unfinished or unverified. The owner has deferred native PC UE5 work;
browser-host EXE packaging does not satisfy that native gate. Further development
should prioritize connected map-and-campaign gameplay over additional isolated
optional civic interactions. The November 27 demo target does not certify a
complete 12-hour game.
