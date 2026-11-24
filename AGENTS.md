# VEILPOINT development continuity

- Unreal Engine 5.8 in `Unreal/Veilpoint` is the only production runtime and
  development target for the game, maps, Story and Battle Royale. Add playable
  features and release builds through Unreal. Browser and WebView2 prototypes
  are historical references and legacy regression fixtures.
- Author all game scenes directly in the Unreal project, including cinematics,
  in-world broadcasts, lighting, character animation and visual effects. Do not
  use Higgsfield or other external generative media services for VEILPOINT.
  Use source data and supporting tools for asset preparation and validation
  before assembling, rendering and testing the game in Unreal.

- Preserve Windows PC keyboard/mouse controls, F interaction, and middle-click
  marking. Story and Battle Royale ship separately, with story first.
- Allocate ongoing development effort 80% to firearms, the weapon engine,
  the physics engine and maps as a group, 20% to story mode, and 0% to Battle
  Royale. Pause Battle Royale-specific development until the user assigns it
  a new share. Count shared weapon and physics systems, terrain and map
  collision once in the 80% group. Count chapter integration under story
  mode and stabilization under the area being improved. Follow explicit
  user instructions for individual sessions.
- Prioritize reusable Unreal foundations within that allocation: maps, textures
  and materials, character animation, physics and collision, and gameplay
  weapon and combat systems. Author dialogue, cinematics, objectives, branches
  and encounter placements as chapter content layered on those foundations.
  Keep checkpoint identifiers stable and preserve or migrate old saves when
  progression changes. Validate the separation in a playable chapter by
  changing a story beat and checking the reused assets, gameplay and saves.
  See [story-first development plan](docs/STORY_FIRST_RELEASE_PLAN.md#reusable-foundations-and-chapter-content).
- Develop shared world and gameplay physics to the [native physics production standard](docs/NATIVE_PHYSICS_STANDARD.md).
  Use measured physical references where available and verify representative
  motion and collisions in the playable Unreal project.
- Develop gameplay firearms against the [native firearm production standard](docs/NATIVE_WEAPON_RELOAD.md#firearm-production-standard).
  Keep shared weapon behavior separate from each firearm's assets and data so
  both modes can reuse it and chapter changes can select a different loadout.
- Use [the model work allocation guide](docs/MODEL_WORK_ALLOCATION.md) when
  choosing or scoping development work. Use the model and reasoning level
  selected for the session when available. Use Sol 6.2 High as the default
  and minimum reasoning level for Sol development. Explicitly requested work
  takes priority. Use the guide's task criteria when a setting is not visible.
- Build production Aden scenery from registered real-world sources at 1:1
  scale. Preserve the sourced terrain, public road alignment, ordinary
  building footprints and their known dimensions. Missing elevations,
  heights, interiors and historical evidence remain missing. Keep synthetic
  fixtures in the separate developer lab and exclude restricted facility
  interiors and operational details from production inputs.
- Read `docs/GAME_DEV_TOOLCHAIN.md` before asset or native-build work. Prefer the
  installed Blender, geometry/GIS, validation and profiling tools when applicable.
  Portable tool locations live in ignored `.tools/paths.json`; dependencies are
  isolated in `tools/game-dev/node_modules` and `.tools/asset-python`.
- Derive loading-hall assets from the production `harborPassage` geometry through
  `scripts/export-harbor-blender-recipe.cjs`; run the actual Blender/GLB checks.
  Do not add these development dependencies to the offline game runtime.
- A tool installed on this development host is not installed on the user's PC.
  Agent-desktop is a local CLI/stdio MCP server, not an automatic remote connection.
  Check its real platform capabilities before any desktop operation.
- Native PC jobs use the separate private build controller and a full commit SHA
  already merged to the game main branch. Never register a personal PC runner in
  this public repository or run unreviewed pull-request code on it.
- Keep Unreal 5.8 compatibility. Preserve separate evidence for tool installation,
  asset export, native compilation, packaged files, actual game launch and GPU
  measurements. Do not claim full Aden coverage, photorealistic art or 96-human
  WAN validation from synthetic fixtures or a successful package build.
