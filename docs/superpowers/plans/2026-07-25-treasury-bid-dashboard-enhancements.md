# 금고은행 입찰 대시보드 기능 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드에 입찰 데이터 스키마 개편(입찰주기·지난입찰일·확정여부·수정일), CSV 입력, 랭킹 개편(반응형·정렬토글·유형필터·관심기관), 더보기 검색 팝업, 선택 마커 물결 효과를 추가한다.

**Architecture:** 순수 로직(logic.js)에 유효 입찰예상일·confidence 유도·정렬·CSV 파싱을 넣고 `node --test`로 TDD. 상태(store.js)에 관심기관(♥)과 데이터셋 저장을 추가. 표시/인터랙션(render.js·app.js·index.html)은 기존 D3 구조 위에 얹고 로컬 http 서버 + 브라우저로 검증. 외부 라이브러리 없음.

**Tech Stack:** 바닐라 JS(IIFE 모듈), D3 v7(로컬 번들), `node:test`, CSS/SVG 애니메이션.

## Global Constraints

- **오프라인 `file://` 및 폐쇄망 동작** — 외부 CDN/라이브러리 금지. CSV는 순수 JS 파싱.
- **데이터/지도 파일은 `window.<전역>` 래핑** — fetch 미사용.
- **코드=영문 키, 화면=한글 라벨.** 화면 문구에 개발자 용어(파일명·키명) 노출 금지.
- **confidence는 저장하지 않고 유도** — `confirmed=true`(공고확인)일 때만 `확정`, 기본 `추측`, 날짜 없으면 `미상`.
- **조작 금지 완화** — `sources`는 더 이상 필수 아님. 필수 = `name`·`type`·`region`.
- **테스트 실행(Windows/Node)**: `node --test test/*.test.js` (glob 형태 필수).
- **지도(national/region 렌더·GeoJSON)는 이번 범위에서 변경하지 않는다.**

---

### Task 1: 유효 입찰예상일 + confidence 유도 (logic.js)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces:
  - `logic.addYears(dateStr, years) -> 'YYYY-MM-DD' | null`
  - `logic.effectiveBid(rec) -> { date: string|null, confidence: '확정'|'추측'|'미상' }`
  - `logic.daysUntil(dateStr, today) -> number` (기존 유지)
  - `logic.urgencyOf(rec, today) -> URGENCY` (신규, effectiveBid 기반)
  - `logic.sortByUrgency(list, today)` — effectiveBid 기반으로 변경
  - `logic.recordGlyph(rec)` — effectiveBid 기반으로 변경

- [ ] **Step 1: 실패 테스트 작성** — `dashboard/test/logic.test.js` 하단에 추가

```javascript
test('addYears: 정수 년 더하기', () => {
  assert.strictEqual(logic.addYears('2022-12-05', 2), '2024-12-05');
  assert.strictEqual(logic.addYears('2020-02-29', 1), '2021-03-01'); // 윤일 롤오버
  assert.strictEqual(logic.addYears('', 2), null);
  assert.strictEqual(logic.addYears('bad', 2), null);
});

test('effectiveBid: 확정/추측/미상 유도', () => {
  // 확정: 날짜 + confirmed
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03', confirmed:true }),
    { date:'2026-12-03', confidence:'확정' });
  // 추측: 날짜 있으나 confirmed 아님(기본)
  assert.deepStrictEqual(logic.effectiveBid({ contractEnd:'2026-12-03' }),
    { date:'2026-12-03', confidence:'추측' });
  // 추측: 날짜 없고 지난입찰일+주기 → 계산
  assert.deepStrictEqual(logic.effectiveBid({ lastBid:'2022-12-05', term:2 }),
    { date:'2024-12-05', confidence:'추측' });
  // 미상: 아무것도 없음
  assert.deepStrictEqual(logic.effectiveBid({}), { date:null, confidence:'미상' });
});

test('urgencyOf: effectiveBid 기반', () => {
  const today = new Date('2026-07-23T00:00:00');
  assert.strictEqual(logic.urgencyOf({ contractEnd:'2026-08-01', confirmed:true }, today), logic.URGENCY.RED);
  assert.strictEqual(logic.urgencyOf({ lastBid:'2022-01-01', term:4 }, today), logic.URGENCY.RED); // 2026-01-01
  assert.strictEqual(logic.urgencyOf({}, today), logic.URGENCY.GRAY);
});

test('sortByUrgency: effectiveBid(추측 포함) 기준 임박순', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미상' },
    { name:'추측멂', lastBid:'2025-01-01', term:4 }, // 2029-01-01
    { name:'확정임박', contractEnd:'2026-08-01', confirmed:true },
  ];
  assert.deepStrictEqual(logic.sortByUrgency(list, today).map(r=>r.name), ['확정임박','추측멂','미상']);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/*.test.js` (cwd: `dashboard/`)
Expected: FAIL — `logic.addYears is not a function` 등

- [ ] **Step 3: 구현** — `dashboard/js/logic.js`에서 아래를 추가/교체

`computeUrgency` 정의 아래에 추가:

```javascript
  logic.addYears = function (dateStr, years) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setFullYear(d.getFullYear() + Number(years));
    return d.toISOString().slice(0, 10);
  };

  // 유효 입찰예상일 + confidence 유도(저장하지 않음)
  logic.effectiveBid = function (rec) {
    if (rec.contractEnd) return { date: rec.contractEnd, confidence: rec.confirmed ? '확정' : '추측' };
    if (rec.lastBid && rec.term) {
      const d = logic.addYears(rec.lastBid, rec.term);
      if (d) return { date: d, confidence: '추측' };
    }
    return { date: null, confidence: '미상' };
  };

  logic.urgencyOf = function (rec, today) {
    return logic.computeUrgency(logic.effectiveBid(rec).date, today);
  };
```

`sortByUrgency`를 effectiveBid 기반으로 교체:

```javascript
  logic.sortByUrgency = function (list, today) {
    return list.slice().sort(function (a, b) {
      return logic.daysUntil(logic.effectiveBid(a).date, today)
           - logic.daysUntil(logic.effectiveBid(b).date, today);
    });
  };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/*.test.js`
Expected: 신규 4개 포함 PASS. (기존 `sortByUrgency` 테스트는 contractEnd만 쓰므로 계속 PASS)

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): effectiveBid/confidence 유도 + urgencyOf, sort를 유효일 기반으로"
```

---

### Task 2: 검증 완화 + 필드 라벨 + 표시 헬퍼 (logic.js)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces:
  - `logic.REQUIRED_FIELDS = ['name','type','region']`
  - `logic.ALL_FIELDS = ['name','type','region','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt']`
  - `logic.FIELD_LABELS = { name:'기관명', type:'기관구분', region:'지역코드', term:'입찰주기', lastBid:'지난 입찰일', contractEnd:'입찰예상일', confirmed:'확정여부', lng:'경도', lat:'위도', sources:'출처', updatedAt:'수정일' }`
  - `logic.formatBidDate(rec) -> string` — 예: `2026-12-03(확정)` / `2024-12-05(추측)` / `미상`
  - `logic.recordGlyph(rec)` — effectiveBid.date 없으면 `?`

- [ ] **Step 1: 실패 테스트 작성 + 기존 테스트 수정**

기존 테스트 3개를 신규 스키마에 맞게 교체한다:
- `'validateRecord: 필수필드 누락 감지'` → 기대 missing을 `['region']`로:

```javascript
test('validateRecord: 필수는 name/type/region', () => {
  assert.strictEqual(logic.validateRecord({ name:'X', type:'공기업', region:'11' }).valid, true);
  const r = logic.validateRecord({ name:'X', type:'공기업' });
  assert.strictEqual(r.valid, false);
  assert.deepStrictEqual(r.missing, ['region']);
});
```
- `'validateRecord: sources 빈 배열은 누락'` 테스트는 **삭제**(더 이상 필수 아님).
- `'recordGlyph: ! 우선, 그다음 ?'` → 신규 스키마로:

```javascript
test('recordGlyph: ! 우선(필수누락), 그다음 ?(유효일 없음)', () => {
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업' }), '!'); // region 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11' }), '?'); // 날짜 없음
  assert.strictEqual(logic.recordGlyph({ name:'X', type:'공기업', region:'11', contractEnd:'2027-01-01' }), '');
});
```
- `'ALL_FIELDS: 6개 필드를 순서대로 담음'` → 신규 배열로:

```javascript
test('ALL_FIELDS: 신규 스키마 필드', () => {
  assert.deepStrictEqual(logic.ALL_FIELDS,
    ['name','type','region','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt']);
});
```

신규 테스트 추가:

```javascript
test('formatBidDate: 괄호 표기', () => {
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03', confirmed:true }), '2026-12-03(확정)');
  assert.strictEqual(logic.formatBidDate({ contractEnd:'2026-12-03' }), '2026-12-03(추측)');
  assert.strictEqual(logic.formatBidDate({ lastBid:'2022-12-05', term:2 }), '2024-12-05(추측)');
  assert.strictEqual(logic.formatBidDate({}), '미상');
});

test('FIELD_LABELS: 한글 라벨 매핑', () => {
  assert.strictEqual(logic.FIELD_LABELS.contractEnd, '입찰예상일');
  assert.strictEqual(logic.FIELD_LABELS.term, '입찰주기');
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test test/*.test.js`
Expected: FAIL — `formatBidDate` 미정의, ALL_FIELDS 불일치 등

- [ ] **Step 3: 구현** — `dashboard/js/logic.js`

`ALL_FIELDS` 교체 + 라벨/헬퍼 추가:

```javascript
  logic.ALL_FIELDS = ['name','type','region','term','lastBid','contractEnd','confirmed','lng','lat','sources','updatedAt'];
  logic.FIELD_LABELS = { name:'기관명', type:'기관구분', region:'지역코드', term:'입찰주기',
    lastBid:'지난 입찰일', contractEnd:'입찰예상일', confirmed:'확정여부', lng:'경도', lat:'위도',
    sources:'출처', updatedAt:'수정일' };
  logic.formatBidDate = function (rec) {
    const e = logic.effectiveBid(rec);
    return e.date ? (e.date + '(' + e.confidence + ')') : '미상';
  };
```

`REQUIRED_FIELDS` 교체 + `validateRecord`의 sources 분기 제거:

```javascript
  logic.REQUIRED_FIELDS = ['name','type','region'];
  logic.validateRecord = function (rec) {
    const missing = [];
    logic.REQUIRED_FIELDS.forEach(function (f) {
      if (rec[f] === undefined || rec[f] === null || rec[f] === '') missing.push(f);
    });
    return { valid: missing.length === 0, missing: missing };
  };
```

`recordGlyph` 교체(effectiveBid.date 기반):

```javascript
  logic.recordGlyph = function (rec) {
    if (!logic.validateRecord(rec).valid) return '!';
    if (!logic.effectiveBid(rec).date) return '?';
    return '';
  };
```

- [ ] **Step 4: 통과 확인**

Run: `node --test test/*.test.js`
Expected: PASS(수정·신규 포함).

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): 검증 완화(name/type/region) + 한글 라벨 + formatBidDate"
```

---

### Task 3: 관심도순 정렬 (logic.js)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces: `logic.sortByInterest(list, today, isInterested) -> Array`
  (`isInterested(rec) -> bool`. ♥ 먼저(그 안 임박순) → 미지정(그 아래 임박순))

- [ ] **Step 1: 실패 테스트**

```javascript
test('sortByInterest: 관심 먼저(임박순) 그 뒤 미관심(임박순)', () => {
  const today = new Date('2026-07-23T00:00:00');
  const list = [
    { name:'미관심임박', contractEnd:'2026-08-01', confirmed:true },
    { name:'관심멂', contractEnd:'2029-01-01', confirmed:true },
    { name:'관심임박', contractEnd:'2026-09-01', confirmed:true },
  ];
  const hearts = new Set(['관심멂','관심임박']);
  const out = logic.sortByInterest(list, today, r => hearts.has(r.name)).map(r=>r.name);
  assert.deepStrictEqual(out, ['관심임박','관심멂','미관심임박']);
});
```

- [ ] **Step 2: 실패 확인** — `node --test test/*.test.js` → FAIL

- [ ] **Step 3: 구현**

```javascript
  logic.sortByInterest = function (list, today, isInterested) {
    const on = [], off = [];
    list.forEach(function (r) { (isInterested(r) ? on : off).push(r); });
    return logic.sortByUrgency(on, today).concat(logic.sortByUrgency(off, today));
  };
```

- [ ] **Step 4: 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): sortByInterest(관심도순) 정렬"
```

---

### Task 4: CSV 파싱 + 템플릿 (logic.js)

**Files:**
- Modify: `dashboard/js/logic.js`
- Test: `dashboard/test/logic.test.js`

**Interfaces:**
- Produces:
  - `logic.CSV_HEADERS -> string[]` (한글 헤더 순서)
  - `logic.buildCsvTemplate() -> string` (헤더 + 예시 1행)
  - `logic.parseCsv(text) -> Array<record>` (한글 헤더 → 영문 키, 타입 변환)

- [ ] **Step 1: 실패 테스트**

```javascript
test('parseCsv: 한글헤더→영문키 + 타입 변환', () => {
  const csv = '﻿기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일,확정여부,경도,위도,출처,수정일\n'
    + '서울시청,지자체,11,2,2022-12-05,,,,,공고A;공고B,2026-07-25\n'
    + '"A,병원",대학병원,11,,,2026-08-15,Y,126.99,37.56,,2026-07-25\n';
  const recs = logic.parseCsv(csv);
  assert.strictEqual(recs.length, 2);
  assert.deepStrictEqual(recs[0], { name:'서울시청', type:'지자체', region:'11', term:2,
    lastBid:'2022-12-05', contractEnd:'', confirmed:false, lng:null, lat:null,
    sources:['공고A','공고B'], updatedAt:'2026-07-25' });
  assert.strictEqual(recs[1].name, 'A,병원');       // 따옴표 내 쉼표 보존
  assert.strictEqual(recs[1].confirmed, true);       // Y → true
  assert.strictEqual(recs[1].lng, 126.99);
  assert.deepStrictEqual(recs[1].sources, []);       // 빈 출처 → []
});

test('buildCsvTemplate: BOM + 헤더 포함', () => {
  const t = logic.buildCsvTemplate();
  assert.ok(t.startsWith('﻿'));
  assert.ok(t.indexOf('기관명,기관구분,지역코드') >= 0);
});
```

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현**

```javascript
  logic.CSV_HEADERS = ['기관명','기관구분','지역코드','입찰주기','지난입찰일','입찰예상일','확정여부','경도','위도','출처','수정일'];
  logic._HEADER_KEY = { '기관명':'name','기관구분':'type','지역코드':'region','입찰주기':'term',
    '지난입찰일':'lastBid','입찰예상일':'contractEnd','확정여부':'confirmed','경도':'lng','위도':'lat',
    '출처':'sources','수정일':'updatedAt' };

  // RFC4180 유사: 따옴표/쉼표/개행 처리
  logic._splitCsvLine = function (line) {
    const out = []; let cur = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else {
        if (c === '"') q = true;
        else if (c === ',') { out.push(cur); cur = ''; }
        else cur += c;
      }
    }
    out.push(cur); return out;
  };

  logic.parseCsv = function (text) {
    const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = clean.split('\n').filter(function (l) { return l.trim() !== ''; });
    if (!lines.length) return [];
    const headers = logic._splitCsvLine(lines[0]).map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      const cells = logic._splitCsvLine(line);
      const rec = {};
      headers.forEach(function (h, i) {
        const key = logic._HEADER_KEY[h]; if (!key) return;
        const v = (cells[i] || '').trim();
        if (key === 'term') rec.term = v ? Number(v) : undefined;
        else if (key === 'lng' || key === 'lat') rec[key] = v ? Number(v) : null;
        else if (key === 'confirmed') rec.confirmed = /^(y|yes|true|1)$/i.test(v);
        else if (key === 'sources') rec.sources = v ? v.split(';').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else rec[key] = v;
      });
      return rec;
    });
  };

  logic.buildCsvTemplate = function () {
    const example = ['서울시청(예시)','지자체','11','2','2022-12-05','','', '', '', '공고URL', '2026-07-25'];
    return '﻿' + logic.CSV_HEADERS.join(',') + '\n' + example.join(',') + '\n';
  };
```

- [ ] **Step 4: 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/logic.js dashboard/test/logic.test.js
git commit -m "feat(dashboard): CSV parseCsv + buildCsvTemplate (라이브러리 없음)"
```

---

### Task 5: 관심기관(♥) + 데이터셋 저장 (store.js)

**Files:**
- Modify: `dashboard/js/store.js`
- Test: `dashboard/test/store.test.js`

**Interfaces:**
- Produces:
  - `store.isInterested(name) -> bool`, `store.toggleInterest(name) -> string[]`, `store.loadInterest() -> string[]`
  - `store.loadData() -> Array|null`, `store.saveData(list) -> void`

- [ ] **Step 1: 실패 테스트** — `dashboard/test/store.test.js` 하단에 추가

```javascript
test('interest: 토글/조회 (♥, 관심지역과 별개 키)', () => {
  global.localStorage = makeLS(); // 기존 테스트의 메모리 LS 팩토리 재사용
  assert.strictEqual(store.isInterested('병원A'), false);
  store.toggleInterest('병원A');
  assert.strictEqual(store.isInterested('병원A'), true);
  store.toggleInterest('병원A');
  assert.strictEqual(store.isInterested('병원A'), false);
});

test('data: saveData/loadData 왕복', () => {
  global.localStorage = makeLS();
  assert.strictEqual(store.loadData(), null);
  store.saveData([{ name:'A' }]);
  assert.deepStrictEqual(store.loadData(), [{ name:'A' }]);
});
```

> 주의: `store.test.js` 상단에 이미 메모리 localStorage 팩토리가 있으면 재사용한다. 없으면 아래를 파일 상단에 추가:
> ```javascript
> function makeLS(){ const m={}; return { getItem:k=>k in m?m[k]:null, setItem:(k,v)=>{m[k]=String(v);}, removeItem:k=>{delete m[k];} }; }
> ```

- [ ] **Step 2: 실패 확인** — `node --test test/*.test.js` → FAIL

- [ ] **Step 3: 구현** — `dashboard/js/store.js`의 키 선언부와 API에 추가

```javascript
  const INTEREST_KEY = 'tbd.interest';
  const DATA_KEY = 'tbd.data';
```
```javascript
  store.loadInterest = function () { return read(INTEREST_KEY, []); };
  store.isInterested = function (name) { return store.loadInterest().indexOf(name) >= 0; };
  store.toggleInterest = function (name) {
    const a = store.loadInterest(); const i = a.indexOf(name);
    if (i >= 0) a.splice(i, 1); else a.push(name);
    write(INTEREST_KEY, a); return a;
  };
  store.loadData = function () { return read(DATA_KEY, null); };
  store.saveData = function (list) { write(DATA_KEY, list); };
```

- [ ] **Step 4: 통과 확인** — PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/store.js dashboard/test/store.test.js
git commit -m "feat(dashboard): 관심기관(♥) + 데이터셋 저장 store API"
```

---

### Task 6: CSV 템플릿 다운로드 + 내보내기 라벨 (export.js)

**Files:**
- Modify: `dashboard/js/export.js`
- Test: `dashboard/test/export.test.js`

**Interfaces:**
- Consumes: `logic.buildCsvTemplate` (Task 4)
- Produces: `exporter.buildTemplateText() -> string`, `exporter.downloadCsvTemplate()`(브라우저), `exporter.downloadInstitutions(list)`(기존 유지)

- [ ] **Step 1: 실패 테스트** — `dashboard/test/export.test.js`

```javascript
const logic = require('../js/logic.js');
test('buildTemplateText: logic.buildCsvTemplate 위임', () => {
  assert.strictEqual(exporter.buildTemplateText(), logic.buildCsvTemplate());
});
```
> `export.test.js`가 `exporter`를 require하지 않으면 상단에 `const exporter = require('../js/export.js');` 추가. export.js가 node에서 `logic`을 참조하도록 require 가드를 넣는다(Step 3).

- [ ] **Step 2: 실패 확인** — FAIL

- [ ] **Step 3: 구현** — `dashboard/js/export.js`

파일 상단 IIFE 안, `const exporter = {};` 다음에 logic 확보:

```javascript
  const logic = (typeof require !== 'undefined') ? require('./logic.js') : root.logic;
```
`downloadInstitutions`의 주석에서 "sources는 1개 이상 필수" 문구 제거:

```javascript
    const text = '// 편집 반영본 — dashboard/data/institutions.js 로 교체하세요.\n' +
      exporter.serializeInstitutions(list);
```
템플릿 API 추가:

```javascript
  exporter.buildTemplateText = function () { return logic.buildCsvTemplate(); };
  exporter._download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  };
  exporter.downloadCsvTemplate = function () {
    exporter._download('입찰정보_템플릿.csv', exporter.buildTemplateText(), 'text/csv;charset=utf-8');
  };
```

- [ ] **Step 4: 통과 확인** — `node --test test/*.test.js` → PASS

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/export.js dashboard/test/export.test.js
git commit -m "feat(dashboard): CSV 템플릿 다운로드 + 내보내기 주석 정리"
```

---

### Task 7: 샘플 데이터 신규 스키마 이관 (data/institutions.js)

**Files:**
- Modify: `dashboard/data/institutions.js`

**Interfaces:**
- Produces: `window.institutions` — 신규 스키마(term/lastBid/confirmed/updatedAt) 예시.

- [ ] **Step 1: 교체** — `dashboard/data/institutions.js` 전체를 아래로

```javascript
// 개발용 샘플 — 실데이터 아님. 실기관 데이터로 교체(또는 CSV 업로드).
window.institutions = [
  { name:"서울시청(예시)", type:"지자체", region:"11", term:4, lastBid:"2022-12-30",
    sources:[], updatedAt:"2026-07-25" }, // 추측(2026-12-30)
  { name:"경기도청(예시)", type:"지자체", region:"41", contractEnd:"2027-12-31", confirmed:true,
    sources:[], updatedAt:"2026-07-25" }, // 확정
  { name:"○○대학병원(예시)", type:"대학병원", region:"11", lng:126.99, lat:37.56,
    contractEnd:"2026-08-15", sources:[], updatedAt:"2026-07-25" }, // 추측(확정 아님)
  { name:"△△공사(예시)", type:"공기업", region:"41", lng:127.05, lat:37.28,
    term:2, lastBid:"2026-06-30", sources:[], updatedAt:"2026-07-25" }, // 추측(2028-06-30)
  { name:"□□공단(예시)", type:"공공기관", region:"11", lng:126.92, lat:37.53,
    sources:[], updatedAt:"2026-07-25" }, // 미상 → '?' 검증용
  { name:"무결성불량(예시)", type:"공기업", lng:127.01, lat:37.50,
    sources:[], updatedAt:"2026-07-25" }, // region 없음 → '!' 검증용
];
```

- [ ] **Step 2: 로드 확인**

Run(cwd `dashboard/`): `node -e "global.window={};require('./data/institutions.js');console.log(window.institutions.length)"`
Expected: `6`

- [ ] **Step 3: 커밋**

```bash
git add dashboard/data/institutions.js
git commit -m "chore(dashboard): 샘플 데이터 신규 스키마 이관"
```

---

### Task 8: 상단바 컨트롤 + 모달 마크업 (index.html)

**Files:**
- Modify: `dashboard/index.html`

**Interfaces:**
- Produces(DOM id): `#btn-add`, `#btn-tmpl`, `#file-csv`, `#btn-export`(라벨 변경), `#rank-sort`(select), `#more-modal`, `#more-search`, `#more-tbody`, `#add-modal`, `#add-fields`, `#add-save`, `#add-cancel`

- [ ] **Step 1: 상단바 버튼 교체** — `#topbar`의 export 버튼 라인을 아래로 교체

```html
    <button id="btn-add" style="background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;">＋ 기관 추가</button>
    <button id="btn-tmpl" style="background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;">CSV 템플릿 내려받기</button>
    <label style="background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;">CSV 업로드<input id="file-csv" type="file" accept=".csv" style="display:none;"></label>
    <button id="btn-export" style="background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 10px;cursor:pointer;">기관 정보 내보내기</button>
```

- [ ] **Step 2: 랭킹 정렬 토글** — `#rank-panel` 위(같은 `#drill-wrap` 안, `#rank-panel` 시작 직전)에 헤더 컨트롤은 render가 그리므로 여기선 생략. 대신 `<section id="tab-map">` 안 `#popover` 다음에 **더보기 모달** 추가:

```html
<div id="more-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:30;">
  <div style="max-width:720px;margin:6vh auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;max-height:84vh;display:flex;flex-direction:column;">
    <div style="display:flex;gap:10px;align-items:center;">
      <h3 style="margin:0;flex:0 0 auto;">전체 입찰건</h3>
      <input id="more-search" placeholder="기관명·지역·유형 검색" style="flex:1;padding:6px 10px;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;">
      <button id="more-close" style="background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px 10px;cursor:pointer;">닫기</button>
    </div>
    <div style="overflow:auto;margin-top:10px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="text-align:left;color:var(--muted);">
          <th style="padding:6px;">기관명</th><th style="padding:6px;">기관구분</th><th style="padding:6px;">지역</th><th style="padding:6px;">입찰예상일</th><th style="padding:6px;">입찰주기</th><th style="padding:6px;">수정일</th>
        </tr></thead>
        <tbody id="more-tbody"></tbody>
      </table>
    </div>
  </div>
</div>
```

- [ ] **Step 3: 기관 추가 모달** — 기존 `#edit-modal` 다음에 추가(편집 모달과 별개 id)

```html
<div id="add-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:30;">
  <div style="max-width:420px;margin:6vh auto;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;max-height:84vh;overflow:auto;">
    <h3 style="margin-top:0;">기관 추가</h3>
    <div id="add-fields"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
      <button id="add-cancel">취소</button><button id="add-save">저장</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 브라우저 로드 확인**

로컬 서버 실행(별도 터미널): `node scratchpad/serve.js` 또는 임의 정적 서버로 `dashboard/`를 `http://127.0.0.1:8777`에 서빙.
브라우저에서 열어 상단바에 `＋ 기관 추가 / CSV 템플릿 내려받기 / CSV 업로드 / 기관 정보 내보내기`가 보이는지 확인(동작은 이후 태스크).

- [ ] **Step 5: 커밋**

```bash
git add dashboard/index.html
git commit -m "feat(dashboard): 상단바 컨트롤 + 더보기/기관추가 모달 마크업"
```

---

### Task 9: 랭킹 개편 — 표시·반응형·정렬토글·유형필터·♥ (render.js)

**Files:**
- Modify: `dashboard/js/render.js`
- Modify: `dashboard/index.html`(랭킹 카드 CSS 소량)

**Interfaces:**
- Consumes: `logic.formatBidDate`, `logic.sortByUrgency`, `logic.sortByInterest`, `logic.FIELD_LABELS`, `store.isInterested/toggleInterest`
- Produces: `render.state.rankSort ('urgency'|'interest')`, `render.drawRankingPanel(code)` 개편, `render.rankedList(code)`

- [ ] **Step 1: 반응형 높이 CSS** — `index.html` `<style>`의 `.rank-card` 규칙 근처에 추가

```css
  #rank-panel { max-height: calc(100vh - 160px); }
  .rank-head { display:flex; gap:8px; align-items:center; margin:4px 0 10px; flex-wrap:wrap; }
  .rank-head select, .rank-head .rk-type { background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:6px; padding:3px 6px; font-size:12px; }
  .heart { cursor:pointer; float:right; }
```
(참고: `#rank-panel`은 이미 인라인 `max-height`가 있으므로, 인라인 style을 제거하고 CSS로 이관 — `index.html`의 `#rank-panel` 인라인 `max-height:calc(100vh - 160px)`를 삭제.)

- [ ] **Step 2: render.state에 정렬 모드 추가** — `render.state` 객체에 필드 추가

```javascript
    rankSort: 'urgency',   // 'urgency' | 'interest'
```

- [ ] **Step 3: 정렬 헬퍼 + drawRankingPanel 교체** — `render.drawRankingPanel`을 아래로 교체

```javascript
  render.rankedList = function (code) {
    let list = render.institutionsByRegion(code)
      .filter(function (r) { return render._rankTypeVisible(r); });
    if (render.state.rankSort === 'interest')
      return logic.sortByInterest(list, render.state.today, function (r){ return store.isInterested(r.name); });
    return logic.sortByUrgency(list, render.state.today);
  };
  // 랭킹 유형 필터: 지자체는 항상 표시, 그 외는 enabledTypes 따름
  render._rankTypeVisible = function (r) {
    if (r.type === '지자체') return true;
    if (logic.FILTERABLE_TYPES.indexOf(r.type) >= 0) return render.state.enabledTypes.has(r.type);
    return true;
  };

  render.drawRankingPanel = function (code) {
    const panel = document.getElementById('rank-panel'); if (!panel) return;
    panel.style.display = 'block';
    // 헤더(정렬 토글) + 목록 컨테이너
    panel.innerHTML =
      '<div class="rank-head"><b>랭킹</b>' +
      '<select id="rank-sort"><option value="urgency">임박순</option><option value="interest">관심도순</option></select>' +
      '</div><div id="rank-list"></div>' +
      '<div style="margin-top:8px;"><button id="rank-more" style="width:100%;background:var(--bg);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:6px;cursor:pointer;">더 보기 — 전체 입찰건</button></div>';
    document.getElementById('rank-sort').value = render.state.rankSort;
    document.getElementById('rank-sort').addEventListener('change', function (e) {
      render.state.rankSort = e.target.value; render.drawRankingPanel(code);
    });
    document.getElementById('rank-more').addEventListener('click', function () { render.openMoreModal(); });

    const listEl = document.getElementById('rank-list');
    render.rankedList(code).forEach(function (r) {
      const card = document.createElement('div'); card.className = 'rank-card'; card.dataset.name = r.name;
      const glyph = logic.recordGlyph(r);
      const hearted = store.isInterested(r.name);
      card.innerHTML = '<span class="heart" data-name="' + logic.esc(r.name) + '">' + (hearted ? '♥' : '♡') + '</span>' +
        '<b>' + logic.esc(r.name) + '</b> ' + (glyph ? '<span class="miss">' + logic.esc(glyph) + '</span>' : '') +
        '<br><small>' + logic.esc(r.type) + ' · ' + logic.esc(logic.formatBidDate(r)) + '</small>';
      card.querySelector('.heart').addEventListener('click', function (e) {
        e.stopPropagation(); store.toggleInterest(r.name); render.drawRankingPanel(code);
      });
      card.addEventListener('mouseenter', function () { render.highlightMarker(r.name, true); });
      card.addEventListener('mouseleave', function () { render.highlightMarker(r.name, false); });
      card.addEventListener('click', function (ev) { render.selectInstitution(r); render.showPopover(r, ev.clientX, ev.clientY); });
      listEl.appendChild(card);
    });
  };
```

> `render.selectInstitution`(물결)과 `render.openMoreModal`(더보기)은 Task 10/11에서 정의한다. 이 태스크에선 두 함수 호출부만 둔다(미정의 시 콘솔 에러 대신 가드) → 아래 Step 4에서 임시 no-op 가드를 함께 넣는다.

- [ ] **Step 4: 임시 가드** — 파일 하단 `root.render = render;` 직전에 추가(Task 10/11에서 실제 구현으로 대체)

```javascript
  if (!render.selectInstitution) render.selectInstitution = function () {};
  if (!render.openMoreModal) render.openMoreModal = function () {};
```

- [ ] **Step 5: 유형 필터 → 랭킹 재렌더 연동** — `app.wireFilters`의 체크박스 change 핸들러에 랭킹 갱신 추가(Task 12에서 최종 정리하되, 여기서 우선 반영). `app.js`의 해당 change 콜백 끝에:

```javascript
        if (root.render.state.currentRegion) root.render.drawRankingPanel(root.render.state.currentRegion);
```

- [ ] **Step 6: 브라우저 검증**

`http://127.0.0.1:8777`에서 경기 클릭 → 랭킹 패널에 `임박순/관심도순` 셀렉트, 각 카드 `♡/♥`, 하단 `더 보기` 버튼 표시. ♥ 토글 시 관심도순에서 위로 정렬되는지 확인. 유형 체크박스 끄면 해당 유형이 랭킹에서 사라지는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add dashboard/js/render.js dashboard/index.html dashboard/js/app.js
git commit -m "feat(dashboard): 랭킹 개편(표시·반응형·정렬토글·유형필터·관심기관)"
```

---

### Task 10: 더 보기 모달 + 검색 (render.js)

**Files:**
- Modify: `dashboard/js/render.js`

**Interfaces:**
- Consumes: `logic.formatBidDate`, `#more-modal/#more-search/#more-tbody/#more-close`
- Produces: `render.openMoreModal()`, `render.renderMoreTable(query)`

- [ ] **Step 1: 구현** — Task 9 Step 4의 `openMoreModal` 가드를 실제 구현으로 대체

```javascript
  render.REGION_NAME_ALL = function (code) { return render.REGION_NAME[code] || code; };
  render.openMoreModal = function () {
    const modal = document.getElementById('more-modal'); if (!modal) return;
    modal.style.display = 'block';
    const search = document.getElementById('more-search');
    search.value = ''; render.renderMoreTable('');
    search.oninput = function () { render.renderMoreTable(search.value); };
    document.getElementById('more-close').onclick = function () { modal.style.display = 'none'; };
  };
  render.renderMoreTable = function (query) {
    const tb = document.getElementById('more-tbody'); if (!tb) return;
    const q = (query || '').trim().toLowerCase();
    const all = render.allInstitutions();
    const rows = logic.sortByUrgency(all, render.state.today).filter(function (r) {
      if (!q) return true;
      return [r.name, r.type, render.REGION_NAME_ALL(r.region)].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = rows.map(function (r) {
      return '<tr style="border-top:1px solid var(--line);">' +
        '<td style="padding:6px;">' + logic.esc(r.name) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.type || '') + '</td>' +
        '<td style="padding:6px;">' + logic.esc(render.REGION_NAME_ALL(r.region)) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(logic.formatBidDate(r)) + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.term ? r.term + '년' : '') + '</td>' +
        '<td style="padding:6px;">' + logic.esc(r.updatedAt || '') + '</td></tr>';
    }).join('');
  };
```
그리고 Task 9 Step 4에서 넣은 `if (!render.openMoreModal) ...` 가드 라인을 삭제.

- [ ] **Step 2: 브라우저 검증**

랭킹의 `더 보기` 클릭 → 모달에 전체 기관 표. 검색창에 "병원" 입력 시 필터, "서울"/"경기" 지역명 검색 동작, 닫기 동작 확인.

- [ ] **Step 3: 커밋**

```bash
git add dashboard/js/render.js
git commit -m "feat(dashboard): 더보기 모달(전체 입찰건 표 + 검색)"
```

---

### Task 11: 선택 마커 물결(ripple) 효과 (render.js, index.html)

**Files:**
- Modify: `dashboard/js/render.js`, `dashboard/index.html`(CSS)

**Interfaces:**
- Produces: `render.selectInstitution(rec)`, `render._drawRipple(name)` — 선택 기관 마커 위치에 확산 원.

- [ ] **Step 1: CSS keyframes** — `index.html` `<style>`에 추가

```css
  @keyframes ripple { from { r:6; opacity:.55; } to { r:26; opacity:0; } }
  .ripple-ring { fill:none; stroke:#ffd166; stroke-width:2; animation: ripple 1.4s ease-out infinite; pointer-events:none; }
```

- [ ] **Step 2: 구현** — Task 9의 `selectInstitution` 가드를 실제 구현으로 대체

```javascript
  render._selectedName = null;
  render.selectInstitution = function (rec) {
    render._selectedName = rec ? rec.name : null;
    render._drawRipple(render._selectedName);
    if (rec) { render.highlightCard(rec.name, true); }
  };
  render._drawRipple = function (name) {
    const svg = d3.select('#map-svg');
    svg.selectAll('g.ripple-layer').remove();
    if (!name) return;
    // 현재 지역 마커 중 해당 이름의 좌표를 찾는다
    const proj = render._regionProjection; if (!proj) return;
    const rec = render.institutionsByRegion(render.state.currentRegion)
      .filter(function (r){ return r.name === name && typeof r.lng === 'number' && typeof r.lat === 'number'; })[0];
    if (!rec) return;
    const p = proj([rec.lng, rec.lat]);
    const g = svg.append('g').attr('class', 'ripple-layer');
    // 3중 링(위상차)로 잔잔한 물결
    [0, 0.45, 0.9].forEach(function (delay) {
      g.append('circle').attr('class', 'ripple-ring')
        .attr('cx', p[0]).attr('cy', p[1]).attr('r', 6)
        .style('animation-delay', delay + 's');
    });
  };
```
그리고 Task 9 Step 4의 `if (!render.selectInstitution) ...` 가드 라인을 삭제.

- [ ] **Step 3: 마커 클릭에서도 선택 연동** — `render.onMarkerClick`을 아래로 교체

```javascript
  render.onMarkerClick = function (rec) {
    render.showPopover(rec, window.innerWidth/2, 120);
    render.selectInstitution(rec);
  };
```
지역 복귀 시 정리 — `render.drawRegion` 마지막(`render.drawRankingPanel(code);` 다음)에 추가:

```javascript
    render._drawRipple(null);
```

- [ ] **Step 4: 브라우저 검증**

경기/서울 진입 → 랭킹 카드(점 마커 있는 기관: 병원/공사/공단) 클릭 시 지도의 해당 마커에서 잔잔히 확산하는 노란 물결이 반복되는지 확인. 지도 마커 직접 클릭 시에도 동작. 지역 복귀 시 물결 사라짐.

- [ ] **Step 5: 커밋**

```bash
git add dashboard/js/render.js dashboard/index.html
git commit -m "feat(dashboard): 선택 기관 마커 물결(ripple) 효과"
```

---

### Task 12: 기관 추가 폼 + CSV 다운/업로드 + 통합 배선 (app.js)

**Files:**
- Modify: `dashboard/js/app.js`, `dashboard/js/render.js`

**Interfaces:**
- Consumes: `logic.ALL_FIELDS/FIELD_LABELS/validateRecord/parseCsv`, `store.saveData/loadData`, `exporter.downloadCsvTemplate/downloadInstitutions`
- Produces: `app.openAdd()`, `app.wireData()`; `render.baseInstitutions()` (데이터셋 소스 일원화)

- [ ] **Step 1: 데이터 소스 일원화(render.js)** — `render.allInstitutions`를 교체

```javascript
  render.baseInstitutions = function () { return store.loadData() || window.institutions || []; };
  render.allInstitutions = function () { return store.applyEdits(render.baseInstitutions()); };
```

- [ ] **Step 2: 기관 추가 폼(app.js)** — `app.openAdd` 추가(편집 폼과 동형, 확정여부 체크박스 포함)

```javascript
  app.openAdd = function () {
    const wrap = document.getElementById('add-fields');
    const L = root.logic.FIELD_LABELS;
    const fields = ['name','type','region','term','lastBid','contractEnd','lng','lat','sources'];
    wrap.innerHTML = fields.map(function (f) {
      return '<label style="display:block;margin:6px 0;">' + L[f] +
        '<input data-f="' + f + '" style="width:100%;"></label>';
    }).join('') +
      '<label style="display:flex;gap:6px;align-items:center;margin:6px 0;">' +
      '<input type="checkbox" data-f="confirmed"> ' + L.confirmed + '(공고로 확인됨)</label>' +
      '<p style="color:var(--muted);font-size:11px;">확정여부를 체크하지 않으면 "추측"으로 표시됩니다.</p>';
    const modal = document.getElementById('add-modal'); modal.style.display = 'block';
    document.getElementById('add-cancel').onclick = function () { modal.style.display = 'none'; };
    document.getElementById('add-save').onclick = function () {
      const rec = {};
      wrap.querySelectorAll('input[data-f]').forEach(function (inp) {
        const f = inp.dataset.f;
        if (f === 'confirmed') rec.confirmed = inp.checked;
        else if (f === 'sources') rec.sources = inp.value ? inp.value.split(',').map(function (s){ return s.trim(); }).filter(Boolean) : [];
        else if (f === 'term') rec.term = inp.value ? Number(inp.value) : undefined;
        else if (f === 'lng' || f === 'lat') rec[f] = inp.value ? Number(inp.value) : undefined;
        else if (inp.value) rec[f] = inp.value;
      });
      const v = root.logic.validateRecord(rec);
      if (!v.valid) { alert('필수 누락: ' + v.missing.map(function(k){return root.logic.FIELD_LABELS[k];}).join(', ')); return; }
      rec.updatedAt = new Date().toISOString().slice(0,10);
      const data = root.render.baseInstitutions().slice(); data.push(rec);
      root.store.saveData(data); modal.style.display = 'none';
      root.render.drawTicker();
      if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
      else root.render.drawNational();
    };
  };
```

- [ ] **Step 3: CSV/컨트롤 배선(app.js)** — `app.wireData` 추가 + `app.init`에서 호출

```javascript
  app.wireData = function () {
    document.getElementById('btn-add').addEventListener('click', app.openAdd);
    document.getElementById('btn-tmpl').addEventListener('click', function () { root.exporter.downloadCsvTemplate(); });
    document.getElementById('file-csv').addEventListener('change', function (e) {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        const recs = root.logic.parseCsv(String(reader.result));
        if (!recs.length) { alert('CSV에서 읽은 행이 없습니다.'); return; }
        recs.forEach(function (r) { if (!r.updatedAt) r.updatedAt = new Date().toISOString().slice(0,10); });
        root.store.saveData(recs);
        alert(recs.length + '건을 반영했습니다.');
        root.render.drawTicker(); root.render.drawNational();
      };
      reader.readAsText(file, 'utf-8'); e.target.value = '';
    });
  };
```
`app.init`의 `app.wireExport();` 다음 줄에 추가:

```javascript
    app.wireData();
```

- [ ] **Step 4: 전체 회귀 — 단위테스트**

Run(cwd `dashboard/`): `node --test test/*.test.js`
Expected: 전부 PASS.

- [ ] **Step 5: 브라우저 통합 검증(회귀 체크리스트)**

`http://127.0.0.1:8777`에서:
1. 전국 지도 렌더 + 서울/경기 색 → OK
2. 서울/경기 클릭 → 구/시군 확대 + 랭킹(정렬토글·♥·더보기) → OK
3. `＋ 기관 추가` → 폼에서 region 없이 저장 시도 → "필수 누락: 지역코드" 경고 → OK
4. 정상 입력(기관명/기관구분/지역코드) + 확정여부 체크 → 저장 → 랭킹/티커 반영 → OK
5. `CSV 템플릿 내려받기` → `입찰정보_템플릿.csv` 다운로드, 엑셀에서 한글 정상 → OK
6. 그 CSV에 1~2행 채워 `CSV 업로드` → "N건 반영" → 지도/랭킹 반영 → OK
7. `기관 정보 내보내기` → institutions.js 다운로드 → OK
8. 마커 클릭/랭킹 클릭 → 물결 효과 → OK
9. back(← 전국) → 전국 리셋 → OK

- [ ] **Step 6: 커밋**

```bash
git add dashboard/js/app.js dashboard/js/render.js
git commit -m "feat(dashboard): 기관 추가 폼 + CSV 다운/업로드 배선 + 데이터소스 일원화"
```

---

## 실행 후

- 최종 브랜치 리뷰(superpowers:requesting-code-review) 후 main 병합/handoff.
- **오전 지도 코드 변경(geo×3 + render/app 버그수정)이 아직 미커밋**이므로, 이 플랜 실행 전
  또는 첫 커밋과 함께 정리할지 결정한다(별도 커밋 권장).
