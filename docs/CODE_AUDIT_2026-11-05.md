# VEILPOINT code and release evidence audit — 2026-11-05

## Scope and preservation

Audit baseline: `main` at `d0c4aa020e6e653cb08db29caf570a7f6b76535c`.
Repository: `bjw05099-design/veilpoint-battle-royale` only.
The project includes the existing offline browser BR and CH01 controllers, their deterministic 60Hz rules, save/restore, Windows keyboard/mouse bindings, renderer prototypes, and a **separate uncompiled Unreal Engine 5.8 source project** in `Unreal/Veilpoint`. These are separate deliverables. Neither project is deleted or reset by the audit.

### Verified repository evidence

| Change | PR and merge SHA | Evidence verified | Scope limitation |
|---|---|---|---|
| CH01 two-confirm rewind | [#396](https://github.com/bjw05099-design/veilpoint-battle-royale/pull/396) · `b9e53d3e3188b7589206c0c8cd8c523aaee636e3` | GitHub Node CI passed (1,214 tests) | Not human Windows gameplay |
| UE5 source sprint/HUD | [#397](https://github.com/bjw05099-design/veilpoint-battle-royale/pull/397) · `d0c4aa020e6e653cb08db29caf570a7f6b76535c` | GitHub Node CI passed (1,218 tests), native **source/static contract** checks | **Not** UE5 compile, native Windows executable or FPS measurement |
| CH01 backup promotion readback | [#398](https://github.com/bjw05099-design/veilpoint-battle-royale/pull/398) · `a8241a44f8843b88945dd446823a8f04b5cc4a3f` | [Actions 42047057201](https://github.com/bjw05099-design/veilpoint-battle-royale/actions/runs/42047057201): 1,220 pass, 0 fail; both `veilpoint-browser-prototype` and `veilpoint-offline-demo-candidate` artifacts | Cross-tab localStorage writes cannot be made globally atomic |

The previous PR's exact head SHA was checked against its GitHub Actions jobs and offline ZIP/checksum artifacts before squash merge. GitHub history is authoritative for recording what was committed; a PR alone is not proof that hardware, UBT or a Windows runtime was exercised.

### Defects confirmed in audit

1. The CH01 backup-promotion path formerly accepted a reported `setItem()` success without confirming the primary slot held the **exact** validated backup. PR #398 now checks both primary and backup generations again. Failed readback leaves the mission playable but disables unsafe overwriting.
2. The original UE5 character prototype began with an `80`-point arcade `Shield` health buffer and spawned simulated `armor` pickups, conflicting with the game's no-arcade-shield requirement. Native code is being corrected so damage affects finite health directly and invalid/full pickups are **not** consumed. This is separate from the unchanged browser prototype.
3. The current `.github/workflows/ci.yml` checks JavaScript syntax, deterministic Node/browser simulation tests, Unreal project descriptor JSON, and reproducible offline demo ZIP/checksums. It does **not** run Unreal Build Tool, Unreal Editor, a Win64 build, a GPU benchmark or a 12-hour campaign acceptance test.

### Evidence gates remaining unverified

- Run an actual Windows Unreal Engine **5.8** editor compile of `Unreal/Veilpoint/Veilpoint.uproject`; record build log and version. Text checks cannot prove Unreal UHT/C++ correctness.
- Package and launch a standalone Windows `.exe` on the target machine; exercise mouse lock, Sprint/Crouch interactions, player state replication and the native HUD.
- Record RTX 3070 / QHD 2560×1440 / 16 GB system RAM performance under **each** graphics preset. The 165 Hz display is not a 165 FPS guarantee.
- Perform a full human BR and CH01 offline mission completion/resume pass. Inspect real screenshots, accessibility, artifacts, permissions and the existing `docs/DEMO_DELIVERY_GATES.md` checklist.
- Validate native resource progression/balancing in PIE and multiplayer PIE. Browser and UE5 physics/state should be compared explicitly rather than assumed identical.
- Treat `localStorage` cross-tab comparison as a best-effort conflict check, not an atomic database transaction.

### Preservation and iteration policy

Do not silently drop story characters, original Sahir/Nahrin campaign, finite world state, original art/licensing requirements, or existing saved data. Do not combine BR and CH01 storage namespaces. Keep November 27 browser/offline demo P0 primary while making verified incremental native UE5 changes toward the April 27 goal. A failed or pending exact-HEAD CI must leave its PR open, not be reported as a release. Verify `npm run verify`, `npm run package:demo`, ZIP integrity, and use an `expected_head_sha` guarded squash merge after success.
