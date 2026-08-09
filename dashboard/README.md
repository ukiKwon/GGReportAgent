# 금고은행 입찰 현황 히트맵 대시보드

오프라인 `file://` 더블클릭으로 동작하는 D3 히트맵. 빌드 없음.

## 실행
- `dashboard/index.html` 더블클릭. (D3 번들 `vendor/d3.v7.min.js` 필요 — `vendor/README.txt` 참고.)

## 데이터 교체
- 기관: `data/institutions.js`의 `window.institutions` 배열. 스키마: name/type/region/contractEnd/confidence/sources(1+). **조작 금지 — 근거 없는 데이터 금지.**
- 지도: `geo/{korea,seoul,gyeonggi}.js`의 FeatureCollection을 실제 행정경계 GeoJSON으로 교체(`properties.code`·`properties.name` 유지).
- 화면 편집 후 "institutions.js 내보내기"로 갱신 파일을 받아 `data/`에 교체.

## 테스트
- `node --test "dashboard/test/*.test.js"` (순수 로직: 임박도·검증·정렬·필터·상태·직렬화).
  - **glob 형태를 쓴다.** 디렉터리 형태(`node --test dashboard/test/`)는 이 Node/Windows
    환경에서 `Cannot find module …\dashboard\test`로 죽는다 — 테스트가 깨진 게 아니라
    실행 형태가 안 먹는 것이다(2026-08-09 재확인).

## 구조
- `js/logic.js` 순수 로직 · `js/store.js` 관심/편집 상태 · `js/export.js` 내보내기 · `js/render.js` D3 렌더 · `js/app.js` 와이어링.
