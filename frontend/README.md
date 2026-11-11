# 금고은행 입찰 현황 히트맵 대시보드

오프라인 `file://` 더블클릭으로 동작하는 D3 히트맵. 빌드 없음.

## 실행
- `frontend/index.html` 더블클릭. (D3 번들 `vendor/d3.v7.min.js` 필요 — `vendor/README.txt` 참고.)

## 데이터 교체
- 기관: `data/institutions.js`의 `window.institutions` 배열. 스키마: name/type/region/contractEnd/confidence/sources(1+). **조작 금지 — 근거 없는 데이터 금지.**
- 지도: `geo/{korea,seoul,gyeonggi}.js`의 FeatureCollection을 실제 행정경계 GeoJSON으로 교체(`properties.code`·`properties.name` 유지).
- 화면 편집 후 "institutions.js 내보내기"로 갱신 파일을 받아 `data/`에 교체.

## 테스트
- `node --test "frontend/test/*.test.js"` (순수 로직: 임박도·검증·정렬·필터·상태·직렬화).
  - **glob 형태를 쓴다.** 디렉터리 형태(`node --test frontend/test/`)는 이 Node/Windows
    환경에서 `Cannot find module …\frontend\test`로 죽는다 — 테스트가 깨진 게 아니라
    실행 형태가 안 먹는 것이다(2026-08-09 재확인).

## 로그인 슬라이드 바꾸기
- 로그인 화면 오른쪽 슬라이드의 문구·날짜·구 목록은 `data/login-slides.js` 한 파일에 있다(맨 위 주석이 칸 설명·예시). 그리는 코드는 `js/login-hero.js`.
- 장을 더하거나 빼거나 순서를 바꾸고, 저장한 뒤 브라우저를 새로고침한다. 날짜는 `YYYY-MM-DD`, 구 코드는 `geo/seoul.js`의 `properties.code`.
- 접수 마감(`receiveTo`)·`showUntil`이 지난 장과 형식이 틀린 장은 화면에서 조용히 빠지고, 전부 빠지면 로그인 카드만 보인다.
- 고친 뒤 `node --test "frontend/test/login-slides.test.js"`를 돌리면 틀린 칸 이름을 알려 준다.
- 색은 `index.html`의 `:root` 안 `--lg-*` 변수(이 화면 전용)와 앱 공통 변수로 바꾼다.

## 구조
- `js/logic.js` 순수 로직 · `js/store.js` 관심/편집 상태 · `js/export.js` 내보내기 · `js/render.js` D3 렌더 · `js/overdue.js` 공고 예정일 경과 패널·팝업·사이드바 배지(판정은 logic.js) · `js/app.js` 와이어링.
