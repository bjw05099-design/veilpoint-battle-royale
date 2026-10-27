# VEILPOINT architecture

## Browser 1.0 — portable interactive proof

`index.html` contains only markup/style and script entrypoints. `src/simulation.js` is a deterministic game model (CommonJS plus browser global). The model intentionally does not depend on WebGL, the DOM, network access, or clocks except the optional initial seed. `src/renderer.js` provides a proprietary procedural WebGL2 mesh pipeline and no-dependency software fallback. `src/app.js` binds controls, HUD, device support, scene progression, and on-device synthesized audio.

```
input/device -> app loop -> simulation state -> renderer -> browser canvas
                                  |              |
                                  +-> HUD/minimap+
```

The `tick(dt)` simulation clamps steps to avoid a tab-resume time spike. Collisions use AABB/circle checks; line-of-sight tests use segment-box slabs. NPCs are simple proximity agents, not pathfinding AI. The six-zone interpolation is deterministic. All elements are implemented for single-player offline gameplay only: **no network security is implied**.

## Unreal future game

| Module | Responsibility | State |
|---|---|---|
| `AVPCharacter` | Body-mounted camera, movement, replicated vital state, server-validated tag and interaction | Source written; uncompiled |
| `AVPZone` | Replicated radius/phase and server damage rule | Source written; uncompiled |
| `AVPPickup` | Replicated pickup and server proximity validation | Source written; uncompiled |
| `AVPWorldBootstrap` | Temporary geometry-only environment and pickup seeding | Source written; uncompiled |
| `AVPGameMode` | Server-owned phase management / winner detection | Source written; uncompiled |

**Limitations**: Unreal scene art, bot AI, match lobby, dedicated server deployment, anti-cheat, persistent progression, cross-platform controls, UI and actual packaged executable do not exist yet. The UE scaffolding is not feature-parity with the browser demo. The native input mapping uses Unreal's legacy axis/action mapping for asset-free bootstrap; migrating to Enhanced Input assets is recommended. Network replication requires two-client integration tests before being treated as reliable.

## Compatibility

Web browser: modern Chromium, Safari and Firefox with Canvas2D; WebGL2 for the preferred renderer. Mobile browsers need adequate GPU performance. Desktop UE development: Unreal Engine 5.8 and an appropriate C++ toolchain; no engine binary supplied. Fonts use system fonts. No proprietary licensed graphics assets are bundled.
