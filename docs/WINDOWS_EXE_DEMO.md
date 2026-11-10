# VEILPOINT Windows offline EXE demo acceptance (2026-11-27)

## Deliverable classification

**Windows EXE demo (WebView2 wrapper, candidate):** `VEILPOINT.Demo.exe`
is a real Windows x64 desktop application that **starts CH01 first** while
retaining separate optional BR and original terrain preview buttons. It uses the installed Microsoft Edge WebView2
Evergreen runtime for rendering and game input. It is **not** UE5-native, an
independent game renderer, a native gameplay port, or the 2027-04-27 final target.

**Browser ZIP:** The existing `veilpoint-offline-demo.zip` remains the main
November P0 development and fallback demo deliverable. No existing save schema,
gameplay source, 60Hz clock, Windows keyboard/mouse controls, or assets are
deleted. Its warning that *that browser ZIP* contains no EXE remains true.

**Native Unreal game:** A separate UE5.8 Windows `.exe` from Unreal Build
Tool/RunUAT is a later milestone and is not supplied by the wrapper.

## Local Windows build

Prerequisites: Windows 10/11 x64, Node.js 22, .NET SDK **10**, Internet access
during build for .NET and NuGet package restore. The built package itself does
not require the Internet to run; it DOES require an installed Microsoft Edge
WebView2 Evergreen runtime. Build dependencies and Microsoft runtime licensing
must be reviewed before distribution.

From the repository root in PowerShell:

```powershell
./scripts/package-windows-demo.ps1
```

The command:
1. Builds and independently verifies the existing static browser ZIP, including
   asset closure, ZIP CRC32, SHA-256 sidecar and `MANIFEST.sha256`.
2. Runs `dotnet publish` for Win64 Release with self-contained .NET 10 and a
   single-file `VEILPOINT.Demo.exe`. WebView2Loader.dll remains a native
   companion where published by the SDK; all publisher outputs are retained.
3. Verifies PE executable header, WebView2 native loader and bundled BR/CH01
   sources. It extracts the browser ZIP as `game/`.
4. Produces `dist/windows-exe/veilpoint-windows-demo-exe.zip` and
   `veilpoint-windows-demo-exe.zip.sha256`. It re-extracts the packaged Windows
   ZIP and verifies expected files and the ZIP hash.
5. Executes the compiled Win64 `VEILPOINT.Demo.exe --verify-package` against
   its extracted game payload, expecting exit code 0. Then deliberately corrupts
   a **disposable test copy** of `game/src/app.js` and executes the same real
   PE again, expecting a nonzero exit code. The release ZIP is never modified.

The EXE performs that same file check when a player starts the graphical app,
before WebView2 loads JavaScript: it enforces the included SHA-256 manifest,
rejects missing/unlisted files, symlinks and excessive file sizes. This detects
accidental corruption or incomplete extraction, **not** a malicious adversary
who can rewrite the whole unsigned ZIP and its checksums. The noninteractive
preflight confirms the Windows PE can run validation logic, **not** that its
WebView2 game window has launched successfully.

The Windows candidate artifact uses a 45-day retention policy so a build produced
before the November 27 demo target remains available through its first acceptance
window. Each new PR/head still requires its own passing Windows and browser checks.

The separate GitHub Actions workflow
`/.github/workflows/windows-demo-exe.yml` performs this on `windows-latest`.
If its entire job succeeds, download the artifact named
`veilpoint-windows-demo-exe-candidate`. Extract the GitHub artifact ZIP, then
extract the release ZIP; open `VEILPOINT.Demo.exe` from its extracted folder.
**Do not move or delete the `game/` folder or native loader DLLs.**

## Story-first startup and optional restricted mode

- Ordinary `VEILPOINT.Demo.exe` opens `story.html` immediately; the BR and
  original synthetic terrain buttons remain available in this **combined
  development preview** for regression work.
- To launch CH01 without any BR/terrain navigation, use
  `.\VEILPOINT.Demo.exe --story-only` in PowerShell after extracting the
  package. The host hides the other navigation buttons **and** blocks both
  top-level navigation and new-window requests to their pages, including
  in-page links.
- **This is not a separately compiled UE5 game or a BR-free distribution
  archive.** The same combined WebView2 asset payload remains bundled.
  The mixed host retains its existing `%LOCALAPPDATA%\VEILPOINT\DemoHost\WebView2`
  profile; `--story-only` uses a distinct `...\DemoHost\StoryOnly`
  profile to avoid importing development BR session state into the
  story-only launch. Checkpoints do not auto-migrate between the profiles.
  Only `veilpoint-story-preview.zip` is packaged without the BR entrypoint;
  a native story-only Windows game still needs a separate build and playtest.

## Offline runtime and saves

The wrapper maps only local extracted `game/` assets to a fixed local virtual
host `https://veilpoint.local/` inside WebView2, without starting an HTTP
server. The combined host permits only `story.html`, `index.html` and `terrain.html`; the `--story-only` mode permits only `story.html`;
external HTTP(S) subresource requests are blocked, new windows are blocked,
and developer tools are disabled. These measures reduce accidental remote
resource loads; they are not a security audit or anti-cheat solution.

The mixed WebView2 host keeps checkpoints in
`%LOCALAPPDATA%\VEILPOINT\DemoHost\WebView2`. The optional `--story-only`
mode uses `%LOCALAPPDATA%\VEILPOINT\DemoHost\StoryOnly` instead.
Both are separate from `file://` browser checkpoints. Moving a release
folder does not change the virtual origin, but clearing its corresponding
profile deletes that host's stored progress; story and BR keys remain
independent in the mixed profile.

## Honest release gates

- [ ] Windows CI compiles the Win64 EXE at the exact release HEAD and uploads a
      release ZIP plus matching SHA-256 digest; retain the run URL and manifest.
- [ ] A Windows 10 or 11 x64 device with WebView2 installed launches the EXE
      and renders the actual BR and CH01 menus offline.
- [ ] End-to-end Windows keyboard/mouse playthrough: **CH01 launches first**, route
      decision, completion and restart; verify the mixed host's BR entry and
      the `--story-only` mode's blocked BR/terrain navigation separately.
- [ ] 60Hz simulation unaffected by rendering cap; verify real pause/resume,
      pointer-lock release, GPU context interruption and save/restore.
- [ ] App can restart without losing either mode's local checkpoint.
- [ ] No unexpected remote fetches in a Windows offline/network-disabled run.
- [ ] Signed, licensed and scanned executable ready for distribution.
- [ ] RTX 3070, QHD 2560x1440, 165Hz, RAM 16GB actual hardware data measured.

Until a checkbox is independently supported by evidence, its criterion remains
**unverified**. GitHub Actions compile and ZIP validation alone cannot prove
human-playable BR/CH01, WebView2 availability on the target machine, or sustained
165 FPS. Microsoft WebView2 browser-runtime packaging is distinct from native
UE5 compilation and performance acceptance.
