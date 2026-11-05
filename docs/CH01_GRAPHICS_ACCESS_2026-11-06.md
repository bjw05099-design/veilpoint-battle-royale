# VEILPOINT CH01 Windows settings shortcut — 2026-11-06

## Goal
Keep Windows keyboard/mouse graphics access consistent across browser BR and CH01 without introducing implicit gameplay resumption or another settings panel.

## New behavior
- The CH01 footer now advertises **G 그래픽·키 설정** and its existing start/pause menu includes an explicit **그래픽·PC 설정 (G)** button.
- Pressing G during live pointer-locked CH01 safely calls the existing pause/verified checkpoint path, releases pointer lock and focuses the actual **quality** graphics selector. The 60Hz simulation does not continue behind the menu.
- When settings focus was entered through G or the menu button, G or the first Escape returns focus to Continue while keeping the mission paused. Only another explicit Escape/Continue resumes the existing session.
- Route decisions and field-journal modal controls always retain priority; OS key repeats do not accidentally advance mission state. PC keybinding capture retains priority over the shortcut.
- Existing `veilpoint.graphics` settings and the CH01 save format remain unchanged.

## Validation boundary
`tests/story-browser.test.cjs` exercises the actual CH01 controller via simulated DOM, keyboard events and deterministic 60Hz frames. This does **not** prove real Windows mouse capture, display/GPU quality or native Unreal behavior. User-side QHD Windows browser testing remains a release gate. This was a manual code change; VEILPOINT's paused hourly automation was not enabled.
