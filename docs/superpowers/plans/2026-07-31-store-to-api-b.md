# 계획 B — store→API 전환 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드의 기관 데이터를 localStorage 대신 서버 registry(authoritative store)로 전환한다 — FastAPI 정적 서빙(같은 출처), `PUT /institutions/{id}` 부분 갱신, 서버 모드 병합(union: 서버 행 우선·번들 보완), `file://` 폴백은 기존 동작 그대로.

**Architecture:** 브레인스토밍 승인안(스펙 `2026-07-31-multi-agent-collab-system-design.md` §⑦ + 계획 1 설계 승인). 프런트 진입점은 단 하나 — `render.baseInstitutions()` = `store.loadData() || window.institutions`(`dashboard/js/render.js:69`). 서버 모드는 `store`에 in-memory 서버 리스트를 주입하는 방식으로 이 진입점을 그대로 재사용한다(render.js 무수정). 순수 로직(행 매핑·병합)은 새 `dashboard/js/serverdata.js`에 두고 `node --test`로 검증, fetch 배선은 얇게.

**Tech Stack:** FastAPI StaticFiles, vanilla JS(무빌드, IIFE+`module.exports` 이중 노출 관행 — store.js:56 참조), pytest, node:test.

## Global Constraints

- **무빌드·무의존 유지** — npm 패키지·번들러 금지. JS는 기존 IIFE 패턴.
- **file:// 폴백 불변** — 서버 fetch 실패 시 기존 경로(번들 `window.institutions` + localStorage)가 한 줄도 달라지지 않아야 한다. 기존 `node --test` 36건 무수정 통과.
- **개인 선호(♥관심·watch·지도테마·정렬)는 어느 모드든 localStorage** — 건드리지 않는다.
- 서버 병합 규칙(승인안): **union** — 서버 행은 name(name_ko) 기준으로 번들 행과 병합(서버 필드 우선, 서버 값이 null이면 번들 유지; confidence·sources·lng·lat·subRegion처럼 서버에 없는 필드는 번들 유지), 서버에 없는 번들 행은 그대로 유지(지도 데이터 보존).
- 서버 필드 매핑: `name←name_ko, region←region_code, contractEnd←contract_end, lastBid←last_bid, term←term, type←type` + `institutionId←institution_id, stage←stage`(신규 노출 — C의 현황판 진입점).
- 주석·커밋 한국어(끝에 Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>), UTF-8, `py -3` 런처, TDD.
- 전체 `py -3 -m pytest agent backend collector -q` 기준선 **339 passed** 유지 + 신규, `node --test dashboard/test/*.test.js` 36 + 신규 통과.

---

### Task 1: `PUT /institutions/{id}` — 부분 갱신

**Files:**
- Modify: `backend/models.py`(모델 1개), `backend/repository.py`(함수 1개), `backend/routers/institutions.py`(엔드포인트 1개)
- Test: `backend/tests/test_api_institutions_update.py`

**Interfaces:**
- Produces: `InstitutionUpdateIn(region_code|type|contract_end|last_bid|term 모두 optional)`; `update_institution(conn, institution_id, upd: InstitutionUpdateIn) -> Institution | None`(COALESCE 부분 갱신, 없으면 None); `PUT /institutions/{institution_id}` → 200 `Institution` / 404. Task 4의 프런트 편집 저장이 쓴다.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_api_institutions_update.py`:

```python
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, type, contract_end, stage)"
        " VALUES ('dobong', '도봉구', '지자체', '2026-12-31', 2)"
    )
    conn.commit(); conn.close()
    return app


def test_put_partial_update_keeps_unset_fields(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.put("/institutions/dobong", json={"contract_end": "2027-06-30", "term": 4})
    assert r.status_code == 200
    body = r.json()
    assert body["contract_end"] == "2027-06-30"
    assert body["term"] == 4
    assert body["type"] == "지자체"      # 미전송 필드 보존
    assert body["stage"] == 2            # stage는 갱신 대상 아님


def test_put_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.put("/institutions/nope", json={"term": 4}).status_code == 404


def test_put_rejects_stage_and_unknown_fields_silently(tmp_path):
    """stage 같은 워크플로 필드는 이 API로 못 바꾼다(모델에 없음 → 무시)."""
    client = TestClient(_app(tmp_path))
    r = client.put("/institutions/dobong", json={"stage": 9, "term": 3})
    assert r.status_code == 200
    assert r.json()["stage"] == 2
    assert r.json()["term"] == 3
```

- [ ] **Step 2: Run to verify fail** — `py -3 -m pytest backend/tests/test_api_institutions_update.py -v` → 405/ImportError.

- [ ] **Step 3: Implement**

`backend/models.py`:

```python
class InstitutionUpdateIn(BaseModel):
    region_code: str | None = None
    type: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
```

`backend/repository.py`(기존 `upsert_institution`의 COALESCE 관행):

```python
def update_institution(
    conn: sqlite3.Connection, institution_id: str, upd: "InstitutionUpdateIn"
) -> Institution | None:
    if get_institution(conn, institution_id) is None:
        return None
    conn.execute(
        """UPDATE institutions
           SET region_code = COALESCE(?, region_code),
               type = COALESCE(?, type),
               contract_end = COALESCE(?, contract_end),
               last_bid = COALESCE(?, last_bid),
               term = COALESCE(?, term)
           WHERE institution_id = ?""",
        (upd.region_code, upd.type, upd.contract_end, upd.last_bid, upd.term, institution_id),
    )
    conn.commit()
    return get_institution(conn, institution_id)
```

(import 순환 주의: models의 `InstitutionUpdateIn`을 상단 import에 추가.)

`backend/routers/institutions.py`:

```python
@router.put("/{institution_id}", response_model=Institution)
def put_institution(institution_id: str, body: InstitutionUpdateIn, request: Request) -> Institution:
    conn = get_connection(request.app.state.db_path)
    try:
        inst = update_institution(conn, institution_id, body)
        if inst is None:
            raise HTTPException(status_code=404, detail="institution not found")
        return inst
    finally:
        conn.close()
```

- [ ] **Step 4: Run to verify pass** — 3 passed + `py -3 -m pytest backend -q` 무회귀.
- [ ] **Step 5: Commit** — `feat(backend): PUT /institutions/{id} 부분 갱신 — 화면 편집의 서버 반영 (B Task 1)`

---

### Task 2: 정적 서빙 — `create_app(static_dir=…)`

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_static_serving.py`

**Interfaces:**
- Produces: `create_app(..., static_dir: str | None = None)` — 지정 시 **모든 라우터 등록 뒤** `app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")`. 모듈 레벨 앱은 `static_dir=os.environ.get("STATIC_DIR", "dashboard")`. 기본 None이라 기존 테스트 무영향.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_static_serving.py`:

```python
from fastapi.testclient import TestClient

from backend.main import create_app


def _app(tmp_path, static=True):
    static_dir = None
    if static:
        d = tmp_path / "web"; d.mkdir()
        (d / "index.html").write_text("<title>기관인텔리</title>", encoding="utf-8")
        static_dir = str(d)
    return create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                      graph_db_path=str(tmp_path / "g.db"), static_dir=static_dir)


def test_serves_index_at_root(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.get("/")
    assert r.status_code == 200
    assert "기관인텔리" in r.text


def test_api_routes_win_over_static(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.get("/institutions")
    assert r.status_code == 200
    assert r.json() == []           # 정적이 아니라 API가 응답


def test_without_static_dir_root_404(tmp_path):
    client = TestClient(_app(tmp_path, static=False))
    assert client.get("/").status_code == 404
```

- [ ] **Step 2: Run to verify fail** — TypeError(static_dir).

- [ ] **Step 3: Implement** — `backend/main.py`: `from fastapi.staticfiles import StaticFiles`, `create_app` 시그니처에 `static_dir: str | None = None`, 마지막 include_router 뒤에:

```python
    if static_dir:
        # 라우터 등록 뒤에 마운트해야 /institutions 등 API 경로가 정적보다 우선한다.
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
```

모듈 레벨: `app = create_app(os.environ.get("REGISTRY_DB_PATH", "data/registry.db"), static_dir=os.environ.get("STATIC_DIR", "dashboard"))`.

- [ ] **Step 4: Run to verify pass** — 3 passed + backend 전체 무회귀(기존 테스트는 static_dir=None 경로).
- [ ] **Step 5: Commit** — `feat(backend): dashboard 정적 서빙 — create_app(static_dir) 마운트 (B Task 2)`

---

### Task 3: `serverdata.js` — 행 매핑·union 병합 순수 로직

**Files:**
- Create: `dashboard/js/serverdata.js`
- Test: `dashboard/test/serverdata.test.js`

**Interfaces:**
- Produces(전역 `root.serverdata` + `module.exports` 이중 노출 — store.js:56 관행):
  - `mapServerRow(row) -> rec` — 서버 Institution JSON → 대시보드 레코드(`name·type·region·contractEnd·lastBid·term·institutionId·stage`, null 필드는 키 생략).
  - `mergeUnion(bundle, serverRows) -> list` — name 기준: 서버 행이 있으면 번들 위에 서버 필드 덮기(null/생략 필드는 번들 유지), 번들에 없는 서버 행은 추가, 서버에 없는 번들 행은 유지. 반환 순서: 번들 순서 + 신규 서버 행 뒤에.

- [ ] **Step 1: Write the failing tests**

`dashboard/test/serverdata.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const sd = require('../js/serverdata.js');

test('mapServerRow: 서버 필드명을 대시보드 스키마로 옮긴다', function () {
  const rec = sd.mapServerRow({
    institution_id: 'dobong', name_ko: '도봉구', region_code: '11',
    type: '지자체', contract_end: '2026-12-31', last_bid: '2022-12-01',
    term: 4, stage: 6,
  });
  assert.deepStrictEqual(rec, {
    institutionId: 'dobong', name: '도봉구', region: '11', type: '지자체',
    contractEnd: '2026-12-31', lastBid: '2022-12-01', term: 4, stage: 6,
  });
});

test('mapServerRow: null 필드는 키를 만들지 않는다', function () {
  const rec = sd.mapServerRow({ institution_id: 'x', name_ko: '엑스', region_code: null,
    type: null, contract_end: null, last_bid: null, term: null, stage: 1 });
  assert.strictEqual('region' in rec, false);
  assert.strictEqual('contractEnd' in rec, false);
});

test('mergeUnion: 서버 필드 우선, 번들 전용 필드 보존, 순서 유지', function () {
  const bundle = [
    { name: '도봉구', region: '11', contractEnd: '2026-01-01', confidence: '확정',
      sources: ['공고'], lng: 127.0, lat: 37.6 },
    { name: '서울대병원', region: '11', contractEnd: '2027-01-01', confidence: '추측', sources: ['기사'] },
  ];
  const server = [
    { institution_id: 'dobong', name_ko: '도봉구', region_code: null, type: '지자체',
      contract_end: '2026-12-31', last_bid: null, term: 4, stage: 6 },
    { institution_id: 'nowon', name_ko: '노원구', region_code: '11', type: '지자체',
      contract_end: null, last_bid: null, term: null, stage: 2 },
  ];
  const out = sd.mergeUnion(bundle, server);

  assert.strictEqual(out.length, 3);
  const dobong = out[0];
  assert.strictEqual(dobong.contractEnd, '2026-12-31');   // 서버 우선
  assert.strictEqual(dobong.region, '11');                // 서버 null → 번들 유지
  assert.deepStrictEqual(dobong.sources, ['공고']);        // 번들 전용 필드 보존
  assert.strictEqual(dobong.lng, 127.0);
  assert.strictEqual(dobong.stage, 6);                     // 서버 전용 필드 노출
  assert.strictEqual(out[1].name, '서울대병원');            // 서버에 없는 번들 행 유지
  assert.strictEqual(out[2].name, '노원구');                // 번들에 없는 서버 행 추가
});
```

- [ ] **Step 2: Run to verify fail** — `node --test dashboard/test/serverdata.test.js` → MODULE_NOT_FOUND.

- [ ] **Step 3: Implement `dashboard/js/serverdata.js`**

```js
(function (root) {
  'use strict';
  // 서버 registry ↔ 대시보드 레코드 변환·병합 (계획 B). 순수 함수만 — fetch는 app.js.
  const serverdata = {};
  const FIELD_MAP = {
    institution_id: 'institutionId', name_ko: 'name', region_code: 'region',
    type: 'type', contract_end: 'contractEnd', last_bid: 'lastBid',
    term: 'term', stage: 'stage',
  };

  serverdata.mapServerRow = function (row) {
    const rec = {};
    Object.keys(FIELD_MAP).forEach(function (k) {
      if (row[k] !== null && row[k] !== undefined) rec[FIELD_MAP[k]] = row[k];
    });
    return rec;
  };

  // union 병합: 서버가 authoritative store지만, 지도의 번들 전용 데이터(좌표·출처 등)와
  // 서버 미등록 기관을 지우면 안 된다 — 서버 필드만 덮고 나머지는 남긴다.
  serverdata.mergeUnion = function (bundle, serverRows) {
    const byName = {};
    serverRows.forEach(function (r) { byName[r.name_ko] = serverdata.mapServerRow(r); });
    const seen = {};
    const out = bundle.map(function (b) {
      const s = byName[b.name];
      if (!s) return b;
      seen[b.name] = true;
      return Object.assign({}, b, s);
    });
    serverRows.forEach(function (r) {
      if (!seen[r.name_ko]) out.push(serverdata.mapServerRow(r));
    });
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = serverdata;
  else root.serverdata = serverdata;
})(typeof self !== 'undefined' ? self : this);
```

- [ ] **Step 4: Run to verify pass** — 신규 3 + 기존 36 전체 `node --test dashboard/test/*.test.js` 통과.
- [ ] **Step 5: Commit** — `feat(dashboard): serverdata — 서버 행 매핑·union 병합 순수 로직 (B Task 3)`

---

### Task 4: 서버 모드 배선 — 부트스트랩·편집 PUT·CSV 업로드

**Files:**
- Modify: `dashboard/js/store.js`(서버 리스트 주입 2함수), `dashboard/js/app.js`(부트스트랩+편집+CSV 분기), `dashboard/index.html`(serverdata.js 스크립트 태그 — 기존 js 로드 순서에서 store.js 다음)
- Test: `dashboard/test/store.test.js`에 추가(서버 리스트 주입), 수동 검증은 Task 5

**Interfaces:**
- Consumes: Task 1의 PUT, Task 3의 serverdata, 기존 `POST /institutions/import`(응답 형태는 `backend/routers/institutions.py:59`를 읽고 맞출 것).
- Produces:
  - `store.setServerData(list)` / `store.isServerMode()` — in-memory(⚠ localStorage 아님). `store.loadData()`는 서버 리스트가 있으면 그것을 우선 반환(기존 시그니처 불변 — render.js:69가 그대로 동작).
  - `app.bootstrapServer()` — `fetch('/institutions')` 성공(2xx) 시 `serverdata.mergeUnion(window.institutions||[], rows)` → `store.setServerData(...)`, 실패/예외 시 아무것도 안 함(폴백). `app.init`을 async로 바꿔 부트스트랩 후 기존 초기화 순서 진행.
  - 편집 저장: 서버 모드이고 레코드에 `institutionId`가 있으면 `PUT /institutions/{id}`(매핑: contractEnd→contract_end, lastBid→last_bid, region→region_code, type, term(Number)) 후 재조회·재병합; 서버 필드 외(lng·lat·sources 등)는 기존 `store.setEdit` 유지(이중 저장 — 서버 필드는 서버로, 로컬 전용 필드는 overlay로).
  - CSV 업로드: 서버 모드면 `POST /institutions/import`(multipart, 기존 12열 CSV 그대로 — SCHEMA §⑦의 상위집합 계약) 후 재조회·재병합; 폴백 모드면 기존 `store.saveData` 경로 그대로.

- [ ] **Step 1: store 테스트 추가** (`dashboard/test/store.test.js` 하단):

```js
test('setServerData: loadData가 서버 리스트를 우선 반환하고 localStorage는 안 건드린다', function () {
  const store = freshStore();          // 기존 테스트 파일의 로딩 관행을 따를 것
  store.setServerData([{ name: '도봉구' }]);
  assert.strictEqual(store.isServerMode(), true);
  assert.deepStrictEqual(store.loadData(), [{ name: '도봉구' }]);
});
```

(기존 store.test.js가 store를 어떻게 로드·초기화하는지 먼저 읽고 같은 방식(freshStore 등 헬퍼가 있으면 그것)을 쓸 것.)

- [ ] **Step 2: Implement**

`store.js`(loadData 한 줄 변경 + 2함수):

```js
  let serverList = null;   // 서버 모드 in-memory — localStorage에 절대 쓰지 않는다
  store.setServerData = function (list) { serverList = list; };
  store.isServerMode = function () { return serverList !== null; };
  store.loadData = function () { return serverList || read(DATA_KEY, null); };
```

`app.js` — ① `app.bootstrapServer`:

```js
  app.bootstrapServer = function () {
    // file://에서는 fetch가 예외/실패 → 조용히 폴백(기존 동작 그대로).
    return fetch('/institutions').then(function (r) {
      if (!r.ok) return;
      return r.json().then(function (rows) {
        root.store.setServerData(root.serverdata.mergeUnion(window.institutions || [], rows));
      });
    }).catch(function () { /* 폴백 — 아무것도 하지 않음 */ });
  };
```

② `app.init` 첫 줄에서 `app.bootstrapServer().then(...)`으로 기존 본문 감싸기(async 체인, DOMContentLoaded 리스너는 그대로). ③ `openEdit`의 edit-save에서 서버 분기:

```js
      const serverPatch = root.serverdata ? {
        region_code: partial.region, type: partial.type,
        contract_end: partial.contractEnd, last_bid: partial.lastBid,
        term: partial.term ? Number(partial.term) : undefined,
      } : null;
      if (root.store.isServerMode() && rec.institutionId) {
        fetch('/institutions/' + rec.institutionId, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(serverPatch),
        }).then(function () { return app.bootstrapServer(); }).then(function () {
          if (root.render.state.currentRegion) root.render.drawRegion(root.render.state.currentRegion);
          root.render.drawTicker();
        });
      }
      root.store.setEdit(rec.name, partial);   // 로컬 전용 필드 overlay는 항상 유지
```

(undefined 값 필드는 JSON.stringify가 제거 — 부분 갱신에 그대로 부합.) ④ `wireData`의 file-csv 핸들러에 서버 분기: 서버 모드면 `FormData`에 file 실어 `POST /institutions/import` → 응답의 건수 필드(라우터 실제 응답을 읽고 맞출 것)로 alert → `app.bootstrapServer()` 후 재렌더; 폴백 모드는 기존 코드 그대로. ⑤ `index.html`에 `<script src="js/serverdata.js"></script>`를 store.js 다음 줄에 추가.

- [ ] **Step 3: Run** — `node --test dashboard/test/*.test.js` 전체(기존 36+신규) 통과. `py -3 -m pytest backend -q` 무회귀.
- [ ] **Step 4: Commit** — `feat(dashboard): 서버 모드 배선 — 부트스트랩·편집 PUT·CSV 서버 반입 (B Task 4)`

---

### Task 5: 서버 모드 스모크(E2E) + 실행가이드 §8

**Files:**
- Test: `backend/tests/test_static_e2e.py` (TestClient 기반 스모크)
- Modify: `docs/실행가이드_backend-agent.md` (§8)

- [ ] **Step 1: 스모크 테스트** — `backend/tests/test_static_e2e.py`:

```python
"""서버 모드 스모크 — 실제 dashboard/ 정적 자산을 마운트해 한 앱에서
정적 서빙·기관 API·PUT이 함께 동작하는지 확인한다(브라우저 없는 최소 E2E)."""

import pathlib

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app

DASHBOARD_DIR = str(pathlib.Path(__file__).resolve().parents[2] / "dashboard")


def test_dashboard_and_api_coexist(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"), static_dir=DASHBOARD_DIR)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',2)")
    conn.commit(); conn.close()
    client = TestClient(app)

    assert "<title>" in client.get("/").text                       # 실제 index.html
    assert client.get("/js/serverdata.js").status_code == 200      # 신규 스크립트 서빙
    assert client.get("/institutions").json()[0]["name_ko"] == "도봉구"
    assert client.put("/institutions/dobong", json={"term": 4}).json()["term"] == 4
```

- [ ] **Step 2: 실행가이드 §8** — 서버 모드 기동(`py -3 -m uvicorn backend.main:app` 후 브라우저에서 `http://localhost:8000/` — file:// 더블클릭과의 차이), 병합 규칙(서버 우선·union), 편집이 서버에 저장되는 조건(institutionId 있는 행), CSV 업로드의 서버 반입 전환, STATIC_DIR 환경변수.

- [ ] **Step 3: Run** — 스모크 1 passed + 전체 pytest/node 통과.
- [ ] **Step 4: Commit** — `test+docs: 서버 모드 스모크 E2E + 실행가이드 §8 (B Task 5)`

---

## Self-Review 결과

- **승인안 coverage**: 정적 마운트=T2, PUT=T1, 서버 모드 병합(name·서버 우선·confidence/sources 번들 유지)=T3, 폴백/편집/CSV/개인선호 유지=T4, 스모크·문서=T5. stage 노출은 C의 현황판 진입 대비(승인안의 "서버 필드 우선" 연장).
- **Placeholder scan**: 없음. 응답 건수 필드·store 테스트 헬퍼는 "실물을 읽고 맞춰라"로 지시(추측 코드 금지 취지).
- **Type consistency**: `setServerData/isServerMode`(T4 정의·사용), `mapServerRow/mergeUnion`(T3 정의=T4 사용), `create_app(static_dir=)`(T2 정의=T5 사용), PUT 필드명(T1=T4 매핑) 일치.
