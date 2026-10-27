# 31-day production roadmap — VEILPOINT

This is a prioritization proposal, not a guarantee of features, quality or hourly contributions. Changes should be inspected and committed only after tests succeed. Never report an unverified milestone as complete.

## Phase 0 — 2026-10-27 before 11:00 KST

- [x] Browser-based battle royale proof of play
- [x] Offline deterministic match simulation and test suite
- [x] Procedural 3D renderer with fallback and mobile controls
- [x] Initial UE5.8 native architecture scaffold
- [x] CI unit-test pipeline definition
- [ ] GPU-side browser shader validation on target PC/mobile
- [ ] UE project compilation in Unreal Engine 5.8
- [ ] Independent GitHub repository publish (blocked until created/authorized)

## Week 1 — gameplay foundations and UE engine parity

- Replace grayboxing with production art blockout and benchmark representative scenes
- Native Unreal level, possession, collision, camera locomotion and authoritative match transitions
- Introduce replicated GameState and UI, managed world events and loot spawner
- Dedicated server prototype and local 2+ client testing

## Week 2 — world fidelity and motion

- Licensed scanned assets, Nanite topology validation, landscape and vegetation culling
- PBR surface assets, lighting reference capture, Lumen and Virtual Shadow Maps tiers
- Retargeted player locomotion/interaction animations, positional sound
- Camera/lens profiles with adjustable motion intensity and accessibility toggles

## Week 3 — multiplayer and game systems

- Server-authoritative position/resource checks, latency-aware movement
- Matchmaking/lobby integration and reconnection design
- World streaming, replication profiling, state recovery tests
- Accessibility, graphics options, save/settings and input remapping

## Week 4 — hardening and public-quality decision

- Measured performance on specific GPU/CPU tiers and scalability presets
- Anti-tamper/anti-cheat architecture review, cloud infrastructure threat model
- CI package/smoke test, error handling, crash metrics with privacy controls
- QA checklist, long-session stability, deterministic replay and release notes

## Quality gates to avoid false promises

The claim "surpasses Bodycam visual fidelity" is **not accepted** until blind comparisons on matched scenes and specified display/graphics settings demonstrate it, with frame-time and minimum FPS published. Shader configuration alone cannot deliver photorealism. It additionally requires assets, natural animation, high-quality lighting, scene composition, sound, performance tuning, and extensive QA.

Future hourly automation runs are not a persistent game server or autonomous compilation system. They can only attempt GitHub changes when repository and permitted tools are available in that run; results and blockers must be reported accurately.
