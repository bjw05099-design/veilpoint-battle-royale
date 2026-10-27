# VEILPOINT Changelog

## 1.1.0 — 2026-10-27

- Created `src/clock.js` to decouple 60Hz gameplay updates from render FPS.
- Enforced upper limits on catch-up ticks after pauses, backgrounding, and slow frames.
- Updated browser loop to use a fixed simulation step and reset on focus loss.
- Added seven focused timing/determinism tests (`tests/clock.test.cjs`).
- Extended quality gates and updated browser build markers.

## 1.0.0

- Original offline browser battle royale demo and Unreal project scaffold.
