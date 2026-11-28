# VEILPOINT development continuity

## Codex and Work

- Allocate about 90% of project effort to Codex and 10% to Work. Use Codex for
  source changes, Unreal implementation, code review, tests, and build
  verification. Use Work for planning and reference research.
- Carry planning decisions into Codex with their scope, source links, and
  acceptance criteria. Start implementation from the latest `main`, review open
  pull requests for overlapping work, and use GitHub to record the changes and
  validation results. For an existing fix, verify its current branch before
  opening a new pull request.
- Use available Codex capacity for development. When limits are visible,
  check the remaining five-hour and weekly allowance before a large increment
  and at validation milestones. Leave enough allowance to complete the
  current increment, verify it and record a clear handoff before starting
  another large one.

## Production development

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
- Allocate 100% of ongoing development to the shared Unreal foundations:
  gameplay firearms, the weapon engine, the physics engine, map implementation,
  animation, and textures and their materials. Story mode and Battle Royale
  each have a 0% share. Keep this allocation until the user changes it.
  Count shared work and its stabilization once. Choose the mix within the
  shared group for the next playable increment.
- Map implementation covers playable Unreal levels, sourced terrain and
  geometry, traversal and collision. Pause development on the field map,
  regional atlas, minimap and their controls, pins and display layers until
  the user resumes map interface work.
- Keep dialogue, cinematics, objectives, branches and encounter placement
  in chapter-owned content. Existing playable scenes can serve as regression
  fixtures for shared work. Check reused assets, gameplay and save recovery
  when a foundation change affects them. Preserve checkpoint identifiers and
  save compatibility.
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
