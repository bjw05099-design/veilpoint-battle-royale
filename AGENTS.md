# VEILPOINT development continuity

- Preserve Windows PC keyboard/mouse controls, F interaction, middle-click marking,
  and story-first delivery. Map/story/BR/stability priorities remain 35/35/20/10.
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
