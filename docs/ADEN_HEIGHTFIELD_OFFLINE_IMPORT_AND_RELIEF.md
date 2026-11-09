# VEILPOINT — 오프라인 지형 타일 반입·입체 시각화 (2026-11-10)

## 구현 목표와 실제 상태

PR의 개발 초점은 **아덴 전체 민간 도시 1:1 제작을 위한 지형 반입 경로**와 **실제 고도값으로 계산한 입체 지형 표현**입니다. 신규 `terrain.html` 화면은 본편 BR/CH01/BR96 게임과 분리되어 있고, **2026-11-10 기준 실제 아덴 검증 고도 타일은 0개**입니다. 자체 생성한 512m × 512m 샘플 타일과 저층 창작 건물은 정확한 실측 아덴의 형태를 증명하지 않습니다.

## 로컬 타일 JSON 규약

페이지 하단 **로컬 고도 JSON 파일**에서만 파일을 선택합니다. 업로드/웹 요청/외부 서버 저장은 없습니다. 최대 4MiB, 한 번에 49타일, 타일당 17×17·33×33·65×65 고도 샘플(단위 **미터**). 타일 경계끼리 높이가 15cm 넘게 어긋나면 입력을 거부하고, 이웃끼리 샘플 해상도가 달라도 거부합니다. 누락된 타일은 여전히 누락으로 표시합니다.

파일 전체 구조 예시 (**실제 아덴 데이터 아님**):

```json
{
  "format": "veilpoint-heightfield-v1",
  "coordinateSystem": "local-metre-unreferenced",
  "title": "Original test surface",
  "tiles": [{
    "tx": 0, "tz": 0,
    "gridSize": 17,
    "samples": ["17x17 = 289 real finite metre heights; replace this explanation before importing"],
    "source": {
      "provider": "Original VEILPOINT terrain artist",
      "observedDate": "2026-11-10",
      "license": "Original art; author controls rights",
      "reference": "Original independently authored synthetic test surface",
      "scope": "public-terrain",
      "type": "artist-blockout"
    }
  }]
}
```

위 설명 자리의 `samples`는 실제로 숫자 289개가 들어간 배열로 교체해야 입력됩니다. 다른 허용 해상도의 경우 행 우선(row-major) `gridSize²`개가 필요합니다. `tx,tz`는 **익명적인 로컬 512m 타일 번호**이며 GPS 위도·경도 좌표가 아닙니다. 타일에 좌표를 직접 덧붙이거나 현재 운영 시설·부대 정보·검문 위치 같은 필드를 추가하면 거부합니다. 제공자·라이선스·관측일은 **선언된 값일 뿐**, 입력 성공이 저작권 허가·위성 실측 정확도·실제 시가지 등록을 인증하지 않습니다.

## 실제로 변경된 동작

1. `src/aden-citywide-tiles.js`: `importHeightDataset`, `auditRegistrySeams`; 검증에 실패하면 기존 표시 데이터를 유지합니다.
2. `src/aden-map-relief.js`: 각 삼각형의 월드 미터 기울기에서 법선과 햇빛 음영 계산, 25m 간격 등고선 교차점 보간, 고도에 비례해 화면을 들어 올리는 2.5D 투영. 이 수치는 실제 산림/기상/촬영 조건을 재현하지 않는 시각화입니다.
3. `src/aden-city-explorer.js`: 기존 25타일 계산·캐시·이동·LOD 기능 유지하면서 위 입체 경관과 등고선을 표시. 외부 타일을 열면 창작 주거 모형 105개는 숨기고 입력한 고도만 그립니다. 창작 지형 복원 버튼이 있습니다.
4. `terrain.html`: 키보드 `H` = 지형 입체도 전환, `C` = 등고선 전환. WASD·방향키·확대·축소·원점 복원은 그대로 유지합니다. 화면은 모든 자료 상태를 "외부 검증 전"으로 표현합니다.

## 추후 진짜 아덴 지도 완성을 위한 순서

- 자료 제공자의 이용약관·실제 취득일·고도 기준 및 범위를 검증한 뒤 **민간 공개 지형**만 별도 반입한다. NASA·UNESCO 지형 맥락 설명은 개별 건물의 측량 근거가 될 수 없다.
- 실제 자료에는 DEM인지 DSM인지, 수직 기준면, 표본 간격, 해안선 기준 날짜, 불확실도, ODbL·데이터 제공기관의 권리 조건을 기록한다.
- UE5 Landscape/World Partition 원본 자산으로 구축하고 주변 512m 격자 간 높이, 충돌, 네비게이션 및 HLOD 이음새를 실제 엔진으로 확인한다. 이 PR은 **브라우저 지도 연구 페이지**를 개선한 것이며 네이티브 UE5의 실제 도시 지형 스트리밍이 아니다.
- 민간 구역을 크레이터·타와히·마알라·코르막사르·내륙 생활권으로 단계적으로 확인하되, 현행 분쟁에 관계된 제한·민감 시설의 정밀 내부나 운영 배치를 직접 재현하지 않는다.

## 검증 기준

독립 Node 지형 수학 검사, 브라우저 내 로컬 파일 처리, 타일 경계·이종 샘플 수·허위 GPS 필드 거부, 실제 Canvas 삼각형·등고선 호출, 기존 CH01/BR/BR96 및 오프라인 ZIP/Windows 브라우저 호스트 후보 CI를 확인한다. **UE5 UnrealBuildTool 및 실제 RTX3070 PC 성능 측정은 별개의 미확인 항목**이다.
