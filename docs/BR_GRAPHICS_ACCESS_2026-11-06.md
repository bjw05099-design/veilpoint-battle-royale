# VEILPOINT BR graphics settings — Windows keyboard/mouse access

## Issue
While the browser owns the mouse pointer for aiming, the HUD's top-right graphics button cannot be clicked until pointer lock is released. Although G already existed as a shortcut, the pause menu did not expose an obvious equivalent control. Closing the panel also lacked consistent focus/ARIA state.

## Implemented
- The BR pause/start menu has a dedicated **그래픽·키보드 설정 (G)** button.
- The game HUD explains **ESC → graphics settings** or pressing G directly.
- One controller handles HUD, menu, and G inputs; opening during play pauses the existing 60Hz world and releases pointer lock.
- Closing restores focus to the actual opener, updates `aria-expanded` and leaves the game paused until explicit Continue.
- G closes an already-open panel even when a settings button/select is focused; Escape dismisses settings before resuming. Keyboard remapping capture retains priority.

## Verification and limitations
Browser controller regression cases cover live pointer lock, Escape, menu button access, focus, freeze of elapsed simulation/inventory, and explicit same-world resume. GitHub Node DOM/WebGL stubs do not prove physical Windows mouse behavior or graphical render quality. User-side Windows browser test at 2560×1440 is still necessary. Existing BR/CH01 save generation format and 11/27 demo target were not changed. This is a one-off manual code revision; it does not resume the paused VEILPOINT hourly automation.
