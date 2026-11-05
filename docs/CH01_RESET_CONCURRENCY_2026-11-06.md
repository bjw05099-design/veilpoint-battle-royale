# CH01 New Game concurrent reset audit — 2026-11-06

Confirmed risk: the New Game handler could delete a new primary checkpoint written by another browser tab after clearing the previous backup. The reset now rereads the primary and deletes it only if it still exactly matches the generation observed when reset began. If the primary changes, the reset is rejected and old/other-tab records are protected. An already-present rollback restores the original backup only into an empty slot.

Regression: `tests/story-reset-backup.test.cjs` exercises blocked deletion, successful reset, primary replacement, backup replacement, and originally corrupt primary. Scope: browser localStorage best-effort read-before-delete, not an atomic cross-tab transaction. BR save format, CH01 mission state, and UE5 code are unchanged.
