# VEILPOINT Windows offline EXE demo acceptance (2026-11-27)

## Deliverable classification

**Windows EXE demo (WebView2 wrapper, candidate):** `VEILPOINT.Demo.exe`
is a real Windows x64 desktop application with buttons to run the **existing**
offline BR and CH01 HTML/JS demos. It uses the installed Microsoft Edge WebView2
Evergreen runtime for rendering and game input. It is **not** UE5-native, an
independent game renderer, a native gameplay port, or the 2027-04-27 final target.

**Browser ZIP:** The existing `veilpoint-offline-demo.zip` remains the main
November P0 development and fallback demo deliverable. No existing save schema,
gameplay source, 60Hz clock, Windows keyboard/mouse controls, or assets are
deleted. Its warning that *that browser ZIP* contains no EXE remains true.

**Native Unreal game:** A separate UE5.8 Windows `.exe` from Unreal Build
Tool/RunUAT is a later milestone and is not supplied by the wrapper.

## Local Windows build

Prerequisites: Windows 10/11 x64, Node.js 22, .NET SDK 8, Internet access
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
2. Runs `dotnet publish` for Win64 Release with self-contained .NET 8 and a
   single-file `VEILPOINT.Demo.exe`. WebView2Loader.dll remains a native
   companion where published by the SDK; all publisher outputs are retained.
3. Verifies PE executable header, WebView2 native loader and bundled BR/CH01
   sources. It extracts the browser ZIP as `game/`.
4. Produces `dist/windows-exe/veilpoint-windows-demo-exe.zip` and
   `veilpoint-windows-demo-exe.zip.sha256`. It re-extracts the packaged Windows
   ZIP and verifies expected files and the ZIP hash.

The separate GitHub Actions workflow
`/.github/workflows/windows-demo-exe.yml` performs this on `windows-latest`.
If its entire job succeeds, download the artifact named
`veilpoint-windows-demo-exe-candidate`. Extract the GitHub artifact ZIP, then
extract the release ZIP; open `VEILPOINT.Demo.exe` from its extracted folder.
**Do not move or delete the `game/` folder or native loader DLLs.**

## Offline runtime and saves

The wrapper maps only local extracted `game/` assets to a fixed local virtual
host `https://veilpoint.local/` inside WebView2, without starting an HTTP
server. Top-level navigation is restricted to `index.html` and `story.html`;
external HTTP(S) subresource requests are blocked, new windows are blocked,
and developer tools are disabled. These measures reduce accidental remote
resource loads; they are not a security audit or anti-cheat solution.

WebView2 stores localStorage checkpoints under the user's
`%LOCALAPPDATA%\VEILPOINT\DemoHost\WebView2` profile. This is intentionally
separate from `file://` Chrome/Edge browser checkpoints. Moving the release
folder does not change the virtual origin, but clearing the profile deletes
the wrapper's stored progress. BR and CH01 keep their own existing keys.

## Honest release gates

- [ ] Windows CI compiles the Win64 EXE at the exact PR HEAD and uploads a
      release ZIP plus matching SHA-256 digest.
- [ ] A Windows 10 or 11 x64 device with WebView2 installed launches the EXE
      and renders the actual BR and CH01 menus offline.
- [ ] End-to-end keyboard/mouse playthrough: BR start, movement, result and
      replay; CH01 route decision, completion and restart.
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
