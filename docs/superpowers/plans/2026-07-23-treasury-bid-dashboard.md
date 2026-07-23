# 금고은행 입찰 현황 히트맵 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국 각 기관(지자체·공공기관·공기업·대학병원)의 금고은행 입찰 도래를 한눈에 보는, 오프라인 `file://` 더블클릭으로 동작하는 인터랙티브 D3 히트맵 지도를 만든다.

**Architecture:** 정적 단일 HTML(`dashboard/index.html`) + 로컬 D3 v7 번들 + `window.*` 전역변수로 래핑한 geo/데이터 파일(fetch CORS 회피). 순수 로직(임박도·검증·정렬·필터·관심지역·Export 직렬화)은 `js/` 아래 모듈로 분리해 node 내장 테스트러너로 단위 테스트하고, D3 렌더/인터랙션은 그 로직을 소비한다. 탭1(전국 지도 줌 탐색) / 탭2(전국 지역별 + 관심 핀바) 2탭, 관심 지역은 두 탭 공유 localStorage 전역 상태.

**Tech Stack:** HTML/CSS/바닐라 JS(ES2020), D3.js v7(로컬 번들, d3-geo·d3-zoom), 테스트는 Node.js 내장 `node --test` + `node:assert`(외부 의존 없음). 빌드 없음.

## Global Constraints

- **오프라인 `file://` 동작 필수** — 모든 자산 로컬. CDN 금지. D3는 `dashboard/vendor/d3.v7.min.js` 로컬 번들.
- **fetch/JSON 금지** — geo·데이터는 `window.<전역명> = [...]` / `= {...}` 형태 `.js`로 래핑하고 `<script>`로 로드.
- **조작 금지** — 근거(`sources[]`, 1개 이상) 없는 데이터는 만들지 않는다. 개발용 시드 데이터는 실데이터가 아님을 `confidence: "미상"` + `sources: ["SAMPLE-개발용, 실데이터로 교체 필요"]`로 명시한다. 실제 기관 주장으로 오인될 값을 지어내지 않는다.
- **색 규칙(구간형 5단계, 저장 안 함·열람 시점 계산)**: 6개월 이내 🔴 / 1년 이내 🟠 / 2년 이내 🟡 / 2년 초과 🔵 / 미상 ⚪.
- **이중 레이어 문법(색 혼합 금지)**: 면(폴리곤) 색 = 지자체 금고 임박도만. 그 외 기관 = 유형별 마커(대학병원 원● / 공기업 사각■ / 공공기관 삼각▲ / 미정의 다이아◆). `confidence:"추정"`=빗금.
- **정보부족 글리프 2종**: `?`=레코드 정상이나 `contractEnd` 미상, `!`=필수필드 누락·형식오류.
- **v1 렌더 활성 지역 = 서울·경기만.** 나머지 15개 시도는 회색+"준비중". 스키마·`region`은 전국 개방(enum 잠금 없음).
- **레코드 스키마**: `name`(string,필수), `type`(`지자체|대학병원|공공기관|공기업`,필수), `region`(17개 시도 코드 문자열,필수), `contractEnd`(YYYY-MM-DD, 없으면 미상), `confidence`(`확정|추정|미상`,필수), `sources`(string[],1+ 필수).
- **대시보드 지도 로직은 기존 `report/`와 무관한 신규 `dashboard/` 폴더** — 기존 report 지도는 건드리지 않는다.

---

## File Structure

```
dashboard/
├── index.html            # 앱 셸: 2탭 크롬, 마크업, 스타일, 모듈 로드·와이어링
├── vendor/
│   └── d3.v7.min.js      # 로컬 D3 번들 (CDN 아님)
├── geo/
│   ├── korea.js          # window.geoKorea  = 17 시도 FeatureCollection (탭1 첫 화면)
│   ├── seoul.js          # window.geoSeoul  = 서울 25구 FeatureCollection
│   └── gyeonggi.js       # window.geoGyeonggi = 경기 31시군 FeatureCollection
├── data/
│   └── institutions.js   # window.institutions = 기관 레코드 배열 (개발용 시드)
├── js/
│   ├── logic.js          # 순수 함수: 임박도·검증·글리프·정렬·마커모양·필터 (node 테스트)
│   ├── store.js          # 관심지역/편집 localStorage 상태 (node 테스트, LS 스텁)
│   ├── export.js         # institutions.js 직렬화·다운로드 (직렬화는 node 테스트)
│   ├── render.js         # D3 렌더: 전국지도·지역 드릴·면색·마커·클러스터·랭킹패널
│   └── app.js            # 탭 전환·관심핀바·필터·편집·엣지처리 와이어링(엔트리)
└── test/
    ├── logic.test.js     # node --test
    ├── store.test.js     # node --test
    └── export.test.js    # node --test
```

각 `js/` 모듈은 하단에 `if (typeof module !== 'undefined') module.exports = {...}` 가드를 두어 브라우저에선 `window` 전역, node 테스트에선 `require`로 접근한다(UMD 유사). `index.html`은 `<script src>`로 순수 모듈 → geo → data → render → app 순 로드.

**테스트 실행(리포지토리 루트에서):** `node --test dashboard/test/`

---

## Task 1: 프로젝트 스캐폴드 + 2탭 셸 + 테스트 하네스

**Files:**
- Create: `dashboard/index.html`
- Create: `dashboard/js/logic.js` (빈 export 가드만)
- Create: `dashboard/test/logic.test.js` (스모크 테스트)
- Create: `dashboard/vendor/README.txt` (D3 번들 배치 안내)

**Interfaces:**
- Produces: `dashboard/index.html`에 `#tab-map`(탭1)·`#tab-regions`(탭2) 컨테이너와 `.tab-btn[data-tab]` 버튼. `window.logic` 네임스페이스(이후 태스크가 채움).

- [ ] **Step 1: D3 로컬 번들 배치 안내 파일 작성**

`dashboard/vendor/README.txt`:
```
d3.v7.min.js 를 이 폴더에 두세요 (오프라인 로컬 번들, CDN 금지).
획득: 온라인 환경에서 https://d3js.org/d3.v7.min.js 를 내려받아
파일명을 d3.v7.min.js 로 하여 dashboard/vendor/ 에 복사.
번들이 없으면 index.html 은 "지도 로딩 실패" 폴백(Task 14)을 표시합니다.
```

- [ ] **Step 2: logic.js 빈 모듈 가드 작성**

`dashboard/js/logic.js`:
```js
(function (root) {
  'use strict';
  const logic = {};
  // 이후 태스크에서 채워짐
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
  else root.logic = logic;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 3: 스모크 테스트 작성 (실패 확인용)**

`dashboard/test/logic.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const logic = require('../js/logic.js');

test('logic module loads', () => {
  assert.strictEqual(typeof logic, 'object');
});
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: index.html 셸 작성 (2탭 크롬)**

`dashboard/index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>금고은행 입찰 현황 히트맵</title>
<style>
  :root { --bg:#0f1420; --panel:#1a2233; --line:#2a3550; --fg:#e6ecff; --muted:#8a97b8;
          --red:#e5484d; --orange:#f5a524; --yellow:#f2e14c; --blue:#3b82f6; --gray:#8a97b8; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:"Segoe UI","Malgun Gothic",sans-serif; background:var(--bg); color:var(--fg); }
  header { display:flex; align-items:center; gap:16px; padding:10px 16px; border-bottom:1px solid var(--line); }
  header h1 { font-size:16px; margin:0; }
  .tabs { display:flex; gap:4px; margin-left:auto; }
  .tab-btn { background:var(--panel); color:var(--muted); border:1px solid var(--line);
             padding:6px 14px; border-radius:8px 8px 0 0; cursor:pointer; }
  .tab-btn.active { color:var(--fg); border-bottom-color:var(--panel); }
  .tab-view { display:none; padding:12px 16px; }
  .tab-view.active { display:block; }
  #map-stage { position:relative; width:100%; height:calc(100vh - 120px); background:var(--panel);
               border:1px solid var(--line); border-radius:10px; overflow:hidden; }
</style>
</head>
<body>
<header>
  <h1>금고은행 입찰 현황 히트맵</h1>
  <div class="tabs">
    <button class="tab-btn active" data-tab="map">전국 지도</button>
    <button class="tab-btn" data-tab="regions">전국 지역별</button>
  </div>
</header>

<section id="tab-map" class="tab-view active">
  <div id="map-stage"><svg id="map-svg" width="100%" height="100%"></svg></div>
</section>

<section id="tab-regions" class="tab-view">
  <div id="pin-bar"></div>
  <div id="region-grid"></div>
</section>

<!-- 순수 로직 -->
<script src="js/logic.js"></script>
<script src="js/store.js"></script>
<script src="js/export.js"></script>
<!-- D3 번들 (없으면 Task 14 폴백) -->
<script src="vendor/d3.v7.min.js" onerror="window.__d3failed=true"></script>
<!-- 데이터 -->
<script src="geo/korea.js"></script>
<script src="geo/seoul.js"></script>
<script src="geo/gyeonggi.js"></script>
<script src="data/institutions.js"></script>
<!-- 렌더·엔트리 -->
<script src="js/render.js"></script>
<script src="js/app.js"></script>
<script>
  // 탭 전환 (와이어링은 app.js가 보강; 여기선 기본 토글 보장)
  document.querySelectorAll('.tab-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (x){ x.classList.remove('active'); });
      document.querySelectorAll('.tab-view').forEach(function (x){ x.classList.remove('active'); });
      b.classList.add('active');
      document.getElementById('tab-' + b.dataset.tab).classList.add('active');
      if (window.app && window.app.onTabChange) window.app.onTabChange(b.dataset.tab);
    });
  });
</script>
</body>
</html>
```

- [ ] **Step 6: 브라우저 검증**

`dashboard/index.html`을 더블클릭(또는 브라우저로 열기). 확인:
- 상단에 제목 + [전국 지도][전국 지역별] 탭 버튼.
- 탭 클릭 시 뷰 전환(빈 상태여도 토글 동작). 콘솔에 `js/store.js` 등 404 경고는 이후 태스크에서 파일 생성 시 사라짐(현재 무해).

- [ ] **Step 7: 커밋**

```bash
git add dashboard/index.html dashboard/js/logic.js dashboard/test/logic.test.js dashboard/vendor/README.txt
git commit -m "feat(dashboard): scaffold 2-tab shell + node test harness"
```

---

## Task 2: 임박도 계산 로직 (computeUrgency)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces: `logic.URGENCY` = `{RED,ORANGE,YELLOW,BLUE,GRAY}`(값은 `'red'|'orange'|'yellow'|'blue'|'gray'`), `logic.daysUntil(contractEnd:string|undefined, today:Date) -> number`(없음/무효=`Infinity`), `logic.computeUrgency(contractEnd, today) -> URGENCY값`.

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/test/logic.test.js`에 추가:
```js
test('computeUrgency: 미상/무효 → gray', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency(undefined, today), logic.URGENCY.GRAY);
  assert.strictEqual(logic.computeUrgency('not-a-date', today), logic.URGENCY.GRAY);
});
test('computeUrgency: 구간 경계', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.computeUrgency('2026-08-01', today), logic.URGENCY.RED);    // 6개월 이내
  assert.strictEqual(logic.computeUrgency('2027-06-01', today), logic.URGENCY.ORANGE); // 1년 이내
  assert.strictEqual(logic.computeUrgency('2028-06-01', today), logic.URGENCY.YELLOW); // 2년 이내
  assert.strictEqual(logic.computeUrgency('2030-01-01', today), logic.URGENCY.BLUE);   // 2년 초과
  assert.strictEqual(logic.computeUrgency('2026-07-01', today), logic.URGENCY.RED);    // 이미 지남 → 최긴급
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: FAIL (`logic.computeUrgency is not a function`)

- [ ] **Step 3: 구현**

`dashboard/js/logic.js`의 `const logic = {};` 아래에 추가:
```js
  logic.URGENCY = { RED:'red', ORANGE:'orange', YELLOW:'yellow', BLUE:'blue', GRAY:'gray' };

  logic.daysUntil = function (contractEnd, today) {
    if (!contractEnd) return Infinity;
    const end = new Date(contractEnd + 'T00:00:00');
    if (isNaN(end.getTime())) return Infinity;
    return Math.floor((end - today) / 86400000);
  };

  logic.computeUrgency = function (contractEnd, today) {
    const d = logic.daysUntil(contractEnd, today);
    if (d === Infinity) return logic.URGENCY.GRAY;
    if (d <= 182) return logic.URGENCY.RED;   // 6개월(≈182일) 이내, 과거 포함
    if (d <= 365) return logic.URGENCY.ORANGE;
    if (d <= 730) return logic.URGENCY.YELLOW;
    return logic.URGENCY.BLUE;
  };
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): computeUrgency 5-tier urgency logic"
```

---

## Task 3: 레코드 검증 + 글리프 (validateRecord / recordGlyph)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces: `logic.REQUIRED_FIELDS` = `['name','type','region','confidence','sources']`; `logic.validateRecord(rec) -> {valid:boolean, missing:string[]}`(`sources`는 배열·길이1+ 아니면 누락); `logic.recordGlyph(rec) -> '!'|'?'|''`(무결성 문제 우선 `!`, 아니면 contractEnd 없을 때 `?`).

- [ ] **Step 1: 실패 테스트 작성**

```js
test('validateRecord: 필수필드 누락 감지', () => {
  const bad = { name:'X', type:'공기업' }; // region/confidence/sources 없음
  const r = logic.validateRecord(bad);
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.missing.sort(), ['confidence','region','sources'].sort());
});
test('validateRecord: sources 빈 배열은 누락', () => {
  const rec = { name:'X', type:'공기업', region:'11', confidence:'추정', sources:[] };
  assert.strictEqual(logic.validateRecord(rec).valid, false);
  assert.ok(logic.validateRecord(rec).missing.includes('sources'));
});
test('recordGlyph: ! 우선, 그다음 ?', () => {
  const broken = { name:'X', type:'공기업' };
  assert.strictEqual(logic.recordGlyph(broken), '!');
  const noDate = { name:'X', type:'공기업', region:'11', confidence:'확정', sources:['s'] };
  assert.strictEqual(logic.recordGlyph(noDate), '?');
  const ok = Object.assign({}, noDate, { contractEnd:'2027-01-01' });
  assert.strictEqual(logic.recordGlyph(ok), '');
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: FAIL (`logic.validateRecord is not a function`)

- [ ] **Step 3: 구현**

`dashboard/js/logic.js`에 추가:
```js
  logic.REQUIRED_FIELDS = ['name','type','region','confidence','sources'];

  logic.validateRecord = function (rec) {
    const missing = [];
    logic.REQUIRED_FIELDS.forEach(function (f) {
      if (f === 'sources') {
        if (!Array.isArray(rec.sources) || rec.sources.length === 0) missing.push('sources');
      } else if (rec[f] === undefined || rec[f] === null || rec[f] === '') {
        missing.push(f);
      }
    });
    return { valid: missing.length === 0, missing: missing };
  };

  logic.recordGlyph = function (rec) {
    if (!logic.validateRecord(rec).valid) return '!';
    if (!rec.contractEnd) return '?';
    return '';
  };
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): validateRecord + recordGlyph integrity logic"
```

---

## Task 4: 마커 모양 · 임박순 정렬 · 마커 필터 (markerShape / sortByUrgency / visibleMarkers)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces:
  - `logic.markerShape(type) -> 'circle'|'square'|'triangle'|'diamond'|'polygon'` (지자체=polygon(면), 대학병원=circle, 공기업=square, 공공기관=triangle, 그 외=diamond).
  - `logic.FILTERABLE_TYPES` = `['공공기관','공기업','대학병원']`.
  - `logic.visibleMarkers(list, enabledTypes:Set<string>) -> Record[]` — 지자체 제외(면 레이어), 필터 가능 유형은 `enabledTypes` 포함 시만, 미정의 유형(◆)은 항상 표시.
  - `logic.sortByUrgency(list, today) -> Record[]` — `daysUntil` 오름차순 새 배열, 미상은 뒤로.

- [ ] **Step 1: 실패 테스트 작성**

```js
test('markerShape 매핑', () => {
  assert.strictEqual(logic.markerShape('대학병원'), 'circle');
  assert.strictEqual(logic.markerShape('공기업'), 'square');
  assert.strictEqual(logic.markerShape('공공기관'), 'triangle');
  assert.strictEqual(logic.markerShape('지자체'), 'polygon');
  assert.strictEqual(logic.markerShape('학교'), 'diamond'); // 미정의 폴백
});
test('visibleMarkers: 지자체 제외 + 유형 필터 + 미정의 항상표시', () => {
  const list = [
    { name:'구청', type:'지자체', region:'11' },
    { name:'병원', type:'대학병원', region:'11' },
    { name:'공사', type:'공기업', region:'11' },
    { name:'학교', type:'대학교', region:'11' },
  ];
  const enabled = new Set(['대학병원']); // 공기업 꺼짐
  const vis = logic.visibleMarkers(list, enabled).map(r => r.name);
  assert.deepStrictEqual(vis.sort(), ['병원','학교'].sort()); // 지자체 제외, 공기업 제외, 학교(미정의) 표시
});
test('sortByUrgency: 임박순 + 미상 뒤로', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상', region:'11' },
    { name:'멂', contractEnd:'2029-01-01' },
    { name:'임박', contractEnd:'2026-08-01' },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r => r.name), ['임박','멂','미상']);
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`dashboard/js/logic.js`에 추가:
```js
  logic.markerShape = function (type) {
    const map = { '대학병원':'circle', '공기업':'square', '공공기관':'triangle', '지자체':'polygon' };
    return map[type] || 'diamond';
  };

  logic.FILTERABLE_TYPES = ['공공기관','공기업','대학병원'];

  logic.visibleMarkers = function (list, enabledTypes) {
    return list.filter(function (r) {
      if (r.type === '지자체') return false;
      if (logic.FILTERABLE_TYPES.indexOf(r.type) >= 0) return enabledTypes.has(r.type);
      return true; // 미정의 유형(◆)은 항상 표시
    });
  };

  logic.sortByUrgency = function (list, today) {
    return list.slice().sort(function (a, b) {
      return logic.daysUntil(a.contractEnd, today) - logic.daysUntil(b.contractEnd, today);
    });
  };
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/logic.test.js`
Expected: PASS (전체 logic 테스트)

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): markerShape + sortByUrgency + visibleMarkers"
```

---

## Task 5: 관심지역·편집 상태 저장소 (store.js, localStorage)

**Files:**
- Create: `dashboard/js/store.js`
- Test: `dashboard/test/store.test.js`

**Interfaces:**
- Produces: `store.loadWatch()->string[]`, `store.saveWatch(arr)`, `store.toggleWatch(code)->string[]`, `store.reorderWatch(from,to)->string[]`, `store.isWatched(code)->boolean`, `store.loadEdits()->Record<string,object>`, `store.setEdit(name, partial)->edits`, `store.applyEdits(list)->Record[]`(이름 매칭 병합 새 배열). 저장 키: `tbd.watchRegions`, `tbd.edits`.
- Consumes: 브라우저에선 `window.localStorage`; node 테스트에선 테스트가 `global.localStorage` 스텁 주입.

- [ ] **Step 1: 실패 테스트 작성 (localStorage 스텁 포함)**

`dashboard/test/store.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');

// localStorage 스텁 (모듈 로드 전에 주입)
function freshLS() {
  const m = {};
  global.localStorage = {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; },
  };
}
freshLS();
const store = require('../js/store.js');

test('toggleWatch: 추가/제거 토글 + 순서 유지', () => {
  freshLS();
  assert.deepStrictEqual(store.toggleWatch('11'), ['11']);
  assert.deepStrictEqual(store.toggleWatch('41'), ['11','41']);
  assert.deepStrictEqual(store.toggleWatch('11'), ['41']); // 재토글 제거
  assert.strictEqual(store.isWatched('41'), true);
});
test('reorderWatch: 자리 이동', () => {
  freshLS();
  store.toggleWatch('11'); store.toggleWatch('41'); store.toggleWatch('28');
  assert.deepStrictEqual(store.reorderWatch(2, 0), ['28','11','41']);
});
test('applyEdits: 이름 매칭 병합', () => {
  freshLS();
  store.setEdit('X구청', { contractEnd:'2027-05-01' });
  const merged = store.applyEdits([{ name:'X구청', type:'지자체', contractEnd:'2026-01-01' }]);
  assert.strictEqual(merged[0].contractEnd, '2027-05-01');
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test dashboard/test/store.test.js`
Expected: FAIL (`Cannot find module '../js/store.js'`)

- [ ] **Step 3: 구현**

`dashboard/js/store.js`:
```js
(function (root) {
  'use strict';
  const store = {};
  const WATCH_KEY = 'tbd.watchRegions';
  const EDIT_KEY = 'tbd.edits';
  function LS() { return (typeof localStorage !== 'undefined') ? localStorage : null; }
  function read(key, fallback) {
    const ls = LS(); if (!ls) return fallback;
    try { const v = ls.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) { const ls = LS(); if (ls) ls.setItem(key, JSON.stringify(val)); }

  store.loadWatch = function () { return read(WATCH_KEY, []); };
  store.saveWatch = function (arr) { write(WATCH_KEY, arr); };
  store.isWatched = function (code) { return store.loadWatch().indexOf(code) >= 0; };
  store.toggleWatch = function (code) {
    const a = store.loadWatch(); const i = a.indexOf(code);
    if (i >= 0) a.splice(i, 1); else a.push(code);
    store.saveWatch(a); return a;
  };
  store.reorderWatch = function (from, to) {
    const a = store.loadWatch(); const x = a.splice(from, 1)[0];
    a.splice(to, 0, x); store.saveWatch(a); return a;
  };

  store.loadEdits = function () { return read(EDIT_KEY, {}); };
  store.setEdit = function (name, partial) {
    const e = store.loadEdits(); e[name] = Object.assign({}, e[name], partial);
    write(EDIT_KEY, e); return e;
  };
  store.applyEdits = function (list) {
    const e = store.loadEdits();
    return list.map(function (r) { return e[r.name] ? Object.assign({}, r, e[r.name]) : r; });
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = store;
  else root.store = store;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/store.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/store.js dashboard/test/store.test.js
git commit -m "feat(dashboard): store.js watch-regions + edits localStorage state"
```

---
## Task 6: 개발용 시드 데이터 + geo 파일

**Files:**
- Create: `dashboard/data/institutions.js`
- Create: `dashboard/geo/korea.js`
- Create: `dashboard/geo/seoul.js`
- Create: `dashboard/geo/gyeonggi.js`

**Interfaces:**
- Produces: `window.institutions`(레코드 배열), `window.geoKorea`/`window.geoSeoul`/`window.geoGyeonggi`(GeoJSON FeatureCollection). 각 Feature의 `properties.code`=지역 코드 문자열, `properties.name`=표시명.
- Consumes: 스키마·조작금지(Global Constraints).

> **조작 금지 준수:** 아래 시드는 개발용 더미다. 실기관 주장으로 오인되지 않도록 `confidence:"미상"` + `sources:["SAMPLE-개발용, 실데이터로 교체 필요"]`로 명시하고, 파일 상단 주석에도 경고를 둔다. geo 좌표는 실제 행정경계 GeoJSON으로 교체할 자리표시용 단순 폴리곤이다(구조만 유효).

- [ ] **Step 1: 시드 데이터 작성**

`dashboard/data/institutions.js`:
```js
// 개발용 샘플 — 실데이터 아님. 실기관 데이터로 교체 시 sources에 실제 출처 URL 기입.
window.institutions = [
  { name:"서울시청(예시)", type:"지자체", region:"11", contractEnd:"2026-09-30",
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"경기도청(예시)", type:"지자체", region:"41", contractEnd:"2027-12-31",
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"○○대학병원(예시)", type:"대학병원", region:"11", lng:126.99, lat:37.56,
    contractEnd:"2026-08-15", confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"△△공사(예시)", type:"공기업", region:"41", lng:127.05, lat:37.28,
    contractEnd:"2028-06-30", confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] },
  { name:"□□공단(예시)", type:"공공기관", region:"11", lng:126.92, lat:37.53,
    confidence:"미상", sources:["SAMPLE-개발용, 실데이터로 교체 필요"] }, // contractEnd 없음 → '?' 글리프 검증용
  { name:"무결성불량(예시)", type:"공기업", region:"11", lng:127.01, lat:37.50,
    confidence:"미상", sources:[] }, // sources 빈 배열 → '!' 글리프 검증용
];
```

- [ ] **Step 2: 전국 geo 작성 (구조 유효 자리표시)**

`dashboard/geo/korea.js` — 서울·경기 2개 + 그 외 1개(준비중 표현 검증용). 실제 17 시도 GeoJSON으로 교체 예정:
```js
window.geoKorea = { type:"FeatureCollection", features:[
  { type:"Feature", properties:{ code:"11", name:"서울" },
    geometry:{ type:"Polygon", coordinates:[[[126.8,37.6],[127.1,37.6],[127.1,37.4],[126.8,37.4],[126.8,37.6]]] } },
  { type:"Feature", properties:{ code:"41", name:"경기" },
    geometry:{ type:"Polygon", coordinates:[[[126.6,37.9],[127.6,37.9],[127.6,37.0],[126.6,37.0],[126.6,37.9]]] } },
  { type:"Feature", properties:{ code:"28", name:"인천" },
    geometry:{ type:"Polygon", coordinates:[[[126.4,37.6],[126.75,37.6],[126.75,37.3],[126.4,37.3],[126.4,37.6]]] } },
]};
```

- [ ] **Step 3: 서울/경기 상세 geo 작성 (자리표시)**

`dashboard/geo/seoul.js`:
```js
window.geoSeoul = { type:"FeatureCollection", features:[
  { type:"Feature", properties:{ code:"11110", name:"종로구" },
    geometry:{ type:"Polygon", coordinates:[[[126.95,37.60],[127.02,37.60],[127.02,37.56],[126.95,37.56],[126.95,37.60]]] } },
  { type:"Feature", properties:{ code:"11170", name:"용산구" },
    geometry:{ type:"Polygon", coordinates:[[[126.95,37.55],[127.02,37.55],[127.02,37.52],[126.95,37.52],[126.95,37.55]]] } },
]};
```

`dashboard/geo/gyeonggi.js`:
```js
window.geoGyeonggi = { type:"FeatureCollection", features:[
  { type:"Feature", properties:{ code:"41135", name:"성남시" },
    geometry:{ type:"Polygon", coordinates:[[[127.10,37.44],[127.20,37.44],[127.20,37.36],[127.10,37.36],[127.10,37.44]]] } },
  { type:"Feature", properties:{ code:"41111", name:"수원시" },
    geometry:{ type:"Polygon", coordinates:[[[126.98,37.32],[127.08,37.32],[127.08,37.24],[126.98,37.24],[126.98,37.32]]] } },
]};
```

- [ ] **Step 4: 로드 검증 (node 문법 체크)**

Run: `node --check dashboard/data/institutions.js && node --check dashboard/geo/korea.js && node --check dashboard/geo/seoul.js && node --check dashboard/geo/gyeonggi.js`
Expected: 무출력(문법 정상). (참고: node에는 `window`가 없어 실행은 실패하지만 `--check`는 문법만 검사하므로 통과.)

- [ ] **Step 5: 커밋**

```bash
git add dashboard/data/institutions.js dashboard/geo/korea.js dashboard/geo/seoul.js dashboard/geo/gyeonggi.js
git commit -m "feat(dashboard): dev seed data + placeholder geo (조작금지: SAMPLE 표기)"
```

---

## Task 7: 전국 지도 렌더 (탭1 첫 화면) — render.js 기초

**Files:**
- Create: `dashboard/js/render.js`

**Interfaces:**
- Produces:
  - `render.state` = `{ today:Date, activeRegions:Set<string>, enabledTypes:Set<string>, currentRegion:string|null }`.
  - `render.URGENCY_COLORS` = URGENCY값→CSS색 매핑.
  - `render.institutionsByRegion(regionCode) -> Record[]` (편집 병합·해당 region 필터).
  - `render.drawNational()` — `#map-svg`에 `geoKorea`를 그린다. `activeRegions`(서울 11·경기 41)만 채도 있는 채움·클릭 가능, 그 외 회색+`준비중` 라벨.
- Consumes: `logic.*`, `store.applyEdits`, `window.geoKorea`, `window.institutions`, 전역 `d3`.

- [ ] **Step 1: render.js 작성**

`dashboard/js/render.js`:
```js
(function (root) {
  'use strict';
  const render = {};
  const logic = root.logic, store = root.store;

  render.state = {
    today: new Date(new Date().toISOString().slice(0,10) + 'T00:00:00'),
    activeRegions: new Set(['11','41']),        // v1 활성: 서울·경기
    enabledTypes: new Set(logic.FILTERABLE_TYPES),
    currentRegion: null,
  };

  render.URGENCY_COLORS = { red:'#e5484d', orange:'#f5a524', yellow:'#f2e14c', blue:'#3b82f6', gray:'#5a6680' };

  render.allInstitutions = function () { return store.applyEdits(window.institutions || []); };
  render.institutionsByRegion = function (code) {
    return render.allInstitutions().filter(function (r) { return r.region === code; });
  };

  // 지자체(면) 레코드 중 해당 region의 최임박 임박도 → 면 색
  render.regionUrgencyColor = function (code) {
    const muni = render.institutionsByRegion(code).filter(function (r) { return r.type === '지자체'; });
    if (!muni.length) return render.URGENCY_COLORS.gray;
    const sorted = logic.sortByUrgency(muni, render.state.today);
    return render.URGENCY_COLORS[logic.computeUrgency(sorted[0].contractEnd, render.state.today)];
  };

  render.drawNational = function () {
    const svg = d3.select('#map-svg');
    svg.selectAll('*').remove();
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = window.geoKorea;
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    const g = svg.append('g').attr('class', 'national-layer');

    g.selectAll('path.region').data(fc.features).join('path')
      .attr('class', 'region').attr('d', path)
      .attr('data-code', function (d){ return d.properties.code; })
      .attr('fill', function (d) {
        const code = d.properties.code;
        return render.state.activeRegions.has(code) ? render.regionUrgencyColor(code) : '#39435c';
      })
      .attr('stroke', '#0f1420').attr('stroke-width', 1)
      .style('cursor', function (d){ return render.state.activeRegions.has(d.properties.code) ? 'pointer' : 'default'; })
      .style('opacity', function (d){ return render.state.activeRegions.has(d.properties.code) ? 1 : 0.5; })
      .on('click', function (ev, d) {
        if (!render.state.activeRegions.has(d.properties.code)) return;
        if (root.app && root.app.enterRegion) root.app.enterRegion(d.properties.code);
      });

    g.selectAll('text.label').data(fc.features).join('text')
      .attr('class', 'label')
      .attr('transform', function (d){ const c = path.centroid(d); return 'translate(' + c[0] + ',' + c[1] + ')'; })
      .attr('text-anchor', 'middle').attr('dy', '0.35em')
      .attr('fill', '#e6ecff').attr('font-size', 12)
      .text(function (d) {
        const active = render.state.activeRegions.has(d.properties.code);
        return d.properties.name + (active ? '' : ' (준비중)');
      });

    render.state.currentRegion = null;
    render._nationalProjection = proj; render._nationalG = g;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = render;
  else root.render = render;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 2: app.js 최소 엔트리 작성 (전국 지도 초기 렌더)**

`dashboard/js/app.js`:
```js
(function (root) {
  'use strict';
  const app = {};
  app.enterRegion = function (code) { /* Task 8에서 구현 */ console.log('enterRegion', code); };
  app.onTabChange = function (tab) { /* Task 12에서 보강 */ };

  app.init = function () {
    if (window.__d3failed || typeof d3 === 'undefined') { /* Task 14 폴백 */ return; }
    root.render.drawNational();
  };
  document.addEventListener('DOMContentLoaded', app.init);

  root.app = app;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 3: 문법 체크**

Run: `node --check dashboard/js/render.js && node --check dashboard/js/app.js`
Expected: 무출력(정상).

- [ ] **Step 4: 브라우저 검증**

`vendor/d3.v7.min.js`가 배치된 상태에서 `index.html` 열기. 확인:
- 탭1에 전국 지도(서울·경기·인천 자리표시 폴리곤) 렌더.
- 서울·경기는 색·불투명·포인터 커서, 인천은 회색·반투명·"인천 (준비중)" 라벨.
- 서울/경기 클릭 시 콘솔 `enterRegion 11` / `41` 출력.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/render.js dashboard/js/app.js
git commit -m "feat(dashboard): national map render (tab1) with active/준비중 regions"
```

---

## Task 8: 지역 드릴인 + "구름 걷히는" 줌 전환 + 면색

**Files:**
- Modify: `dashboard/js/render.js`
- Modify: `dashboard/js/app.js`
- Modify: `dashboard/index.html` (전환 오버레이·브레드크럼 요소, 스타일)

**Interfaces:**
- Produces: `render.drawRegion(code)` — 서울=`geoSeoul`, 경기=`geoGyeonggi` 상세 폴리곤을 면색(하위 행정구 지자체 임박도)으로 그림. `render.flyToRegion(code, done)` — d3-zoom 줌인 + 옅은 오버레이 페이드아웃("구름 걷힘") 후 `done()`. `app.enterRegion(code)` / `app.backToNational()`.
- Consumes: Task 7 산출물.

- [ ] **Step 1: index.html에 전환 오버레이·브레드크럼 추가**

`#map-stage` 안 `<svg>` 다음에 추가:
```html
      <div id="cloud-overlay"></div>
      <div id="breadcrumb" style="display:none;">
        <button id="btn-back">← 전국</button> <span id="crumb-region"></span>
      </div>
```
`<style>`에 추가:
```css
  #cloud-overlay { position:absolute; inset:0; background:radial-gradient(circle at 50% 45%, rgba(15,20,32,0) 0%, rgba(15,20,32,0.85) 70%);
                   opacity:0; pointer-events:none; transition:opacity .7s ease; }
  #cloud-overlay.active { opacity:1; }
  #breadcrumb { position:absolute; top:10px; left:12px; color:var(--fg); z-index:5; }
  #breadcrumb button { background:var(--panel); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:4px 10px; cursor:pointer; }
```

- [ ] **Step 2: render.drawRegion + flyToRegion 구현**

`dashboard/js/render.js`의 export 가드 위에 추가:
```js
  render.REGION_GEO = { '11': function(){ return window.geoSeoul; }, '41': function(){ return window.geoGyeonggi; } };
  render.REGION_NAME = { '11':'서울', '41':'경기' };

  render.subUrgencyColor = function (feature) {
    // 상세 폴리곤(구/시군)엔 지자체 레코드가 코드 단위로 매칭되지 않을 수 있어,
    // 해당 상위 region의 지자체 임박도를 공통 적용(자리표시). 실데이터에선 feature.code 매칭으로 정밀화.
    return render.regionUrgencyColor(render.state.currentRegion);
  };

  render.drawRegion = function (code) {
    const svg = d3.select('#map-svg'); svg.selectAll('*').remove();
    const node = svg.node(); const w = node.clientWidth || 900, h = node.clientHeight || 600;
    const fc = (render.REGION_GEO[code] || function(){ return {type:'FeatureCollection',features:[]}; })();
    const proj = d3.geoMercator().fitSize([w, h], fc);
    const path = d3.geoPath(proj);
    render.state.currentRegion = code;
    const g = svg.append('g').attr('class', 'region-layer');
    g.selectAll('path.subregion').data(fc.features).join('path')
      .attr('class', 'subregion').attr('d', path)
      .attr('fill', function (d){ return render.subUrgencyColor(d); })
      .attr('stroke', '#0f1420').attr('stroke-width', 1);
    render._regionProjection = proj; render._regionPath = path; render._regionG = g;
    if (render.drawMarkers) render.drawMarkers(code); // Task 9
  };

  render.flyToRegion = function (code, done) {
    const overlay = document.getElementById('cloud-overlay');
    overlay.classList.add('active');              // 구름 덮음
    setTimeout(function () {
      render.drawRegion(code);                    // 상세 그리기(가려진 채)
      requestAnimationFrame(function () { overlay.classList.remove('active'); }); // 구름 걷힘(페이드아웃)
      if (done) done();
    }, 350);
  };
```

- [ ] **Step 2b: 면색 재확정 — subUrgencyColor는 실데이터 준비 전 상위 region 색 사용(위 코드대로).** 실데이터 붙으면 `feature.properties.code`로 개별 매칭하도록 교체(주석 명시).

- [ ] **Step 3: app.js에 enterRegion/backToNational 구현**

`app.enterRegion` 교체 + 추가:
```js
  app.enterRegion = function (code) {
    root.render.flyToRegion(code, function () {
      document.getElementById('breadcrumb').style.display = 'block';
      document.getElementById('crumb-region').textContent = root.render.REGION_NAME[code] || code;
    });
  };
  app.backToNational = function () {
    document.getElementById('breadcrumb').style.display = 'none';
    root.render.drawNational();
  };
```
`app.init` 끝에 배경 복귀 와이어링 추가:
```js
    document.getElementById('btn-back').addEventListener('click', app.backToNational);
```

- [ ] **Step 4: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/render.js && node --check dashboard/js/app.js`
Expected: 무출력.
브라우저: 서울 클릭 → 옅은 오버레이가 덮였다가 걷히며 서울 상세(종로/용산 자리표시) 등장, 좌상단 "← 전국 / 서울" 브레드크럼. "← 전국" 클릭 시 전국 지도 복귀.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/render.js dashboard/js/app.js dashboard/index.html
git commit -m "feat(dashboard): region drill-in + cloud-clear zoom transition"
```

---

## Task 9: 마커 오버레이 (모양·색·빗금·글리프·클러스터)

**Files:**
- Modify: `dashboard/js/render.js`

**Interfaces:**
- Produces: `render.drawMarkers(regionCode)` — 해당 region의 비지자체 기관을 `visibleMarkers(enabledTypes)` 필터 후 유형별 모양으로 오버레이. 색=임박도, `추정`=빗금 패턴, 글리프(`?`/`!`) 표기, 8개+ 밀집 시 숫자 뱃지 클러스터. 각 마커 `<g class="marker" data-name>`.
- Consumes: `logic.markerShape/computeUrgency/recordGlyph/visibleMarkers`, `render._regionProjection`.

- [ ] **Step 1: 빗금 패턴 defs + drawMarkers 구현**

`dashboard/js/render.js`에 추가:
```js
  render._ensureDefs = function (svg) {
    if (svg.select('#hatch').size()) return;
    const p = svg.append('defs').append('pattern').attr('id','hatch')
      .attr('width',4).attr('height',4).attr('patternUnits','userSpaceOnUse')
      .attr('patternTransform','rotate(45)');
    p.append('rect').attr('width',4).attr('height',4).attr('fill','transparent');
    p.append('line').attr('x1',0).attr('y1',0).attr('x2',0).attr('y2',4).attr('stroke','#0f1420').attr('stroke-width',2);
  };

  render._shapePath = function (shape, s) { // s=반지름/반폭
    if (shape === 'square') return 'M' + (-s) + ',' + (-s) + ' h' + (2*s) + ' v' + (2*s) + ' h' + (-2*s) + ' Z';
    if (shape === 'triangle') return 'M0,' + (-s) + ' L' + s + ',' + s + ' L' + (-s) + ',' + s + ' Z';
    if (shape === 'diamond') return 'M0,' + (-s) + ' L' + s + ',0 L0,' + s + ' L' + (-s) + ',0 Z';
    return ''; // circle은 <circle>로 별도
  };

  render.drawMarkers = function (code) {
    const svg = d3.select('#map-svg'); render._ensureDefs(svg);
    const proj = render._regionProjection; if (!proj) return;
    const list = render.institutionsByRegion(code);
    const markers = logic.visibleMarkers(list, render.state.enabledTypes)
      .filter(function (r){ return typeof r.lng === 'number' && typeof r.lat === 'number'; });

    let layer = svg.select('g.marker-layer');
    if (!layer.size()) layer = svg.append('g').attr('class','marker-layer');
    layer.selectAll('*').remove();

    // 밀집 클러스터: 동일 좌표 반올림 셀에 8개+면 뱃지
    const cells = {};
    markers.forEach(function (r){ const p = proj([r.lng, r.lat]); const key = Math.round(p[0]/24)+'_'+Math.round(p[1]/24);
      (cells[key] = cells[key] || []).push({ r:r, p:p }); });

    Object.keys(cells).forEach(function (key) {
      const grp = cells[key];
      if (grp.length >= 8) {
        const p = grp[0].p;
        const g = layer.append('g').attr('class','cluster').attr('transform','translate('+p[0]+','+p[1]+')');
        g.append('circle').attr('r',14).attr('fill','#2a3550').attr('stroke','#e6ecff');
        g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('fill','#e6ecff').attr('font-size',12).text(grp.length);
        return;
      }
      grp.forEach(function (item) {
        const r = item.r, p = item.p, shape = logic.markerShape(r.type);
        const color = render.URGENCY_COLORS[logic.computeUrgency(r.contractEnd, render.state.today)];
        const glyph = logic.recordGlyph(r);
        const g = layer.append('g').attr('class','marker').attr('data-name', r.name).attr('transform','translate('+p[0]+','+p[1]+')');
        const hatched = r.confidence === '추정';
        if (shape === 'circle') {
          g.append('circle').attr('r',8).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('circle').attr('r',8).attr('fill','url(#hatch)');
        } else {
          g.append('path').attr('d', render._shapePath(shape,8)).attr('fill',color).attr('stroke','#0f1420');
          if (hatched) g.append('path').attr('d', render._shapePath(shape,8)).attr('fill','url(#hatch)');
        }
        if (glyph) g.append('text').attr('text-anchor','middle').attr('dy','0.35em')
          .attr('fill', glyph === '!' ? '#fff' : '#0f1420').attr('font-weight','bold').attr('font-size',10).text(glyph);
        g.style('cursor','pointer').on('click', function () { if (render.onMarkerClick) render.onMarkerClick(r); });
      });
    });
  };
```

- [ ] **Step 2: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/render.js`
Expected: 무출력.
브라우저: 서울 드릴인 시 병원(원)·공단(삼각, `?` 글리프)·불량(사각, `!` 글리프) 마커가 색과 함께 표시. 경기 드릴인 시 공사(사각) 표시.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/js/render.js
git commit -m "feat(dashboard): marker overlay (shape/color/hatch/glyph/cluster)"
```

---

## Task 10: 마커 필터 체크박스 + 범례 + 임박 TOP5 티커

**Files:**
- Modify: `dashboard/index.html` (범례·필터·티커 UI)
- Modify: `dashboard/js/app.js`
- Modify: `dashboard/js/render.js`

**Interfaces:**
- Produces: `render.drawTicker()` — 전체 활성지역 기관 임박순 TOP5를 상단 티커에 표시. `app.wireFilters()` — 체크박스 3종(공공기관/공기업/대학병원) 토글 → `render.state.enabledTypes` 갱신 후 현재 지역 마커 재렌더. 데이터 0인 유형 체크박스는 `disabled`.
- Consumes: `logic.sortByUrgency/visibleMarkers`, Task 9.

- [ ] **Step 1: index.html에 범례·필터·티커 추가**

`<header>` 바로 다음, `#tab-map` 앞(또는 map-stage 위)에:
```html
  <div id="topbar" style="display:flex;gap:16px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line);flex-wrap:wrap;">
    <div id="legend" style="display:flex;gap:12px;font-size:12px;">
      <span>🔴 6개월↓</span><span>🟠 1년↓</span><span>🟡 2년↓</span><span>🔵 2년+</span><span>⚪ 미상</span>
    </div>
    <div id="type-filter" style="display:flex;gap:10px;font-size:13px;">
      <label><input type="checkbox" data-type="공공기관" checked> ▲ 공공기관</label>
      <label><input type="checkbox" data-type="공기업" checked> ■ 공기업</label>
      <label><input type="checkbox" data-type="대학병원" checked> ● 대학병원</label>
    </div>
    <div id="ticker" style="margin-left:auto;font-size:12px;color:var(--muted);overflow:hidden;white-space:nowrap;max-width:40vw;"></div>
  </div>
```

- [ ] **Step 2: render.drawTicker 구현**

`dashboard/js/render.js`에 추가:
```js
  render.drawTicker = function () {
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    const top = logic.sortByUrgency(all, render.state.today).slice(0, 5);
    const el = document.getElementById('ticker'); if (!el) return;
    el.textContent = '임박 TOP5 · ' + top.map(function (r) {
      const d = logic.daysUntil(r.contractEnd, render.state.today);
      return r.name + (d === Infinity ? '(미상)' : '(D-' + d + ')');
    }).join('   ·   ');
  };
```

- [ ] **Step 3: app.wireFilters 구현 + init 연결**

`dashboard/js/app.js`에 추가하고 `app.init` 안 `drawNational()` 다음에 호출:
```js
  app.wireFilters = function () {
    const boxes = document.querySelectorAll('#type-filter input[type=checkbox]');
    // 데이터 없는 유형 비활성
    const present = new Set(root.render.allInstitutions().map(function (r){ return r.type; }));
    boxes.forEach(function (b) {
      if (!present.has(b.dataset.type)) { b.checked = false; b.disabled = true; }
      b.addEventListener('change', function () {
        const s = root.render.state.enabledTypes;
        if (b.checked) s.add(b.dataset.type); else s.delete(b.dataset.type);
        if (root.render.state.currentRegion) root.render.drawMarkers(root.render.state.currentRegion);
      });
    });
    // 초기 enabledTypes를 체크상태와 동기화
    root.render.state.enabledTypes = new Set(
      Array.from(boxes).filter(function (b){ return b.checked; }).map(function (b){ return b.dataset.type; }));
  };
```
`app.init` 갱신:
```js
  app.init = function () {
    if (window.__d3failed || typeof d3 === 'undefined') { if (root.render.renderFallback) root.render.renderFallback(); return; }
    root.render.drawNational();
    app.wireFilters();
    root.render.drawTicker();
    document.getElementById('btn-back').addEventListener('click', app.backToNational);
  };
```

- [ ] **Step 4: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/app.js && node --check dashboard/js/render.js`
Expected: 무출력.
브라우저: 상단에 범례·체크박스 3종·TOP5 티커. 서울 드릴인 후 "대학병원" 체크 해제 → 병원 마커 사라짐, 재체크 → 복귀. 데이터 없는 유형은 회색 비활성.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/index.html dashboard/js/app.js dashboard/js/render.js
git commit -m "feat(dashboard): marker filter checkboxes + legend + TOP5 ticker"
```

---
## Task 11: 임박순 랭킹 패널 + 카드↔마커 상호강조 + 상세 팝오버(누락필드 강조)

**Files:**
- Modify: `dashboard/index.html` (랭킹 패널 컨테이너, 지도 2/3‖패널 1/3 레이아웃)
- Modify: `dashboard/js/render.js`

**Interfaces:**
- Produces: `render.drawRankingPanel(code)` — 해당 region 기관을 `sortByUrgency`로 정렬(미상 뒤로) 카드 리스트, 카드 hover/click ↔ 지도 마커 상호 강조. `render.showPopover(rec, x, y)` — 레코드 전체 필드 표시, `!` 레코드는 누락 필드 빨간 강조. `render.onMarkerClick` 배선.
- Consumes: Task 9·10.

- [ ] **Step 1: index.html에 드릴 레이아웃 + 패널 + 팝오버 요소**

`#map-stage`를 감싸도록 `#tab-map` 내부를 조정:
```html
<section id="tab-map" class="tab-view active">
  <div id="drill-wrap" style="display:flex;gap:12px;">
    <div id="map-stage" style="flex:2;position:relative;">
      <svg id="map-svg" width="100%" height="100%"></svg>
      <div id="cloud-overlay"></div>
      <div id="breadcrumb" style="display:none;"><button id="btn-back">← 전국</button> <span id="crumb-region"></span></div>
    </div>
    <div id="rank-panel" style="flex:1;display:none;overflow:auto;max-height:calc(100vh - 160px);"></div>
  </div>
  <div id="popover" style="display:none;position:fixed;z-index:20;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;font-size:12px;max-width:280px;"></div>
</section>
```
(기존 `#map-stage` 블록은 위 구조로 대체.) 스타일 추가:
```css
  .rank-card { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:8px; margin-bottom:6px; cursor:pointer; }
  .rank-card.hi { outline:2px solid #fff; }
  .marker.hi > * { stroke:#fff; stroke-width:2.5; }
  .miss { color:var(--red); font-weight:bold; }
```

- [ ] **Step 2: render.drawRankingPanel + showPopover + 상호강조 구현**

`dashboard/js/render.js`에 추가:
```js
  render.highlightMarker = function (name, on) {
    d3.select('#map-svg').selectAll('g.marker').classed('hi', function () {
      return on && this.getAttribute('data-name') === name;
    });
  };
  render.highlightCard = function (name, on) {
    document.querySelectorAll('.rank-card').forEach(function (c) {
      if (c.dataset.name === name) c.classList.toggle('hi', on);
    });
  };

  render.drawRankingPanel = function (code) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    const list = logic.sortByUrgency(render.institutionsByRegion(code), render.state.today);
    panel.style.display = 'block'; panel.innerHTML = '<h3 style="margin:4px 0 8px;">임박순 랭킹</h3>';
    list.forEach(function (r) {
      const d = logic.daysUntil(r.contractEnd, render.state.today);
      const card = document.createElement('div'); card.className = 'rank-card'; card.dataset.name = r.name;
      const glyph = logic.recordGlyph(r);
      card.innerHTML = '<b>' + r.name + '</b> ' + (glyph ? '<span class="miss">' + glyph + '</span>' : '') +
        '<br><small>' + r.type + ' · ' + (d === Infinity ? '미상' : 'D-' + d) + '</small>';
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.showPopover(r, ev.clientX, ev.clientY); });
      panel.appendChild(card);
    });
  };

  render.showPopover = function (rec, x, y) {
    const pop = document.getElementById('popover'); if (!pop) return;
    const v = logic.validateRecord(rec);
    const fields = ['name','type','region','contractEnd','confidence','sources'];
    let html = '<b>' + (rec.name || '(이름없음)') + '</b><br>';
    fields.forEach(function (f) {
      const missing = v.missing.indexOf(f) >= 0 || (f === 'contractEnd' && !rec.contractEnd);
      let val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] == null ? '' : rec[f]);
      html += '<div' + (missing ? ' class="miss"' : '') + '>' + f + ': ' + (val || (missing ? '(누락)' : '')) + '</div>';
    });
    pop.innerHTML = html; pop.style.left = Math.min(x + 12, window.innerWidth - 300) + 'px';
    pop.style.top = Math.min(y + 12, window.innerHeight - 180) + 'px'; pop.style.display = 'block';
  };
  render.onMarkerClick = function (rec) { render.showPopover(rec, window.innerWidth/2, 120);
    render.highlightCard(rec.name, true); setTimeout(function(){ render.highlightCard(rec.name, false); }, 1500); };

  // 팝오버 바깥 클릭 시 닫기
  if (typeof document !== 'undefined') document.addEventListener('click', function (ev) {
    const pop = document.getElementById('popover');
    if (pop && pop.style.display === 'block' && !pop.contains(ev.target) && !(ev.target.closest && ev.target.closest('.rank-card, .marker'))) pop.style.display = 'none';
  });
```
그리고 `render.drawRegion` 끝(마커 그린 뒤)에 패널 호출 추가: `render.drawRankingPanel(code);`. `render.drawNational` 시작부에 패널 숨김 추가: `var rp = document.getElementById('rank-panel'); if (rp) rp.style.display='none';`.

- [ ] **Step 3: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/render.js`
Expected: 무출력.
브라우저: 지역 드릴인 시 우측 임박순 랭킹 패널 등장(미상 카드 맨 아래). 카드 hover → 지도 마커 흰 테두리 강조. 카드/마커 클릭 → 팝오버로 전체 필드, 불량 레코드는 누락 필드 빨간색.

- [ ] **Step 4: 커밋**

```bash
git add dashboard/index.html dashboard/js/render.js
git commit -m "feat(dashboard): ranking panel + card↔marker highlight + popover(missing-field)"
```

---

## Task 12: 탭2 전국 지역별 + 관심 핀바(재정렬) + 탭1 관심 지역 강조

**Files:**
- Modify: `dashboard/index.html` (탭2 스타일)
- Modify: `dashboard/js/app.js`
- Modify: `dashboard/js/render.js`

**Interfaces:**
- Produces: `render.drawRegionGrid()` — 활성지역 카드 그리드(관심 토글 버튼 포함). `render.drawPinBar()` — 관심 지역을 상단 좌→우 핀으로, HTML5 drag로 재정렬(`store.reorderWatch`). `render.applyWatchStyles()` — 탭1 전국 지도의 관심 region 폴리곤에 외곽선 강조+글로우. `app.onTabChange(tab)` 보강.
- Consumes: `store.*`, `render.state.activeRegions`, `render.REGION_NAME`.

- [ ] **Step 1: index.html 스타일 추가**

```css
  #pin-bar { display:flex; gap:8px; flex-wrap:wrap; min-height:36px; margin-bottom:12px; }
  .pin { background:#243; border:1px solid #3a6; color:#cfe; border-radius:16px; padding:4px 12px; cursor:grab; }
  #region-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:10px; }
  .rg-card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px; }
  .rg-card .star { cursor:pointer; float:right; }
  .region.watched { stroke:#ffe066; stroke-width:3; filter:drop-shadow(0 0 6px #ffe066); }
```

- [ ] **Step 2: render.drawRegionGrid + drawPinBar + applyWatchStyles 구현**

`dashboard/js/render.js`에 추가:
```js
  render.WATCHABLE = function () { return Array.from(render.state.activeRegions); };

  render.drawRegionGrid = function () {
    const grid = document.getElementById('region-grid'); if (!grid) return;
    grid.innerHTML = '';
    render.WATCHABLE().forEach(function (code) {
      const card = document.createElement('div'); card.className = 'rg-card';
      const on = store.isWatched(code);
      card.innerHTML = '<span class="star" data-code="' + code + '">' + (on ? '★' : '☆') + '</span><b>' +
        (render.REGION_NAME[code] || code) + '</b>';
      card.querySelector('.star').addEventListener('click', function () {
        store.toggleWatch(code); render.drawRegionGrid(); render.drawPinBar(); render.applyWatchStyles();
      });
      grid.appendChild(card);
    });
  };

  render.drawPinBar = function () {
    const bar = document.getElementById('pin-bar'); if (!bar) return;
    bar.innerHTML = ''; const watch = store.loadWatch();
    if (!watch.length) { bar.innerHTML = '<small style="color:var(--muted)">관심 지역을 ★로 지정하면 여기 쌓입니다 (드래그로 순서 변경).</small>'; return; }
    watch.forEach(function (code, idx) {
      const pin = document.createElement('div'); pin.className = 'pin'; pin.draggable = true; pin.dataset.idx = idx;
      pin.textContent = '★ ' + (render.REGION_NAME[code] || code);
      pin.addEventListener('dragstart', function (e){ e.dataTransfer.setData('text/plain', idx); });
      pin.addEventListener('dragover', function (e){ e.preventDefault(); });
      pin.addEventListener('drop', function (e) {
        e.preventDefault(); const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        store.reorderWatch(from, idx); render.drawPinBar(); render.applyWatchStyles();
      });
      bar.appendChild(pin);
    });
  };

  render.applyWatchStyles = function () {
    d3.select('#map-svg').selectAll('path.region').classed('watched', function (d) {
      return store.isWatched(d.properties.code);
    });
  };
```

- [ ] **Step 3: app.js에서 탭2 렌더 + 탭 전환 연결**

`app.onTabChange` 교체:
```js
  app.onTabChange = function (tab) {
    if (tab === 'regions') { root.render.drawRegionGrid(); root.render.drawPinBar(); }
    else if (tab === 'map') { root.render.applyWatchStyles(); }
  };
```
`app.init`의 `drawNational()` 다음에 초기 관심 강조 적용: `root.render.applyWatchStyles();`

- [ ] **Step 4: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/render.js && node --check dashboard/js/app.js`
Expected: 무출력.
브라우저: 탭2에서 서울/경기 카드의 ☆ 클릭 → ★로 바뀌고 상단 핀바에 쌓임. 핀 드래그로 순서 변경. 탭1로 가면 관심 지역 폴리곤이 노란 외곽선+글로우. 새로고침 후에도 관심 유지(localStorage).

- [ ] **Step 5: 커밋**

```bash
git add dashboard/index.html dashboard/js/render.js dashboard/js/app.js
git commit -m "feat(dashboard): tab2 region grid + watch pin-bar(reorder) + tab1 watch glow"
```

---

## Task 13: 기관 정보 편집 + institutions.js Export

**Files:**
- Create: `dashboard/js/export.js`
- Create: `dashboard/test/export.test.js`
- Modify: `dashboard/index.html` (편집 모달·Export 버튼)
- Modify: `dashboard/js/app.js`

**Interfaces:**
- Produces: `exporter.serializeInstitutions(list) -> string`(node 테스트), `exporter.downloadInstitutions(list)`(브라우저). `app.openEdit(rec)` — 팝오버/카드에서 편집 폼 열기 → `store.setEdit` 저장 후 재렌더. Export 버튼 → 편집 병합된 전체를 `institutions.js`로 다운로드.
- Consumes: `store.applyEdits/setEdit`, `logic.validateRecord`.

- [ ] **Step 1: 실패 테스트 작성**

`dashboard/test/export.test.js`:
```js
const test = require('node:test');
const assert = require('node:assert');
const exporter = require('../js/export.js');

test('serializeInstitutions: window 전역 래핑 + 파싱 가능 JSON', () => {
  const s = exporter.serializeInstitutions([{ name:'A', type:'공기업', region:'11', confidence:'추정', sources:['u'] }]);
  assert.ok(s.startsWith('window.institutions = '));
  assert.ok(s.trim().endsWith(';'));
  const json = s.replace('window.institutions = ', '').replace(/;\s*$/, '');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed[0].name, 'A');
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test dashboard/test/export.test.js`
Expected: FAIL (`Cannot find module '../js/export.js'`)

- [ ] **Step 3: export.js 구현**

`dashboard/js/export.js`:
```js
(function (root) {
  'use strict';
  const exporter = {};
  exporter.serializeInstitutions = function (list) {
    return 'window.institutions = ' + JSON.stringify(list, null, 2) + ';\n';
  };
  exporter.downloadInstitutions = function (list) {
    const text = '// 편집 반영본 — dashboard/data/institutions.js 로 교체하세요. sources는 1개 이상 필수.\n' +
      exporter.serializeInstitutions(list);
    const blob = new Blob([text], { type:'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'institutions.js';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = exporter;
  else root.exporter = exporter;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test dashboard/test/export.test.js`
Expected: PASS

- [ ] **Step 5: index.html에 편집 모달 + Export 버튼**

`#topbar` 안 티커 앞에 버튼:
```html
    <button id="btn-export" style="background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;">institutions.js 내보내기</button>
```
`<body>` 끝(스크립트 앞)에 모달:
```html
<div id="edit-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:30;">
  <div style="max-width:360px;margin:8vh auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;">
    <h3 style="margin-top:0;">기관 정보 변경</h3>
    <div id="edit-fields"></div>
    <p style="color:var(--muted);font-size:11px;">sources는 쉼표로 구분, 1개 이상 필수(조작 금지).</p>
    <div style="display:flex;gap:8px;justify-content:flex-end;">
      <button id="edit-cancel">취소</button><button id="edit-save">저장</button>
    </div>
  </div>
</div>
```

- [ ] **Step 6: app.js에 openEdit + Export 배선**

`dashboard/js/app.js`에 추가, `app.init`에서 버튼 배선:
```js
  app.openEdit = function (rec) {
    const wrap = document.getElementById('edit-fields');
    const fields = ['name','type','region','contractEnd','confidence','sources'];
    wrap.innerHTML = fields.map(function (f) {
      const val = f === 'sources' ? (Array.isArray(rec.sources) ? rec.sources.join(', ') : '') : (rec[f] || '');
      return '<label style="display:block;margin:6px 0;">' + f +
        '<input data-f="' + f + '" value="' + String(val).replace(/"/g,'&quot;') + '" style="width:100%;"></label>';
    }).join('');
    const modal = document.getElementById('edit-modal'); modal.style.display = 'block';
    document.getElementById('edit-cancel').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('edit-save').onclick = function () {
      const partial = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        const f = inp.dataset.f;
        partial[f] = f === 'sources' ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : inp.value;
      });
      const v = root.logic.validateRecord(Object.assign({}, rec, partial));
      if (!v.valid) { alert('필수 필드 누락: ' + v.missing.join(', ')); return; }
      root.store.setEdit(rec.name, partial); modal.style.display = 'none';
      if (root.render.state.currentRegion) { root.render.drawRegion(root.render.state.currentRegion); }
      root.render.drawTicker();
    };
  };
  app.wireExport = function () {
    document.getElementById('btn-export').addEventListener('click', function () {
      root.exporter.downloadInstitutions(root.render.allInstitutions());
    });
  };
```
`app.init`에 `app.wireExport();` 추가. `render.showPopover` 하단에 "편집" 버튼을 넣어 `app.openEdit(rec)` 호출(팝오버 html 끝에 `<button onclick=...>` 대신, showPopover에서 버튼 생성 후 `pop` 에 append하고 `app.openEdit` 연결).

> 편집 진입점 배선(showPopover 보강): `render.showPopover` 끝의 `pop.style.display='block';` 앞에 편집 버튼 추가 —
```js
    html += '<div style="margin-top:6px;"><button id="pop-edit">✎ 편집</button></div>';
    pop.innerHTML = html;
    const eb = document.getElementById('pop-edit');
    if (eb) eb.onclick = function () { if (root.app && root.app.openEdit) root.app.openEdit(rec); };
```
(위 `html` 조립부에 반영하고 기존 `pop.innerHTML = html;`는 한 번만 호출되도록 정리.)

- [ ] **Step 7: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/export.js && node --check dashboard/js/app.js`
Expected: 무출력.
브라우저: 마커/카드 클릭 → 팝오버의 "✎ 편집" → 모달에서 contractEnd 수정·저장 → 지도/티커 즉시 반영. sources 비우고 저장 시 경고. "institutions.js 내보내기" 클릭 → 편집 반영된 파일 다운로드.

- [ ] **Step 8: 커밋**

```bash
git add dashboard/js/export.js dashboard/test/export.test.js dashboard/index.html dashboard/js/app.js
git commit -m "feat(dashboard): institution edit + institutions.js export"
```

---

## Task 14: 엣지 처리 — D3 로드 실패 폴백 · geo 재시도 · 무결성 표기

**Files:**
- Modify: `dashboard/js/render.js`
- Modify: `dashboard/js/app.js`
- Modify: `dashboard/index.html`

**Interfaces:**
- Produces: `render.renderFallback()` — D3 없을 때 지도 자리에 "지도 로딩 실패" + 텍스트 임박순 랭킹 리스트. `render.loadRegionGeoWithRetry(code, attempt)` — geo 전역 부재 시 2회 재시도 상태 메시지("○○지역을 불러오는 중입니다…"→"준비중…") 후 실패 시 "○○지역 정보를 다시 확인해주세요" + 수동 재시도 버튼.
- Consumes: `logic.sortByUrgency`, `render.REGION_GEO/REGION_NAME`.

- [ ] **Step 1: renderFallback 구현**

`dashboard/js/render.js`에 추가:
```js
  render.renderFallback = function () {
    const stage = document.getElementById('map-stage'); if (!stage) return;
    const all = render.allInstitutions().filter(function (r){ return render.state.activeRegions.has(r.region); });
    const top = logic.sortByUrgency(all, render.state.today);
    stage.innerHTML = '<div style="padding:16px;"><b>지도 로딩 실패</b> — D3 번들(vendor/d3.v7.min.js)을 확인하세요.' +
      '<br>아래는 지도 없이 제공하는 임박순 랭킹입니다.<ol>' +
      top.map(function (r){ const d = logic.daysUntil(r.contractEnd, render.state.today);
        return '<li>' + r.name + ' — ' + r.type + ' · ' + (d === Infinity ? '미상' : 'D-' + d) + '</li>'; }).join('') +
      '</ol></div>';
  };
```

- [ ] **Step 2: geo 재시도 구현**

`render.flyToRegion`을 재시도 래핑으로 보강 — `dashboard/js/render.js`에 추가하고 `app.enterRegion`이 이걸 쓰도록:
```js
  render.loadRegionGeoWithRetry = function (code, done, fail) {
    const getGeo = render.REGION_GEO[code]; const name = render.REGION_NAME[code] || code;
    const overlay = document.getElementById('cloud-overlay');
    function attempt(n) {
      const fc = getGeo && getGeo();
      if (fc && fc.features && fc.features.length) { done(fc); return; }
      const stage = document.getElementById('map-stage');
      const msg = n === 0 ? (name + '지역을 불러오는 중입니다…') : '준비중…';
      let banner = document.getElementById('geo-retry-banner');
      if (!banner) { banner = document.createElement('div'); banner.id = 'geo-retry-banner';
        banner.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#e6ecff;'; stage.appendChild(banner); }
      banner.textContent = msg;
      if (n < 2) { setTimeout(function(){ attempt(n + 1); }, 600); }
      else {
        banner.innerHTML = name + '지역 정보를 다시 확인해주세요. <button id="geo-retry-btn">다시 시도</button>';
        document.getElementById('geo-retry-btn').onclick = function () { banner.remove(); render.loadRegionGeoWithRetry(code, done, fail); };
        if (fail) fail();
      }
    }
    attempt(0);
  };
```
`render.drawRegion` 시작에서 배너 제거: `var b = document.getElementById('geo-retry-banner'); if (b) b.remove();`
`app.enterRegion` 교체(재시도 경유):
```js
  app.enterRegion = function (code) {
    document.getElementById('cloud-overlay').classList.add('active');
    root.render.loadRegionGeoWithRetry(code, function () {
      setTimeout(function () {
        root.render.drawRegion(code);
        requestAnimationFrame(function(){ document.getElementById('cloud-overlay').classList.remove('active'); });
        document.getElementById('breadcrumb').style.display = 'block';
        document.getElementById('crumb-region').textContent = root.render.REGION_NAME[code] || code;
      }, 350);
    }, function () { document.getElementById('cloud-overlay').classList.remove('active'); });
  };
```

- [ ] **Step 3: 무결성 표기 확인 (이미 Task 3·9·11 반영)**

`!` 글리프·팝오버 누락 강조가 동작하는지 재확인(코드 변경 없음). `render.drawMarkers`에서 불량 레코드도 버리지 않고 `console.warn` 병행 — drawMarkers 마커 루프 끝에 추가:
```js
        if (glyph === '!') console.warn('무결성 문제 레코드:', r.name, logic.validateRecord(r).missing);
```

- [ ] **Step 4: 문법 체크 + 브라우저 검증**

Run: `node --check dashboard/js/render.js && node --check dashboard/js/app.js`
Expected: 무출력.
브라우저 A(정상): 지역 진입 시 정상 드릴인. 브라우저 B(폴백): `vendor/d3.v7.min.js`를 잠시 rename 후 index.html 열기 → "지도 로딩 실패" + 텍스트 랭킹. 원복. geo 재시도: `geo/seoul.js`를 빈 features로 임시 수정 후 서울 진입 → 안내 메시지 2회 → "서울지역 정보를 다시 확인해주세요" + 버튼. 원복.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/render.js dashboard/js/app.js dashboard/index.html
git commit -m "feat(dashboard): edge cases — D3 fallback, geo retry, integrity warn"
```

---

## Task 15: 최종 통합 점검 + README

**Files:**
- Create: `dashboard/README.md`

**Interfaces:**
- Produces: 사용/데이터 교체/테스트 방법 문서. 전체 회귀 점검.

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `node --test dashboard/test/`
Expected: 전체 PASS (logic/store/export).

- [ ] **Step 2: 전체 문법 체크**

Run: `node --check dashboard/js/logic.js && node --check dashboard/js/store.js && node --check dashboard/js/export.js && node --check dashboard/js/render.js && node --check dashboard/js/app.js`
Expected: 무출력.

- [ ] **Step 3: 브라우저 회귀 체크리스트 수행**

`index.html` 열고 순서대로 확인:
1. 탭1 전국 지도(서울·경기 활성, 그 외 준비중), 범례·필터·티커 표시.
2. 서울 진입: 구름 걷힘 전환 → 상세 폴리곤 면색 + 마커(모양/색/글리프/빗금) + 우측 랭킹 패널.
3. 필터 3종 on/off 반영. 카드↔마커 상호강조. 팝오버 전체필드·누락강조.
4. 편집→저장→즉시 반영, Export 다운로드.
5. 탭2 ★ 지정 → 핀바 누적·드래그 재정렬 → 탭1 관심 지역 글로우, 새로고침 유지.
6. 콘솔 에러 0(무결성 `console.warn`은 정상).

- [ ] **Step 4: README 작성**

`dashboard/README.md`:
```markdown
# 금고은행 입찰 현황 히트맵 대시보드

오프라인 `file://` 더블클릭으로 동작하는 D3 히트맵. 빌드 없음.

## 실행
- `dashboard/index.html` 더블클릭. (D3 번들 `vendor/d3.v7.min.js` 필요 — `vendor/README.txt` 참고.)

## 데이터 교체
- 기관: `data/institutions.js`의 `window.institutions` 배열. 스키마: name/type/region/contractEnd/confidence/sources(1+). **조작 금지 — 근거 없는 데이터 금지.**
- 지도: `geo/{korea,seoul,gyeonggi}.js`의 FeatureCollection을 실제 행정경계 GeoJSON으로 교체(`properties.code`·`properties.name` 유지).
- 화면 편집 후 "institutions.js 내보내기"로 갱신 파일을 받아 `data/`에 교체.

## 테스트
- `node --test dashboard/test/` (순수 로직: 임박도·검증·정렬·필터·상태·직렬화).

## 구조
- `js/logic.js` 순수 로직 · `js/store.js` 관심/편집 상태 · `js/export.js` 내보내기 · `js/render.js` D3 렌더 · `js/app.js` 와이어링.
```

- [ ] **Step 5: 커밋**

```bash
git add dashboard/README.md
git commit -m "docs(dashboard): README + final integration checklist"
```

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage** — 스펙 각 항목 대응:
- ① 목적/범위(서울·경기 활성, 나머지 준비중) → Task 7. ② 스키마·조작금지 → Task 6·Global Constraints. ③ 파일구조·JS 전역래핑 → File Structure·Task 1·6. ④ 이중레이어(면색/마커모양)·5색·글리프·빗금·클러스터·유형토글 → Task 7·9·10. ⑤ 플라이투·2/3‖1/3·상호강조·팝오버·미상뒤로 → Task 8·11. ⑥ D3실패폴백·geo재시도·불량레코드 → Task 14. ⑦-A 2탭 → Task 1·12. ⑦-B 관심지역 → Task 12. ⑦-C 구름전환 → Task 8. ⑦-D 마커필터 → Task 10. ⑦-E Export편집 → Task 13. ⑦-F 디자인 A/B(HTML 목업) → 구현 착수 시 별도(플랜 범위 밖, 스펙 명시).
- **갭 없음.** (⑦-F는 스펙에서 "구현 단계 방법론"으로 규정 — 코드 산출물 아님.)

**2. Placeholder scan** — "TBD/TODO/적절히 처리" 없음. Task 7의 `app.enterRegion` 임시구현은 Task 8·14에서 확정 교체(명시). Task 8 `subUrgencyColor`는 자리표시 로직임을 코드 주석+Step 2b로 명시(실데이터 시 교체).

**3. Type consistency** — 함수명 교차 확인: `computeUrgency/daysUntil/validateRecord/recordGlyph/markerShape/sortByUrgency/visibleMarkers`(logic), `loadWatch/toggleWatch/reorderWatch/isWatched/applyEdits/setEdit`(store), `serializeInstitutions/downloadInstitutions`(exporter), `drawNational/drawRegion/flyToRegion/drawMarkers/drawTicker/drawRankingPanel/showPopover/drawRegionGrid/drawPinBar/applyWatchStyles/renderFallback/loadRegionGeoWithRetry`(render) — 정의처와 호출처 시그니처 일치 확인 완료. `render.state.enabledTypes`는 Task 7 정의·Task 10 초기 동기화로 일관.

