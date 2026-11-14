# VEILPOINT 개발 도구와 Windows 빌드 PC 연결

이 구성은 개발용 도구를 설치하고 실제 파일 생성·변환을 검사한다. 사용자 PC의 설치나 연결 여부는 별도로 확인해야 한다. `agent-desktop`의 설치는 이 채팅에 대한 원격 접속을 자동으로 만들지 않는다. 현재 프로젝트의 Unreal 대상 버전은 **5.8**이다.

## Windows에서 처음 한 번

1. Git이 없다면 PowerShell에서 `winget install --id Git.Git --exact --source winget`을 실행하고 새 터미널을 연다.
2. 기존 체크아웃이 없으면 아래 명령으로 받는다. 기존 작업 폴더가 있다면 변경 사항을 보존하면서 최신 main을 받는다.

```powershell
git clone https://github.com/bjw05099-design/veilpoint-battle-royale.git C:\VEILPOINT
cd C:\VEILPOINT
.\SETUP_GAME_DEV.cmd
```

3. 설치 창의 필요한 Windows 권한 요청을 처리한다. Epic Games Launcher에서 본인의 계정으로 로그인하고 **Unreal Engine 5.8**을 설치한다. 엔진 계정·라이선스·다운로드는 이 설치 코드가 대신 처리하지 않는다. Visual Studio 2022 **17.14 이상**, C++ 도구, Windows SDK 26100 구성은 `tools/game-dev/windows.vsconfig`를 사용한다. 기존에 적합한 도구가 있으면 `scripts/setup-game-dev.ps1 -Install -SkipBuildTools`로 중복 설치를 피할 수 있다.
4. 같은 PC에서 GitHub 본인 계정을 연결한다. 토큰이나 비밀번호를 채팅에 붙여 넣을 필요가 없다.

```powershell
gh auth login --scopes repo,workflow
.\CONNECT_BUILD_PC.cmd
```

엔진 경로가 기본값과 다르면 다음과 같이 지정한다.

```powershell
.\scripts\connect-build-pc.ps1 -EngineRoot 'D:\Epic Games\UE_5.8'
```

5. 연결 코드가 만든 **비공개** `bjw05099-design/veilpoint-build-pc` 저장소를 ChatGPT의 GitHub 연결이 읽고 쓸 수 있도록 허용한다. 그다음 `START_BUILD_PC.cmd`를 실행하고 창을 열어 둔다. `Ctrl+C`로 작업 수신을 중지한다. 시작 프로그램이나 백그라운드 서비스는 자동으로 등록하지 않는다.

첫 작업은 `preflight`다. 이것이 성공하고 비공개 저장소의 실행 결과를 확인한 후에 실제 `compile` 또는 `author-package` 작업을 요청할 수 있다. PC가 꺼져 있거나 실행기 창이 닫혀 있으면 작업은 실행되지 않는다.

## 설치하는 도구

| 도구 | 용도 | 설치 방식 |
|---|---|---|
| agent-desktop 1.3.1 + 원본 소스 | 로컬 앱 관찰·조작, 로컬 MCP | 공식 릴리스 SHA-256와 소스 커밋 고정 |
| Blender 5.2.4 LTS | 모델 제작, GLB/FBX, 편집 원본 | 공식 휴대용 배포본 SHA-256 고정 |
| glTF Transform 4.5.1 | 메시 정리·LOD 생성 | 별도 npm 환경과 lockfile |
| meshoptimizer 1.3.0 | 메시 단순화 | 별도 npm 환경과 lockfile |
| Khronos glTF Validator 2.0.0-dev.3.10 | 모델 형식·버퍼 검사 | 별도 npm 환경과 lockfile |
| trimesh 5.2.1 / Open3D 0.20.0 | 크기·메시·광선 충돌·포인트클라우드 처리 | 별도 Python 가상환경 |
| xatlas 0.0.11 | UV 아틀라스 | 별도 Python 가상환경 |
| pyproj 3.8.0 / Rasterio 1.5.2 | 좌표계·지형 래스터 처리 | 별도 Python 가상환경 |
| Ruff 0.17.5 | Python 코드 검사 | 별도 Python 가상환경 |
| CMake 4.4.4 / Ninja 1.13.2 | 네이티브 개발 도구 빌드 | 별도 Python 가상환경의 실행 파일 |
| Tracy 0.15.0 | 프레임 분석·추적 데이터 변환 | 공식 릴리스 SHA-256 고정 |
| Git LFS / FFmpeg | 대용량 자산 관리·음원 변환 | 기존 설치 확인, Windows 설치에 포함 |
| RenderDoc | 실제 GPU 프레임 분석 | Windows 설치에 포함; GPU 캡처는 별도 검증 |

GitHub CLI·Git·Node·Python 및 Epic Games Launcher·Visual Studio는 Windows 준비 과정에 포함된다. Unreal과 Visual Studio는 오픈 소스로 분류하지 않는다. 실행 파일과 의존성은 `.tools/` 및 개발용 `node_modules/`에 저장하며 게임 실행 패키지에는 포함하지 않는다. Python의 직접 의존성은 버전을 고정하고, 실제 해결된 의존성과 다운로드 해시는 `.tools/python-install-report.json`에 기록한다.

## 실제로 수행하는 자산 제작

`src/simulation.js`의 항구 벽·화물 치수를 추출 → Blender에서 생성 → `.blend`, GLB, FBX 및 UCX 충돌 상자 생성 → Khronos 검사 → glTF Transform/meshoptimizer로 LOD 생성 → Open3D로 양쪽 출입구와 천장 검사 순서다.

```powershell
py -3.13 tools/game-dev/run-checks.py --install-python
```

Linux에서는 `python scripts/install-game-tools.py --tools agent-desktop blender tracy --with-agent-source`, `npm ci --prefix tools/game-dev --ignore-scripts`, `python tools/game-dev/run-checks.py --install-python`을 순서대로 실행한다. 이미 설치한 Python 환경을 재사용할 때는 마지막 명령의 `--install-python`을 생략한다.

출력은 `dist/game-assets/harbor/`와 `dist/game-dev/`에 있다. 최초 Linux 검증에서는 삼각형 **984 → 388**, GLB **45,640 → 18,932 bytes**, glTF 오류·경고 **0**을 확인했다. 원본 구조물은 **16 × 20 × 9.18m**, 양쪽 출입구는 **4m**다. 이는 원본 프로토타입 자산이며 아덴 실측 건물이나 완성된 실사 아트라는 의미가 아니다. 지형 입출력과 좌표계 검사는 합성 데이터이며 실제 도시 지형 수집을 완료했다는 뜻도 아니다.

`VEILPOINT game development tools` CI가 Linux와 Windows에서 실제 Blender 내보내기, GLB 검사, 지형·UV 도구, Tracy 형식 변환을 실행하고 결과 자산을 보관한다. 생성 FBX의 Unreal 임포트와 인게임 렌더는 엔진이 있는 PC에서 별도로 확인해야 한다.

## 로컬 데스크톱 제어와 네이티브 빌드

`.tools/mcp.agent-desktop.json`은 **PC에서 실행되는 MCP 지원 에이전트**를 위한 stdio 설정이다. 원격 HTTP 서버나 공개 포트를 열지 않는다. 먼저 `agent-desktop skills get desktop`, `agent-desktop skills get platform`, `agent-desktop status`로 실제 플랫폼과 권한을 확인한다. 현재 개발용 Linux 환경에서는 실행 파일이 동작하지만 데스크톱 접근 버스가 차단돼 있으며, 이를 다른 PC에 연결됐다는 뜻으로 해석하면 안 된다.

빌드 연결은 [GitHub의 비공개 실행기 안내](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)에 따라 별도 비공개 저장소를 사용한다. 공개 게임 저장소에는 개인 PC 실행기를 등록하지 않는다. 비공개 저장소의 `build-request.json` 형식은 다음과 같다.

```json
{"schema":"veilpoint-pc-build-v1","source_sha":"<main에 이미 병합된 40자리 커밋 SHA>","operation":"compile"}
```

실제 파일에는 SHA를 대입해야 한다. 명령 문자열·외부 저장소·임의 브랜치는 입력받지 않는다. 요청은 소유자와 main으로 제한하며, 게임의 main 이력에 포함된 정확한 커밋을 확인한 뒤 별도 작업 디렉터리에서 실행한다. `compile`은 병렬 작업을 2개로 제한해 Editor 모듈을 빌드한다. 종료 코드가 0이어도 실제 DLL이 없으면 실패 처리한다. `author-package`는 기존 CH01 맵 저작·패키징 검사를 사용한다. **빌드 성공과 게임 실행·GPU 성능 검증은 서로 다른 상태**로 기록한다.

개발 도구 설치만으로 Unreal 네이티브 빌드, 실제 96인 인터넷 대전, RTX 3070 성능 측정이 완료되는 것은 아니다. PC 연결 후 해당 작업을 실행한 증거를 확인해야 한다.

## GitHub 인기 프로젝트 조사

2026-11-14 GitHub Trending, 게임 개발·메시 처리 주제의 인기순 목록을 살펴보고 관련 후보의 실제 stars·최근 수정·라이선스를 기록했다. `tools/game-dev/github-tool-selection.json`은 **조사 대상 안에서의 비교**이며 GitHub 전체 순위가 아니다.

FFmpeg, Ruff, Tracy, Open3D, meshoptimizer, trimesh, xatlas, Rasterio, glTF Transform, pyproj, glTF Validator를 개발 도구로 채택했다. RenderDoc은 Windows 설치 대상으로 포함했다. Assimp는 현재 Blender 변환 경로로 충족돼 추가하지 않았다. mapshaper는 설치 시 오래된 의존성 경고를 확인해 제거했으며 지도 처리에는 pyproj·Rasterio를 사용한다. 다른 게임 엔진이나 대규모 런타임 라이브러리는 현재 UE5 프로젝트에 필요할 때 따로 검토한다.

공식 프로젝트와 라이선스는 lockfile·조사 기록의 링크를 기준으로 확인한다. stars 수가 유지보수 상태, 라이선스 적합성 또는 VEILPOINT에서의 검증을 대신하지 않는다.
