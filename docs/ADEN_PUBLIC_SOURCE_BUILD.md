# 아덴 1:1 지도 원본 빌드

VEILPOINT의 아덴 본맵은 실제 고도·도로·일반 시가지 배치를 출발점으로
삼는다. CH01의 별도 대피소 블록아웃은 임무와 충돌을 시험하는 데 사용한다.
맵 원본의 위치 기준은 WGS84 / UTM 38N이며, 게임 월드 1단위는 1m다.
Unreal에서는 100cm를 1m로 사용한다.

## Unreal Engine 아덴 CH01

Windows 배포 경로는 Unreal 5.8 Windows 패키지다. 등록된 지형·도로·건물
외곽 데이터는 C++ 모듈에 내장해 임포트 후 네트워크 없이 실행한다.
`CH01_Aden`은 Editor에서 생성하고 다시 연 후 실제 맵 해시를 기록한다.
[네이티브 빌드와 검증](UE5_NATIVE_ADEN_CH01.md)

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
