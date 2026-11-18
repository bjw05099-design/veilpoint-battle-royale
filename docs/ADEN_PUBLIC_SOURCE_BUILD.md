# 아덴 1:1 지도 원본 빌드

VEILPOINT의 아덴 본맵은 실제 고도·도로·일반 시가지 배치를 출발점으로
삼는다. CH01의 별도 대피소 블록아웃은 임무와 충돌을 시험하는 데 사용한다.
맵 원본의 위치 기준은 WGS84 / UTM 38N이며, 게임 월드 1단위는 1m다.
Unreal에서는 100cm를 1m로 사용한다.

## 플레이용 아덴 CH01

GitHub Actions의 `veilpoint-aden-ch01-playable` 산출물에
`veilpoint-aden-ch01.zip`이 들어 있다. 압축을 푼 뒤 `index.html`을
Edge 또는 Chrome에서 열면 네트워크 없이 플레이할 수 있다.
실제 도로 중심선에서 수신 기록 확인, 재전송 대조, 살마에게 인계를
진행한다. WASD로 걷고 F로 확인하며 V로 지도와 눈높이 시점을 전환한다.
진행 기록은 브라우저에 보관한다.

두 시점과 이동에 같은 공개 지형 및 건물 외곽을 사용한다. 건물 외곽은
원본의 윤곽과 방향을 유지하며, 입력에 없는 높이와 실내는 생략한다.
이 임무는 공개 지형 위에 구성한 창작 이야기다. 2015년 당시 도시
배치를 입증하지 않는다.

| 출력 | 범위와 용도 |
|---|---|
| `aden-public-surface.tif` | 40.96 × 35.84km 지형 표면, 32m 격자, EGM2008 고도. 도시 주변의 육지와 해역을 포함하는 작업 범위 |
| `aden-pilot-heightfield.json` | 동쪽 반도 일부의 3.584 × 3.584km, 512m 타일 49장. `terrain.html`에서 오프라인 파일로 열 수 있음 |
| `ue5-r16/` | 같은 범위의 505 × 505 표본 R16 파일 49장. 84개 공유 경계의 모든 표본을 비교 |
| `aden-civilian-pilot.geojson` | 위 타일 안에 등록한 OpenStreetMap 도로 중심선 183개와 소형 건물 외곽선 4,865개. CRS는 EPSG:4326 |
| `ADEN_SOURCE.json` | 원본 해시, 좌표 변환, 고도 기준, 범위, 자료별 기준일 |

좌표 변환은 동쪽 값을 게임 X, 북쪽 값의 감소분을 게임 Z에 대응시킨다.
정확한 기준점은 `ADEN_SOURCE.json`의 `gameZeroUTMMetres`에 있다.
GeoTIFF와 GeoJSON을 QGIS 등에 함께 열면 투영을 맞춰 비교할 수 있다.
UE5 지형 연구 레벨을 저작하기 전에 R16 디렉터리의 파일들을
`Unreal/Veilpoint/Saved/CityTiles/`에 놓는다. 그러면 저작기가 타일 안에
실제 검사 시작 위치를 배치한다. 원본 파일과 좌표 변환의 검증은
Unreal 에디터 실행 또는 본편 월드 편입 검증과 별개다.

## 범위와 시점

Copernicus GLO-30 Public 2021 배포본의 두 원본 지표면 GeoTIFF를
병합하고 UTM 기준으로 보간했다. 505 × 505 내보내기는 Unreal용 파일
규격이며 원본보다 정밀한 실측값을 추가하지 않는다. OpenStreetMap
소스는 2026-11-18에 취득했다. 2015년과 현재의 해안선 변화, 건물 높이,
외장·실내, 실제 도시 경계, 비공개 구역은 별도 확인이 필요하다.
4,865개 외곽은 지도에 기록된 소형 형상으로, 용도·층수까지 확인하지
않았다. 시설명, 출입 통제, 경비 정보나 내부·시설 운영 데이터를
포함하지 않는다. 명시적으로 식별된 제한 시설 주변과 제한 통행로는
소스 범위에서 제외했다.

## 소스와 권리

- Copernicus GLO-30 Public. [공개 배포와 제품 안내](https://registry.opendata.aws/copernicus-dem/)
- OpenStreetMap 민간 지도 파생 데이터는 ODbL 1.0으로 배포한다. [출처 표시](https://www.openstreetmap.org/copyright) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)

> produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved
