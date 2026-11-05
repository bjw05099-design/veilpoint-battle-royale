# VEILPOINT browser benchmark offline JSON retrieval — 2026-11-06

## User-impacting failure mode

A Windows browser running `file://index.html` or a restricted embedded browser can refuse `Blob` object URLs or synthetic download actions. Previously **JSON 결과 저장** and the end-screen quick export used only the Blob path; failure could throw an exception, leaving a completed or partial 120-second measurement inaccessible.

## Behavior added

- **JSON 직접 보기·복사** becomes available after at least two measured render callbacks and the benchmark has ended.
- The full, locally generated `veilpoint.browser-benchmark.v1` report is displayed in a read-only, selectable textarea. The player can use **Ctrl+C**, paste into a text editor and save with a `.json` extension. No network request or upload occurs.
- If Blob generation or browser download setup throws, the same verified report is revealed automatically, with a persistent message describing the browser failure and manual export option. The end-screen quick-export button also opens the graphics panel for the fallback.
- The normal Blob download remains the primary path and preserves the existing filename distinction between completed and partial results.
- Starting a new benchmark clears any stale raw JSON, and an armed/running benchmark cannot expose a fabricated report. Opening the fallback during a live round goes through the existing safe pause/pointer-release path.

## Evidence and limits

`tests/br-browser.test.cjs` drives the actual application controller with a deterministic mock Windows browser. New cases verify a partial result, 60Hz simulation freeze, data recovery with blocked `URL.createObjectURL`, successful unchanged downloads, and state reset. Real Windows browser-download policies, GPU timer extensions, QHD 165Hz performance, and actual browser profile testing remain unverified.

This is a manual development session; VEILPOINT time-based automation stays paused. FortisGuard automation and existing BR/CH01 saves remain unchanged.
