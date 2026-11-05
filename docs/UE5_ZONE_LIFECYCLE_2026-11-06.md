# VEILPOINT native UE5 zone lifecycle — 2026-11-06

**Defect:** the existing native server safe-zone incremented its phase by 0.25 seconds per timer callback. Server hitches could delay phase/countdown progression. The timer also continued after a round ended.

**Implemented:** zone time is derived from the authoritative server world clock, sampled at BeginPlay. The timer is cleared when replicated GameState reports a completed round. Phase/radius/countdown and the existing browser BR/CH01 files are preserved.

**Automated evidence:** `tests/unreal-native-zone-lifecycle.test.cjs` covers UE5 source contracts. A passing Node/CI job is not a UE5 C++ compile or a Windows runtime test.

**Remaining:** verify native BuildCookRun, two-client PIE zone progression after a server hitch, final-match freeze, Win64 executable startup, and RTX 3070/QHD frame timings. Do not report native executable as complete before those checks.
