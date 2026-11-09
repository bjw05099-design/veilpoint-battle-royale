# VEILPOINT UE5 Windows native F9 application-frame benchmark

This documents the **native Unreal Engine 5 C++ prototype**, not the browser EXE host and not a verified RTX 3070 performance result.

## On-device procedure

1. Build and run `Unreal/Veilpoint/Veilpoint.uproject` with Unreal Engine 5 on a Windows PC.
2. Set the graphics preset and the actual OS resolution/refresh. A **165 FPS cap** is not proof of a 165 Hz monitor or delivered frames.
3. Enter an actual playable CH01 or BR scene, then press **F9** once to start capturing. Move around normally and visit several areas rather than leaving the camera pointed at a blank wall.
4. Capture **120 seconds of valid application-frame deltas**. It auto-ends and saves. Press F9 again to stop early (at least 5 seconds and 120 valid frames).
5. The HUD shows `APP-FRAME JSON SAVED TO PROJECT SAVED/BENCHMARKS` when the local file write succeeds. Find `veilpoint-native-YYYYMMDD_HHMMSS.json` inside the Unreal project's `Saved/Benchmarks` folder.
6. Share the **JSON output**, not local account paths or hardware serial numbers, for a future comparison.

## Fields and interpretation

| Field | Meaning | What it **does not** prove |
|---|---|---|
| `schema` | `veilpoint-native-app-frame-v1` | Not a full game release marker |
| `metric` | `application-frame-time-not-gpu` | Not GPU render time or GPU utilization |
| `utc` | Capture end UTC | Not local timezone |
| `full120Seconds` | Whether valid captured frame durations total at least 120s | Not uninterrupted 120s of wall-clock gameplay |
| `validDurationSeconds` | Sum of valid app frame deltas | Does not include focus loss/huge invalid pauses |
| `sampleCount`, `rejectedFrames` | Collected and excluded frame observations | Not network packets |
| `viewportWidth`, `viewportHeight` | Current native game viewport pixels | Not necessarily desktop output resolution |
| `configuredCapFps` | FPS **configuration** at export | Not measured FPS |
| `meanFps`, `meanFrameMs`, `p50FrameMs`, `p95FrameMs`, `p99FrameMs` | Actual app frame observations in this runtime | Not GPU frame time / monitor refresh / server tick performance |

A 120s valid sample window may produce thousands of measurements and is capped at **40,000 frames**. A local capture is initiated by the user, does not send data to ChatGPT or any network service, and records no user account, GPU serial number, other players' identities or physical address.

## Validation limitations

The repository's Node-based CI can check the native C++ file structure and export contract. **It does not compile or execute Unreal Engine** in Linux or Windows browser-host CI. Native UE5 compile, JSON file verification, direct Windows run and GPU measurements require a separate on-device test.

## Distinct from this session's BR96 content

BR96 also gains a **server-authored per-participant round journey** (real traveled metres, sprinted metres, bench-rest duration, personally visited places), only visible when the round is finished. It is not a combat score, rank manipulation or live opponent location feed. It is separate from native FPS benchmarking.
