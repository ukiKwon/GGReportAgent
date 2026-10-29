# DONE — 완료·해소된 항목 보관본

`NEXT.md`에서 **완료되어 이동한** 항목의 보관본이다(2026-10-29 분리). 열린 일은 `NEXT.md`만 본다.
원문은 이동 전 그대로이며 항목 번호는 NEXT.md 시절 번호를 유지한다. 새로 완료된 항목은 여기 맨 아래에 이어 붙인다.

---

### ✅ 해소됨 — 설계·계획서 정렬 (2026-08-31)

~~**문의서만 고쳤고 설계·계획서는 옛 전제 그대로다.**~~ — **2026-08-31 세션이
해소했다.** 문서 **5건**(설계 · 계획 · 문의서 · 발송본 · 내부메모)이 이제 같은 전제를
쓰고, 8/30·8/31 두 차례 회신이 모두 반영돼 있다. 덤으로 **낡은 경로 5곳**
(`backend/` → `server/`)도 고쳤다. 상세는 `2026-08-31_summary.md`.

### 1. ~~E2E 입찰워크플로~~ — **완료(전 단계 종결)** (2026-08-09)
- **출처**: `2026-08-09_summary.md`. 원 기록은 `2026-07-29_summary.md` `## Session 18:14`,
  이후 갱신은 `2026-07-30`~`2026-08-06` summary 전반.
- **스펙**: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md` §⑧ +
  `docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md`(§⑩ 체크리스트
  19항 전부 ✅). sub-project 1~5(A1·A2·B·C1·C2·D·E·F·H) 및 이월 M-1~M-7 전부 종결.
- **마지막으로 남아 있던 것**: 기관 추가의 서버 경로 — `POST /institutions` 신설로
  2026-08-09 해소(main `339a455`, push됨). 이름 중복은 **409**(CSV 반입 `POST /import`의 upsert와 일부러 다르다:
  표를 다시 올리는 건 정상이지만 사람이 같은 이름을 또 누르는 건 실수다).
  `dashboard/js/app.js`의 "서버 모드 미지원" alert 가드 제거 + `serverdata.toServerRow()`.

**여기서만 남기는 재검토 조건 (지금은 할 일 없음 — 조건이 오면 그때 연다)**

- **`timeline` 페이징** — 안 만들기로 확정(2026-08-06). 실측상 9단계 1회 실행이 40줄
  안팎이라 JSON 한 방으로 충분하다. **다시 볼 임계치**: 한 기관 `timeline.events`가
  **1,000줄**을 넘거나 워크플로 탭 첫 렌더가 눈에 띄게 느려질 때. 그때 할 일은
  `GET /institutions/{id}/timeline`에 `limit`/`offset`/`total` 추가(messages+notifications를
  파이썬에서 합쳐 정렬하므로 **슬라이스는 정렬 뒤에**) + 워크플로 탭 '이전 기록 더 보기'.
  ⚠️ 단계별 패널이 같은 events를 필터링해 쓰므로, 페이징을 붙이면 그 패널이 빈 단계를
  보게 되는 상호작용을 함께 설계해야 한다.
- **업로드의 동기 LLM 호출** — 그대로 두기로 확정(2026-08-06). `POST /tasks/{id}/upload`은
  **프런트 호출부가 없는 API 전용**이라 기다리는 화면이 없다. **다시 볼 시점**: 업로드
  화면이 생길 때 — 그때의 진짜 질문은 "즉시검사 결과를 화면에서 기다리게 할지"다.
- **`TaskUploadIn(TaskMessageIn)`은 의도적 별칭이다** — "의미가 달라 별명으로 둔다"는
  주석이 붙어 있다. 지우면 엔드포인트 시그니처의 의미 구분만 잃는다.
  **다시 "중복 모델"로 올리지 말 것.**
- **쪽지함 30초 폴링은 멈추는 경로가 없다** — 상시 버튼이라 탭 개념이 없다. 30초에 1건이라
  방치하기로 했다.
- **실사이트 크롤러는 범위 밖** — 어댑터 인터페이스만 열려 있고 기본값은 로컬 픽스처
  하나다. 실제 나라장터/지자체 파싱은 **별도 스펙**이 필요하다.
- **재구성 ⑦(개명)은 이 항목 범위에서 제외 확정** — 항목 2에서 다룬다.

### 3. ~~로컬 DB 파일 2건~~ — **완료(종결)** (2026-08-09)
- **출처**: `2026-08-09_summary.md`. 원 기록은 `2026-07-30_summary.md` `## Session 01:00`.
- **① 리포 루트의 stale `registry.db` — 삭제 완료.** 2026-08-09 세션이 **바로 그 원본
  PC에서** 돌았고, 문서에 적힌 그대로의 파일(40KB·2026-07-28 22:20·기관 25·bid_case 1·
  task 3)이 실제로 있는 것을 확인한 뒤 지웠다. 지우기 전 실측 3건:
  ⓐ 이 파일을 읽는 코드가 **없다**(코드는 전부 `data/registry.db`, 테스트는 `tmp_path`)
  ⓑ git 미추적 ⓒ `.gitignore`의 루트 한정 `/*.db`에 이미 걸려 있어 커밋 위험도 없었다.
  삭제 후 전체 테스트 재확인.
- **② `data/registry.db`는 그대로 둔다** — 비어 있지 않고 기관 25건이 들어 있는 정상
  운영 파일이다(gitignored). **새로 clone하면 이 파일이 없으므로 처음 실행 전
  `py -3 -m backend.seed`가 필요하다는 사실은 그대로 유효**하다 — 그 안내는 이 파일
  위쪽 "새 PC에서 이어받을 때" 절에 이미 있다.
- ⚠️ 관련 안전장치(지우지 말 것): 루트 `conftest.py`의 세션 픽스처가
  `data/registry.db`·`data/corpus_index.db`·`data/report_archive`를 스냅샷해, 테스트가
  **실제 데이터 파일**을 건드리면 세션을 실패시킨다. `create_app()`에 `db_path`·
  `index_db_path`·`archive_root`를 안 넘기면 조용히 기본값=운영 경로가 되기 때문이다.

### 4. ~~`institutions.scoring_table`이 아무도 안 쓰는 빈 슬롯~~ — **완료(제거)** (2026-08-06)

- **출처**: `2026-07-30_summary.md` → `2026-08-06_summary.md` `## Session 13:xx`.
- **결정(사용자 확정)**: 채우지 않고 **지웠다.** 이 항목은 원래 "rfp_extract가 만든
  배점표를 DB에도 넣자"였는데, 조사해 보니 **이미 서빙되고 있었다** —
  `GET /institutions/{id}/coverage-map`이 `rfp_scoring.json`을 읽어 내려준다.
  DB에도 두면 **파일과 DB 중 어느 게 진실인지** 문제가 새로 생긴다.
  - 원래 고민이던 "agent/backend 중 어느 층이 쓰나"도 같은 이유로 사라졌다. 참고로
    답은 backend였을 것이다 — `rfp_scoring.json`은 `rfp-locate` 스킬(사람 손)도
    만들어서, agent 노드가 DB에 쓰면 **사람 경로만 조용히 빠진다.**
- **한 일**: `backend/db.py` SCHEMA · `backend/models.py`의 `Institution` 필드 ·
  `repository._row_to_institution`의 JSON 역직렬화(그리고 쓸모없어진 `json` import) 제거.
- **기존 DB의 컬럼은 지우지 않는다** — SQLite의 컬럼 삭제는 테이블 재작성이라
  반입된 실데이터를 건드리는 위험이 이득보다 크고, 남아 있어도 무해하다
  (`SELECT *`가 실어 와도 pydantic이 모델에 없는 키를 무시한다).
  회귀 테스트로 그 경로를 고정했고, 실제 `data/registry.db`(컬럼 있음)로 25건
  정상 조회를 실측했다.
- 테스트: pytest 730 → **731**.

### 7. ~~배점표 매핑 PII 집계의 근본 수정~~ — **완료** (2026-08-06)

- **출처**: `2026-08-04_summary.md` `## Session 23:20`(증상 수정) →
  `2026-08-06_summary.md` `## Session 12:xx`(근본 수정).
- **끝난 것 (증상, main `f92e0d8`)**: 화면에 틀린 값이 나오던 결함 2건.
  I1(`coverageSummary`의 팀당 max 휴리스틱) · I2(`SERVER_UNSAVABLE_FIELDS`로 기관명 잠금).
- **끝난 것 (근본, 2026-08-06)**: `coverage_map.json`을 **v2**로 바꿔
  `pii_count`를 항목마다 복제하지 않고 **`teams`에 팀당 한 번만** 저장한다.
  `{"version":2, "items":{…}, "teams":{"전산":{"pii_count":3}}}`.
  - **옛 파일은 고쳐 쓰지 않고 읽을 때 올린다**(`upload_check.load_coverage_map`) —
    이미 만들어진 산출물과 아카이브 사본이 그대로 열려야 한다. 값이 갈린 v1
    파일은 **큰 쪽**을 택한다(개인정보를 놓치는 방향이 더 위험하다).
  - API가 `teams: [{team, pii_count}]` + `pii_total`을 따로 준다. `criteria[]`에는
    PII를 싣지 않는다(실으면 읽는 쪽이 또 합산한다). **배점표에서 사라진 팀의
    stale 값은 응답에서 제외**해 유령 팀이 화면에 뜨지 않게 한다.
  - 화면: `max` 휴리스틱 제거. 표의 **개인정보 열을 없애고**(항목 단위 데이터가
    아니라 같은 값이 그 팀 모든 행에 반복돼 오해를 남긴다) 요약줄에
    `⚠️ 개인정보 — 전산팀 3건 · 예산팀 1건` 으로 팀별 표시(사용자 확정).
  - 빈 상태 응답도 `teams`·`pii_total` 키를 채워 보낸다 — 화면이 "있을 때/없을 때"로
    분기하지 않게 모양을 하나로 유지한다.
  - 테스트: pytest 721 → **730**, node 203 → **204**. 실행가이드 §업로드 즉시검사 갱신.

### 8. ~~LLM 폴백이 실제로 발동했는지 추적~~ — **완료** (2026-08-06)

- **출처**: `2026-08-05_summary.md` → `2026-08-06_summary.md` `## Session 15:xx`.
- **무엇이 문제였나**: `structured_llm()`은 1순위가 실패하면 `with_fallbacks`로
  **조용히** 2순위로 넘어가는데(스펙 §⑥의 의도된 설계), 기록에는 늘
  `current_model()`(= 쓰기로 한 1순위)이 남았다. 폴백이 도는 순간 **화면의 🧠 표시와
  실제로 답을 만든 모델이 어긋났다.**
- **NEXT.md가 예상한 것보다 작게 끝났다.** "호출 단위 컨텍스트를 노드까지 전달하는
  배선이 필요해 계획 하나 분량"이라고 적혀 있었지만, **콜백 + 스레드 로컬**로
  인자 배선 없이 해결했다(사용자 확정).
  - `agent/llm.py`의 `_ModelTracker`를 `get_llm()`이 **모델 이름을 묶어서** 단다.
    langchain이 주는 `serialized`/`invocation_params`는 래핑(구조화 출력·폴백)을
    거치며 모양이 달라져 신뢰하기 어려운데, 이 인스턴스가 어느 모델인지는 생성
    시점에 이미 확실하다.
  - `on_llm_end`에만 적는다 — `on_llm_start`는 실패한 1순위도 찍는다.
  - 기록부는 `reset_last_model()` → 작업 → `last_used_model() or current_model()`.
    **reset을 빠뜨리면 앞 노드의 모델명이 다음 기록에 붙는다**(회귀 테스트로 고정).
- **바꾼 기록 지점 5곳**: `subagents`의 rfi_agent·draft_team·verifier,
  `routers/tasks.py`의 업로드 즉시검사·작업 대화 스트림.
  ⚠️ 스트림은 **다른 스레드에서 돌 수 있어** `event_stream()` 안에서 reset한다.
  `backend/agent_adapter.py`의 실패 안내문은 그대로 `current_model()`을 쓴다 —
  그건 "무엇을 쓰려다 실패했나"를 설명하는 문구라 1순위가 맞다.
- 테스트: pytest 731 → **739**. 실행가이드 §LLM 절에 근거를 적었다.
- **남은 한 가지(비차단)**: 폴백이 실제로 도는 것을 **실호출로** 본 적은 없다
  (항목 5 — 엔드포인트 미검증). 단위 테스트로는 고정돼 있다.

~~**같은 묶음의 작은 후속들**~~ — **10건 전부 완료**(2026-08-05, `2026-08-05_summary.md`
`## Session 09:30`). 위 항목 8 본체(폴백 추적)는 **여전히 열려 있다** — 이 묶음은 그것과
별개로 defer돼 있던 값싼 것들이다. 무엇을 어떻게 고쳤는지는 실행가이드 §14와 각 파일
주석에 남겼고, 되짚을 필요가 있을 때만 아래를 본다:
- `reachable` → `?probe=1` 게이팅(기본 응답에서 **필드 자체를 생략**한다. `false`로
  채우면 "조회 안 함"이 "못 닿음"으로 보여 멀쩡한 엔드포인트가 죽은 것처럼 오진된다).
- `timeline`에 `m.model` 추가 → 스테퍼 단계 로그에도 🧠가 뜬다.
- 업로드 즉시검사·작업 대화 응답에 `model` 태깅.
- `verification_node`가 **`llm_used`를 돌려준다** — 호출부가 "LLM을 실제로 썼나"를
  바깥에서 추론하던 것(= 노드의 매칭 규칙 복제)을 없앴다. 이게 "배점표는 있는데 매칭
  섹션이 0건" 조합을 놓치던 원인이다.
- `model_info()`가 판정 때 본 설치 목록(`_auto_installed`)을 재사용 · 빈 배지 숨김 ·
  `X-Embed-Model` latin-1 위생 · `test_api_llm_status` 캐시 teardown · 가이드 3곳 교정.

### 11. ~~포트폴리오에 디자이너 전용 뷰 화면이 빠져 있다~~ — **완료** (2026-08-06)

- **출처**: `2026-08-05_summary.md` `## Session 13:39` → `2026-08-06_summary.md`.
- **범위가 커져 있었다**: 항목에는 "디자이너 뷰 1장"으로 적혀 있었지만, 그 사이
  계획 I가 **결재함·권한관리**까지 추가해 빠진 화면이 **3종**이었다. 사용자 확정으로
  3종 모두 넣었다.
- **한 일**: `portfolio/shots/`에 `19_작업함_디자이너.png`·`20_결재함.png`·
  `21_권한관리.png` 추가, `portfolio/index.html` PART 2에 카드 3장(09·10·11) 추가하고
  뒤 카드를 12~18로 밀었다. 표지 KPI와 TECH 표의 테스트 수치를
  **731 / 204 (커밋 `9991897` 기준)** 로 갱신.
- **캡처 절차(다음에 또 필요할 때)**: Playwright는 **저장소가 아니라 scratchpad에**
  설치한다(리포는 무빌드·무의존 유지). `chromium.launch({channel:'msedge'})`라
  브라우저 내려받기가 필요 없다. 계정 전환은 클릭 대신
  `localStorage.setItem('tbd.profile', …)` + reload로 심으면 전환기 드롭다운이
  캡처에 안 걸린다.
  - ⚠️ **크롭 요령**: 뷰포트를 그대로 찍으면 아래가 빈 검은 화면으로 남는다.
    활성 탭의 **잎 노드**들만 골라 바닥을 재야 한다 — 작업함처럼 좌우 2단인 화면은
    바깥 컨테이너가 화면 높이를 꽉 채우게 잡혀 있어서, 컨테이너를 재면 콘텐츠와
    무관하게 늘 뷰포트 높이가 나온다(실제로 이 함정에 두 번 걸렸다).
  - ⚠️ 작업함은 **작업 카드를 클릭해야** 오른쪽 이관 패키지가 펴진다. 안 누르면
    "왼쪽에서 작업을 고르세요."만 찍힌다.

### 12. ~~프로필 소속·직책 두 칸 UI — DOM 이벤트 동작만 남음~~ — **완료** (2026-08-06)

- **출처**: `2026-08-05_summary.md` `## Session 18:17` → `2026-08-06_summary.md`
  `## Session 09:54`(범위 축소).
- **무엇인가**: 상단바 프로필이 **소속(3그룹) + 직책** 두 개의 `<select>`로 바뀌었다
  (`dashboard/index.html`의 `#me-team`·`#me-pos`). 배선은 `dashboard/js/app.js`의
  `showRole`/`paintPositions`/`readRole`/`dropLegacyOptions`.
- **2026-08-06에 정적으로 검증 끝난 것(다시 안 해도 된다)**:
  - 서빙되는 HTML에 두 `<select>`가 실제로 있고 소속 option이 3개다.
  - `roles.js`가 `app.js`보다 먼저 로드된다(스크립트 순서).
  - 화면이 내릴 판단 전부 — `positionsFor`(전산팀=팀원/팀장, 영업팀=+디자이너/부장),
    `split`(`디자이너`→영업팀/디자이너, `전산팀장`→전산팀/팀장, `본부장`→null=값 그대로),
    `compose`. `roles.test.js` 7건 + node 203 pass.
  - **이 과정에서 실제 결함 1건을 찾아 고쳤다**(커밋 `c9fdfd8`): 옛 소속(`본부장`)에서
    정상 소속으로 옮겨도 그 임시 항목이 목록에 남아 다시 고를 수 있었다.
- ✅ **2026-08-06 브라우저 검증 완료 — 4건 전부 통과**(출처: `2026-08-06_summary.md`).
  Chrome 확장 도구가 붙은 세션에서 데모 서버(`py -3.14 -m backend.demo`)를 띄우고
  실제 `change` 이벤트를 발생시켜 확인했다:
  1. 소속 변경 → 직책 목록 재생성 ✅ (`영업팀`=팀원/디자이너/팀장/부장 4개,
     `전산팀`·`예산팀`=팀원/팀장 2개)
  2. 계정 전환기 `최 디자이너` → 이름·소속(`영업팀`)·직책(`디자이너`)이 함께 맞춰짐 ✅
  3. 옛 프로필 `본부장` → 소속 칸에 `data-legacy`로 뜨고 직책 칸 숨김, 정상 소속을
     고르면 그 항목이 목록에서 사라짐 ✅ (커밋 `c9fdfd8`의 수정이 실제로 동작)
  4. `영업팀 + 부장` → **전국지도·대화·결재함 셋만** ✅ (기대와 정확히 일치)
- 🐞 **이 검증에서 결함 1건을 새로 발견하고 고쳤다** — 소속과 직책을 **연달아 빠르게**
  바꾸면 탭 구성이 **틀린 역할로 고정**된다. `applyMenuPermissions`가 호출 시점의
  역할로 `/menus`를 조회하는데 **응답 순서를 보장하지 않아서**, 먼저 나간 요청의
  응답이 나중에 도착하면 옛 역할의 메뉴가 최종 화면이 되고 **다음 프로필 변경 전까지
  그대로 남았다.** 역할에 없는 탭이 열린 채 남으므로 `visibleTabs`의 "권한을 모를 때는
  닫는 쪽으로 기운다" 원칙과도 어긋났다.
  - **실측**: 같은 시나리오 10회 반복 — 수정 전 **3/10 불일치**, 수정 후 **0/10**.
  - **고친 방법**: `menu_rules.js`에 순수 함수 `latestGuard()`(요청 번호를 붙여 더 새
    응답을 이미 칠했으면 옛 응답을 버린다)를 두고 `app.js`가 성공·실패 두 경로 모두
    그 문을 지나게 했다. 실패 경로도 막은 이유는, 늦게 도착한 실패가 새 역할의 정상
    화면을 덮어 탭을 전부 닫아버리기 때문이다. `menus.test.js` +4건(node 204 → 208).
  - ⚠️ **브라우저 캐시 주의**: 새로고침만으로는 옛 JS가 그대로 돈다. 검증 전에
    `fetch('/js/app.js', {cache:'reload'})`로 캐시를 갱신하고 새로고침할 것 —
    이걸 안 해서 "고쳤는데 그대로 재현"으로 한 번 오판할 뻔했다.

---

### 13. ~~배점표 스키마에 계층이 없다~~ — **완료(ⓐ안 구현)** (2026-08-10)

- **해소 기록** (출처: `2026-08-10_summary.md` 해당 세션 섹션): 사용자 결정
  **ⓐ(스키마 계층) + 선행 측정(qwen3.5:4b) 생략**(이 PC에 모델이 없어 3.4GB
  다운로드가 필요했고, 8/10 실측의 9b 산출 구조가 기록에 있어 픽스처로 재현 가능).
  스펙: `docs/superpowers/specs/2026-08-10-scoring-schema-hierarchy-design.md`.
  - `ScoringCriterion.level`(선택적, 1=계/2=대분류/3=세부/None=단층) 추가 —
    기존 파일·rfp-locate 사람 경로 그대로 유효(SKILL.md도 같은 커밋에서 갱신).
  - `scoring_consistency()` 레벨 그룹별 합산 — 어느 한 그룹이라도 총점과 일치하면
    통과. 9b 실측 구조(계+대분류+세부, 합 300) 픽스처가 **이제 통과**하고,
    8/04 실측(96·108)은 여전히 잡힌다. 평면 파일은 그룹 하나라 동작·메시지 불변.
  - `main_criteria()` 헬퍼 — 상태 주입 두 곳(rfp_extract_node·rfp_analysis)에서
    대표 레벨만 하류로: '계' 행 제안 섹션·중복 매칭 방지. 하류 노드·화면·API 무수정.
  - pytest 745 → **759**(+14).
- **남은 것 없음.** 배점표 매핑 화면의 계층 표시(들여쓰기)는 스펙 §⑦ 범위 밖으로
  기록만 — 계층 데이터가 실제로 쌓이면 화면 보고 판단.

<details><summary>원래 항목 내용 (해소 전 기록)</summary>

- **출처**: `2026-08-10_summary.md`. 항목 5의 배점표 대조 실측에서 드러났다.
- **무엇이 문제인가**: `agent/nodes/rfp_extract.py`의 `ScoringCriterion`은
  `category/item/score/description` **평면 구조**다. 그런데 공고문 배점표는
  **`계` → `대분류` → `세부항목`** 3단 계층이다. `qwen3.5:9b`가 이 표를 정확히 읽어
  세 단계를 모두 담았더니 **합계가 300**(=100×3)이 됐다. 값은 전부 맞는데
  **구조를 표현할 자리가 없어서** 합계가 무의미해진 것이다.
- **왜 지금 중요해졌나**: 이 문제는 모델이 나빴을 때는 안 보였다. 예전 모델들은
  숫자 자체를 틀렸기 때문에 "모델 탓"으로 설명이 됐다. **정답을 맞히는 모델이
  생기고 나서야 스키마가 병목임이 드러났다.**
- ⚠️ **부작용 — `scoring_consistency()`가 오탐을 낸다.** 이 규칙은 `sum(criteria.score)
  != total_score`를 경고하는데, 위 산출물(300 ≠ 100)은 **추출이 정확한데도 잡힌다.**
  이 저장소는 "경고가 한 번이라도 틀리면 그 다음부터 아무도 안 읽는다"를 원칙으로
  적어뒀고(`agent/nodes/rfp_extract.py`의 docstring, `backend/consistency.py`),
  **이것이 그 원칙에 걸리는 첫 확인 사례**다.
- **고치려면(미착수, 설계 필요)**: 대략 두 갈래이고 어느 쪽인지 먼저 정해야 한다.
  - ⓐ **스키마에 계층을 넣는다** — `ScoringCriterion`에 `level`(계/대분류/세부) 또는
    `parent` 추가. `scoring_consistency()`는 **같은 레벨끼리만** 합산해 비교한다.
    산출물 소비처(`rfp_scoring.json`, `coverage-map`, 배점표 매핑 화면)가 함께 바뀐다.
  - ⓑ **프롬프트로 레벨을 하나로 못박는다** — "대분류 단위로만 뽑아라". 코드 변경이
    작지만, 세부항목 정보를 버리게 되고 공고문마다 계층 깊이가 달라 불안정할 수 있다.
- **착수 전 확인**: `qwen3.5:4b`의 temp 0 측정이 아직 없다(항목 5 표의 빈칸).
  계층 문제가 특정 모델에서만 나오는지 확인하면 설계 판단이 쉬워진다.

</details>

### 15. ~~대시보드 리디자인 후속 소소 2건~~ — **완료(항목 전체 종결)** (2026-08-18)

- **해소 기록** (출처: `2026-08-18_summary.md`). 아래 "남은 소소 항목" 2건이 모두
  끝나 이 항목에 남은 것이 없다.
  - **1(색 리터럴 재도색) — 완료**: main `2a0848e`(2026-08-14, push됨). 클러스터
    배지·geo-retry 배너의 `#2a3550`/`#e6ecff`를 **현행 토큰 `#1a2029`/`#e2e7ee`**로
    교체했다. ⚠️ 아래 원문이 교체 목표로 적어둔 `#131a24`/`#dbe4ee`는 **HTS 시절
    토큰이라 이제 틀린 값**이다 — 그 사이 7.1(다크 크롬+파스텔) 정본 승격으로
    팔레트가 바뀌었기 때문. 2026-08-18에 `grep -rn '2a3550\|e6ecff' dashboard/js
    dashboard/index.html` **0건**으로 잔재 없음을 재확인했다(비교 파일 `index_*.html`
    제외). 같은 커밋에서 라벨 헤일로·부제·랭킹 호버 3색은 출하 의도값으로
    `.impeccable/config.json`에 사유와 함께 ignore 등록.
  - **2(서버 모드 6탭 육안 확인) — 완료**: 워크플로·대화·지식·작업함·결재함 **5개는
    2026-08-14 Session 16:20**에 확인됐고(그 확인에서 나온 수정이 `53c9cb8` 대화
    보내기 버튼 가시성), **남아 있던 `권한관리` 1개를 2026-08-18에 확인**했다 —
    `py -3.14 -m backend.demo`(:8000) + Chrome. 결과: 다크 크롬·틸 토큰 일관,
    깨짐 없음, 콘솔 오류 0건. 체크박스 `accent-color`가 정본 틸
    `rgb(87,184,173)`로 실제 적용된 것까지 확인.
  - ⚠️ **확인 중 오판할 뻔한 것(다음에 같은 착각 말 것)**: 권한관리 탭이 활성인데
    상단 탭바에 안 보여 "오버플로우 잘림"으로 의심했으나, `display:none`이었고
    **권한 규칙대로의 정상 동작**이다(영업팀 팀원은 결재함·권한관리 없음 — 화면의
    권한표와 일치). 숨은 탭을 JS로 강제 클릭한 내 조작이 만든 상태였다.
    **권한 있는 역할(전산팀)로 전환해서 볼 것.**
- **새로 발견한 것은 아래 항목 16으로 분리**(폼 컨트롤 `color-scheme` — 이 항목의
  범위였던 "6탭 훑기"가 아니라 정본 전역 시각 변경이라 별건).

<details><summary>원래 항목 내용 (해소 전 기록)</summary>

- 출처: `2026-08-13_summary.md` `## Session 14:13`.
- 완료: impeccable 절차 전체 — PRODUCT.md·DESIGN.md 신규, 방향은 결정 페이지에서
  사용자가 **HTS 터미널**(seed 6d3737b9, degraded roll·code-led) 직접 선택,
  마감 리뷰 2라운드 후 **ship** 판정. `dashboard/index.html` 전면 재작성(구판 백업
  `index_1.0_backup.html`), `render.js`는 기본 팔레트·글리프(SVG)·티커만 변경.
  테스트 243/243 유지. 훅 검출은 전부 사유와 함께 `.impeccable/config.json`에
  ignore 등록(플랫 타입 스케일 1건 + 팔레트 외 리터럴 7색).
- 남은 소소 항목(전부 비차단):
  1. `render.js` 클러스터 배지(`#2a3550`/`#e6ecff`)·geo-retry 배너(`#e6ecff`)
     색 리터럴이 구 팔레트 잔재 — DESIGN.md에 "비정본 결함"으로 기록돼 있다.
     토큰 값(`#131a24`/`#dbe4ee`)으로 교체만 하면 끝.
  2. 서버 모드 전용 6개 탭(워크플로·대화·지식·작업함·결재함·권한관리)은 CSS만
     리디자인됨 — backend를 띄운 육안 확인은 미수행. 다음에 서버 모드 작업할 때
     같이 훑으면 된다.
- 참고: 같은 날 다른 세션 summary의 "디자인 훅 경고 ignore 승인 보류" 건은 이
  세션 등록분과 **별개 건**이다(이 세션 분은 등록 완료).
- ~~[2026-08-14] 시각 방향 재논의~~ — **해소(2026-08-14, `2026-08-14_summary.md`
  `## Session 16:20`)**: 피드백("밝으면 지도가 죽는다")에서 **다크 크롬+파스텔
  지도** 방향 도출, 하이브리드 3종 중 사용자가 7.1(taste-redesign) 선택 →
  정본 승격, 마감 리뷰 ship, DESIGN.md 재기록. 7.x 실험 파일은 삭제(내용은
  정본에 흡수), 1.0~6.0 비교 파일·ignoreFiles 등록은 히스토리로 유지.

</details>

### 16. ~~폼 컨트롤이 다크 크롬에서 라이트로 그려진다~~ — **완료** (2026-08-18)

- **해소 기록** (출처: `2026-08-18_summary.md`, 발견과 같은 세션에서 사용자 승인 후
  즉시 수정): `dashboard/index.html`의 `:root`에 **`color-scheme:dark` 한 줄** 추가
  (사유 주석 포함) + `DESIGN.md` §Inputs/Fields에 "UA-drawn controls" 규칙 기록.
  - **실측 확인**: 수정 후 `documentElement`·체크박스 모두 `colorScheme:"dark"`,
    `accentColor`는 정본 틸 `rgb(87,184,173)` 유지. 권한관리 표의 언체크 상자가
    흰색 → 다크 회색으로 바뀌어 다크 바탕에서 튀지 않는다.
  - **회귀 확인**: 전국 지도(파스텔 지도·범례 정상) · 대화 탭(입력창·틸 보내기
    버튼 정상) 육안 확인, 콘솔 오류 0건, `node --test dashboard/test/*.test.js`
    **244/244**, impeccable 훅 검출 0건.
  - 라이트 계열 비교 파일(`index_4.0/5.0/6.0`)에는 **넣지 않았다** — 라이트가 의도.
- ⚠️ **1회 관측 후 재현 실패한 현상 (결함으로 기록하지 않는다)**: 확인 도중 "서버
  탭 → 전국 지도 복귀 시 지도가 빈 화면"을 **한 번** 봤으나, 같은 시퀀스를 2회
  반복해도 재현되지 않았다(`svg path` 22개 정상 렌더). 페이지 초기 로드가 끝나기
  전에 계정 전환·탭 클릭을 연달아 밀어 넣은 **조작 타이밍의 산물**로 판단했다.
  `color-scheme`과는 무관하다(SVG 렌더 경로에 영향 없음). 다음에 같은 것을 보면
  그때는 실제 결함일 수 있으니 **로드 완료 후 조작**으로 다시 재현해 볼 것.

<details><summary>원래 항목 내용 (해소 전 기록)</summary>

- **출처**: `2026-08-18_summary.md`. 항목 15의 권한관리 탭 육안 확인 중 발견.
- **무엇인가**: 정본 크롬은 다크인데 `color-scheme`이 **`normal`(=라이트)** 이라,
  브라우저가 기본 폼 컨트롤을 라이트로 그린다. 실측(2026-08-18, 권한관리 탭
  `<input type=checkbox>`): `accentColor`는 정본 틸 `rgb(87,184,173)`로 **정상
  적용**돼 체크된 상자는 틸이지만, **언체크 상자는 흰색**이라 다크 배경에서 튄다.
  `documentElement`·`body`·컨트롤 셋 다 `color-scheme: normal`.
  - 같은 원인의 영향 범위: 권한관리 표의 체크박스 8행 × 8열, 상단 `기관 분류선택`
    체크박스, 그리고 스크롤바 등 브라우저가 그리는 나머지 기본 UI.
  - `<select>`(소속·직책·계정 전환)는 CSS로 직접 칠해져 있어 **이미 다크로 보인다**
    — 즉 증상은 "스타일 안 된 기본 컨트롤"에만 나온다.
- **고치려면**: `:root`에 `color-scheme: dark` 한 줄. 다만 **정본 전역 시각 변경**이라
  ⓐ 사용자 확인과 ⓑ DESIGN.md 반영이 필요하고, 라이트 계열 비교 파일
  (`index_4.0_promax.html`·`5.0`·`6.0`)에는 **넣으면 안 된다**(그 파일들은 라이트가
  의도다). 훅 검출에 걸리는지도 함께 볼 것.
- **왜 지금 안 고쳤나**: 항목 15의 범위는 "6탭 육안 확인"까지였고, 이 수정은 그
  범위 밖의 새 시각 결정이라 사용자 판단으로 넘겼다. **비차단** — 기능 영향 없음.

</details>

### 18. ~~uploader — README §13-①(내부망 설정 누락 + Oracle DDL 부재)~~ — **완료** (2026-09-08)

- ✅ **2026-09-08 해소.** `git checkout main -- uploader/` 로 `main`의 uploader 를
  브랜치 `weblogic-java-migration` 에 가져오면서 두 항목이 함께 사라졌다
  (26파일 · 2200줄 추가 / 60줄 삭제, `mvn -o clean test` **62건 통과**).
  - **Oracle DDL** — `schema-oracle.sql` 이 들어왔다(테이블 2 + 시퀀스 2).
    Mapper 도 주석이 아니라 `databaseId` **방언 분기**로 바뀌었다(`43dc186`).
  - **`mybatis.*` 누락** — `config-envs` 의 `dev`/`stg`/`prod` 에 3줄이 모두 들어왔다.
  - ⚠️ 함께 있던 경고(`ReclassificationJob` 이 `@Scheduled` 로 자기 스레드를 만든다)도
    해소됐다 — `TimerManagerScheduler`/`LocalScheduler`/`ReclassificationTrigger` 로
    교체돼 CommonJ 경로가 들어와 있다. **다만 운영에서 켜는 것은 항목 25-② 로 남아 있다.**
  - 출처: `2026-09-08_summary.md` `## Session 08:55`. 앞선 진단은
    `2026-09-07_summary.md` `## Session 18:32`.
- **원 출처**: `2026-08-26_summary.md` `## Session 13:00`. 브랜치 `weblogic-java-migration`.
- **무엇이 남았나** — `uploader/README.md` §13의 마지막 열린 항목이다(②③은 해소됨):
  - `config-envs/`의 **`dev`/`stg`/`prod`에 `mybatis.*` 설정이 없다**
    (`mapper-locations`·`type-aliases-package`·`map-underscore-to-camel-case`).
    `local`·`out-local`에만 있다. 내부망 배포 시 Mapper 미탐색 가능성.
    **의도된 것인지 사용자에게 확인이 필요하다** — 내부망에서 별도 방식으로 주입한다면
    그대로 두면 된다.
  - **uploader에 Oracle DDL이 없다** — `schema-mysql.sql` 한 벌뿐이다.
    `kgi-ggreport-web`은 2벌을 갖췄으므로 같은 방식으로 만들면 된다
    (`kgi-ggreport-web/src/main/resources/db/README.md`의 타입 대응표를 그대로 쓸 것).
- **비차단**: uploader를 내부망에 올릴 때 필요하다 — **항목 17(단계 6)이 먼저다.**
- ⚠️ **함께 볼 것**: `ReclassificationJob`이 Spring `@Scheduled`로 **자기 스레드를
  만든다.** WAS 배포 표준에 어긋나므로(설계 §2·§4) 내부망에 올리기 전에 CommonJ
  WorkManager 경로로 옮기거나 꺼야 한다. `uploader/README.md` §10에 경고로 적어 뒀다.

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

- ~~리포지토리 재구성 — 남은 것은 ⑦단계뿐~~ (구 항목 2) — `2026-08-21_summary.md`
  `## Session 16:40`에서 **⑦단계 실행으로 전 단계 종결**. 커밋 **`2fefca0`**
  (177 files, git이 rename 149건 인식 → `git log --follow` 유지).
  `backend/`→`server/` · `dashboard/`→`frontend/` ·
  `docs/실행가이드_server-agent.md`→`_server-agent.md`.
  스펙 `2026-08-20-final-rename-design.md` §⑥의 8단계를 그대로 따랐고, §⑦ 검증을
  전부 통과했다 — pytest **759**·node **262**(둘 다 기준선 유지), import 잔여 **0**,
  **golden 스냅샷 34건 재캡처 diff 0**, 실기동 시 정적·API 전부 200.
  재구성 스펙 §⑤의 `web/` 표기에는 `frontend/` 확정을 갱신 블록으로 남겼다(§⑥-6).
  ⚠️ 다시 비슷한 일괄 개명을 할 세션을 위한 함정 3가지는 커밋 메시지에 적어 뒀다
  (`args.backend` 파손 · `__pycache__` 잔존 · mermaid `\n` 이스케이프).

- ~~결재함·작업함 카드 본문이 고정 높이에 잘린다~~ (구 항목 17) —
  `2026-08-21_summary.md` `## Session 10:05`에서 종결. 커밋 **`b78e5f2`**.
  원인이 둘이었다: ⓐ`.dg-body`에 클램프만 있고 잘렸다는 신호가 없었다
  ⓑ**결재함(`approvals.js`)은 토글 배선 자체가 없었다** — 작업함(`designer.js`)은
  원래 클릭하면 펴졌고 신호만 없었으므로, NEXT.md가 적어 둔 "공통 원인" 추정은
  절반만 맞았다. 사용자 선택 ⓐ안(클램프 유지 + 신호 추가)으로,
  `designer.wireBodyToggles(container)` 공통 함수가 **실제로 넘칠 때만** `.clamped`를
  붙이고 그때만 페이드와 `⌄ 더 보기`/`⌃ 접기`를 띄운다. 변형본 6개는 사용자
  지시로 그대로 뒀다(정본 `dashboard/index.html`만 수정). 캡처 19·20도 재촬영해
  교체했다.

- ~~impeccable 훅이 `portfolio/index.html`에 28건을 계속 올린다~~ (구 항목 18) —
  `2026-08-21_summary.md` `## Session 10:05`에서 종결. 커밋 **`b78e5f2`**.
  `npx impeccable detect` 실측은 **33건**이었다(훅은 5건씩 끊어 보고해 28건으로
  보였다). 사용자 확정 ⓐ안 + kicker·radius까지: side-tab 2건·kicker 2건·radius
  1건은 **고쳤고**, 색 21·폰트 6건은 `portfolio/index.html` **파일 한정 value
  예외**로 등록했다(`ignore-file`/`ignore-rule`은 쓰지 않았다). 검출 **0건**.

- ~~corpus-validation 브랜치·워크트리 잔여 정리~~ — `2026-07-30_summary.md`
  `## Session 01:00`에서 종결. 세션 시작 시 "최종 리뷰가 남아 있다"는 인식이
  **틀렸음을 확인**했다: 이전 세션이 이미 최종 리뷰까지 마치고 `--no-ff`로 main에
  병합(`c7ba0c7`)했으며, 리뷰에서 나온 fix 커밋 `a8e14fd`(비UTF-8 파일 크래시 +
  규칙 9 중복 보고)도 포함돼 있었다. `git merge-base --is-ancestor
  origin/worktree-corpus-validation main` → fully merged. 그 위로 재구성 ①~⑥과
  sub-project 1까지 쌓여 있어 PR은 불필요했다. `finishing-a-development-branch`의
  정리 단계만 수행 — main 178 passed 확인 후 워크트리 제거 + `git worktree prune`
  + 로컬 브랜치 `git branch -d` + 원격 `git push origin --delete`.
  **교훈**: 여러 PC·세션이 같은 브랜치를 미는 리포이므로, 착수 전 `git pull` +
  실제 git 상태 조사를 먼저 할 것(이번엔 그 덕에 불필요한 리뷰·PR을 피했다).

- ~~빈 워크트리 디렉터리 `.claude/worktrees/institution-intelligence-agent/` 정리~~
  (구 항목 2) — `2026-07-29_summary.md` `## Session 15:51`에서 **확인 결과 이미
  존재하지 않아 종결**. 이 PC에서 `.claude/worktrees` 디렉터리 자체가 없고
  (`ls` 실패), `git worktree list`도 메인 리포 하나만 반환한다. 과거
  `skill-essential` 잔해와 같은 경로(Windows 파일 잠금이 풀리며 자연 정리)로
  보인다. 별도 조치 불필요.

- ~~main 미push 커밋 — GitHub 인증이 세션에 없어 push 차단~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 13:38` 직후 해소. **사용자가 세션 안에서
  `! git push origin main worktree-corpus-validation`을 직접 실행**해 인증과 함께
  push 완료(`b91b081..8c5225f main`, `8d94f88..a8e14fd worktree-corpus-validation`).
  `git rev-list --left-right --count origin/main...main` = `0 0` 검증됨.

- ~~corpus-validation 워크트리 — main 병합만 남음 (최우선)~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 11:14`에서 해소. 전체 브랜치 최종 리뷰 수행 →
  Minor 2건 발견(비UTF-8 파일이 plan/01 등 특정 위치에 있으면 규칙9 보고 대신 크래시,
  규칙9 중복 보고) → fix 커밋 `a8e14fd`를 브랜치에 얹고(148 passed 재확인)
  `--no-ff`로 main 병합(`c7ba0c7`). 병합 후 main에서 **148 passed**.
  이 병합으로 재구성 §⑦ ④단계(giganlist 이동)의 게이트가 풀림.
  워크트리는 다른 PC에 있어 이 PC에서는 원격 브랜치 기준으로 작업했다
  (`git branch worktree-corpus-validation origin/...`으로 로컬 브랜치 생성).
  **주의: fix 커밋 `a8e14fd`와 main 병합은 아직 미push**(현 항목 1 참조) — 다른 PC
  워크트리에서 이어 작업하기 전에 push·fetch 동기화 필요.

- ~~병합 완료된 브랜치 2개 삭제 여부~~ (구 항목 1) — `2026-07-29_summary.md`
  `## Session 08:05`에서 **사용자 승인 후 둘 다 삭제 완료**.
  로컬 `feat/stage7-assembler`(`784b496`) → `git branch -d`로 삭제(완전 병합 확인됨).
  원격 `origin/feature/treasury-bid-dashboard`(`464f906`) → `464f906`이 `origin/main`의
  조상임을 `git merge-base --is-ancestor`로 검증한 뒤 `git push origin --delete`.
  삭제 후 `git ls-remote --heads origin`에 남은 원격 브랜치는 `main`과
  `subagent-init-archi` 2개뿐이며, 후자는 새 항목 1로 이월했다.

- ~~`main`의 미push 커밋 5개 — 다른 세션 작업 종료 후 push~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 07:59`에서 해소. **다른 세션이 push를 완료**해
  `git rev-list --left-right --count origin/main...main` = `0 0`(완전 동기화)이 됐다.
  이 세션이 만든 커밋 `1f9bcfe`(7단계 취합)·`5b45ac7`(handoff)가 `origin/main`에
  포함됨을 `git merge-base --is-ancestor`로 개별 검증했다. 함께 적혀 있던 로컬 브랜치
  `feat/stage7-assembler` 삭제 건은 미결이라 **현 항목 1로 이관**해 원격 브랜치 삭제
  건과 합쳤다.

- ~~`agent/` RFP 팀 확장 구현 — Task 3(`spec_research_node`)부터 재개~~ (구 항목 1) —
  `2026-07-29_summary.md` `## Session 00:29`에서 **"폐기"로 종결**. 두 가지 이유:
  ① 같은 날 main에 들어온
  `docs/superpowers/specs/2026-07-29-institution-corpus-validation-design.md`가
  `spec_research_node` 구상을 **명시적으로 폐기**했다 — 조사는 DMZ에서 사람이 수행하고,
  시스템은 `backend/corpus_validator.py`의 기계 검증 + 반입 API 2개 +
  `research_status` Task 게이트만 담당하는 것으로 방향이 확정됐다(자동 조사 노드를
  만들지 않는다). ② 이어받을 워크트리 브랜치 `worktree-rfp-agent-team`과 커밋
  `1504d8e`(`run_subagent`)·`0e759e7`(`rfp_locate_node`)가 **로컬·원격 어디에도 없다**
  (2026-07-29 확인: 브랜치 없음, dangling 커밋 79개 전수 조회에도 없음). 재개할 실물이
  없으므로 "진행 중"으로 남길 수 없다.
  **남는 필요**: ③단계 `rfp_locate_node`(공고문 자동 탐색) 자체는 여전히 미구현이지만,
  이제 이 항목이 아니라 상위 E2E 스펙 sub-project 3의 몫이다. 현재는
  `.claude/skills/rfp-locate`로 사람이 수행한다.


- ~~`dashboard/` 금고은행 입찰 히트맵 — 애니메이션 체감 육안 확인~~ (구 항목 2) —
  `2026-07-28_summary.md` `## Session 23:52`에서 해소. 사용자가 포그라운드 탭에서 체감을
  확인했고("0.4초는 마음에 든다"), 그 과정에서 나온 UI 피드백을 3라운드로 반영해 **main에
  커밋·push 완료**: `c5b03d6`(파스텔 팔레트·구 단위 지자체 색칠·지자체 외곽선 깜빡임·
  랭킹 카드 흰 테두리 누적 버그 수정·`🎨 지도 색상` 설정), `be194ee`(라벨 헤일로·라벨
  겹침 해소·범례를 지도 우하단으로+테마 연동·드릴인 0.4초 멈춤), `4909a11`(지도를 덮는
  큰 지역명 오버레이 제거). 테스트 `node --test dashboard/test/*.test.js` **36/36 통과**,
  콘솔 오류 0건. 원격 브랜치 삭제 건만 위 항목 2로 분리해 이월함.

- ~~`finalize` 엔드포인트에 호출자 신원(`X-User-Id`) 미수집~~ (구 항목 3) —
  같은 날 `2026-07-28_summary.md` `## Session 21:30` 후반부에서 **사용자가 선택지 ①을
  승인해 즉시 해소**(커밋 `189bee0`, main push 완료). `bid_cases`에 `finalized_by`/
  `finalized_at` 컬럼 추가, `BidCase` 모델·`record_finalization()` 리포지토리 함수 추가,
  finalize가 `x_user_id: str = Header(...)`를 요구하도록 변경(승인·반려 양쪽 다 기록).
  기존 `registry.db`는 `CREATE TABLE IF NOT EXISTS`라 컬럼이 자동으로 안 붙어
  **사용자 승인 하에 삭제 후 재시드**함(gitignored라 리포지토리 영향 없음). 신규 테스트
  4건 + 기존 finalize 테스트 3건에 헤더 추가 → **66/66 통과**. 스펙 §③ 데이터모델 표에도
  두 컬럼과 "왜 이력 배열이 아니라 단일 컬럼인지"의 근거를 반영함.

- ~~E2E 입찰워크플로우 시스템 — sub-project 0(레지스트리 & 기관 API) 구현~~ (구 항목 3) —
  `2026-07-27_summary.md` `## Session 22:33`에서 해소: `superpowers:subagent-driven-development`로
  `docs/superpowers/plans/2026-07-26-registry-institutions-api.md`의 5개 Task를 전부
  구현·개별 리뷰(clean, Task 4 fix 1건 사용자 승인 후 반영)·최종 전체 브랜치 리뷰(opus,
  Important 4건+테스트 공백 1건+gitignore 발견 → 1개 fix wave로 전부 수정·재리뷰 clean)까지
  마치고 `main`에 로컬 병합(`d3533cb`, 20/20 테스트 통과). 계획서의
  `GIGANLIST_DISTRICT_NAMES`가 23개구로 stale했던 것을 사용자 승인받아 송파+강동 2건
  추가(25개)하는 편차를 뒀는데, 이 결정이 세션 도중 발견된 동시성 이슈(다른 세션이
  강동구 배치를 같은 시간대에 완결시킴, 커밋 `bce1a09`)를 데이터 유실 없이 흡수함 —
  병합 후 `giganlist/` 25개 폴더·`GIGANLIST_DISTRICT_NAMES` 25개 항목 모두 확인됨.
  워크트리(`registry-institutions-api`)·브랜치 정리 완료. sub-project 1(DMZ FastAPI)부터는
  스펙(`docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`) §⑧
  로드맵대로 별도 세션에서 계획부터 새로 시작해야 함(아직 계획 없음).
- ~~**25개 자치구 배치 프로젝트 (20/20 완결)**~~ (구 항목 1) — `2026-07-27_summary.md`
  `## Session 01:39`(송파) + `## Session 07:27`(강동)에서 마지막 2건을 1건씩 순차
  디스패치해 **완결**. `giganlist/` 폴더 **25개 도달**(원본 5개구 + 배치 20개구).
  최종 신뢰도: 종로78 중구77 용산76 성동76 중랑81 성북76 은평74 강북72 서대문73 마포80
  양천84 강서80 구로84 금천84 영등포81 관악81 서초84 강남79 **송파69 강동71**.
  (원본 5개구는 도봉74 노원88 광진88 동대문82 동작84.)
  **배치 전체 최저는 송파 69** — 인용 오류 0건인데도 낮은 이유는 조사 부실이 아니라
  송파구 공개 범위의 한계이며, 문장 수정으로는 올릴 수 없다고 plan/05에 명시돼 있으니
  **재작업을 지시하지 말 것**(새 조사만이 답).
  **후속 세션이 알아야 할 축적된 교훈**: ①1건씩 순차 디스패치가 안정적(4-parallel/
  20-parallel 전체 동시 디스패치는 세션 한도 초과로 전멸한 이력 2건) ②프롬프트에 "파일
  하나 완성할 때마다 즉시 디스크에 쓰라"를 넣으면 중단 복구 비용이 크게 준다 ③중단 시엔
  새 에이전트를 띄우지 말고 `SendMessage`로 transcript 재개 + 디스크 실제 상태(이미 생성된
  파일 목록) 명시 ④**"경쟁 금융기관 기존 진입 여부 확인" 지시가 가장 값진 발견을 만든다**
  (송파·강동 모두 경쟁사 기진입을 찾아내 제안 프레임을 바꿈) ⑤다른 지자체(서울시 등) 수치를
  구 값으로 전용하는 실수가 반복되므로 프롬프트에 금지를 명시할 것 ⑥에이전트 최종 보고
  수치가 파일과 다를 수 있으니(송파: 아이디어 11건을 9건으로 오보고) **컨트롤러가 직접
  grep 대조 검증할 것**. 규격은 `institution-corpus-format` 스킬 참고.
- ~~산출물 본문 내 `bank_idea_draft.txt`(단수형) 자기참조 3곳~~ (구 항목 3) —
  `2026-07-27_summary.md` `## Session 07:27`에서 해소. 이 항목의 재개 조건이 "25개구 배치
  완료 후"였는데 같은 세션에서 배치가 완결되어 조건이 충족됨. `giganlist/gangbuk/plan/00`
  (91줄), `giganlist/gangbuk/plan/04`(92줄), `giganlist/yongsan/spec/05`(93줄) 3곳을
  복수형으로 정정하고 `grep -rn "bank_idea_draft\.txt" giganlist/` **0건**으로 검증 완료.

- ~~`main`의 미push 커밋 5개 — push 여부 사용자 판단 대기~~ (구 항목 5) —
  `2026-07-27_summary.md`에서 해소 확인: `git rev-list --left-right --count
  origin/main...main` = `0 0`(완전 동기화), `git merge-base --is-ancestor`로 강남 커밋
  `a6d2896`·dashboard 커밋 `0450831` 둘 다 `origin/main`에 포함됨을 검증.
  **다른 세션이 이미 push를 완료**한 것으로 보임(당시 origin/main HEAD = `f1e8cf8`).
  이 항목에 함께 적혀 있던 "커밋 전 `git branch --show-current` 확인" 주의사항은 여전히
  유효하므로 **항목 1로 이관해 보존**함. 이 해소로 이후 항목 번호가 하나씩 당겨짐
  (구 6 → 현 5).
- ~~브레인스토밍 재진입해 agent/ 패키지 스펙 확정~~ — `2026-07-20_1620_summary.md`에서
  스펙 작성 및 계획(`2026-07-20-rfp-proposal-agent.md`) 완료로 해소.
- ~~최종 리뷰 Minor 사항 2건 (rfp-locate 스킬)~~ — `2026-07-21_summary.md`에서 해소:
  `extract_text.py`에 `sys.stdout.buffer.write(UTF-8)` 사용 이유 주석 추가,
  `render_pages.py`의 `fitz.open()`을 `with` 문으로 감쌈.
- ~~`.claude/worktrees/skill-essential` 물리 디렉토리 잔여~~ — `2026-07-21` 세션에서
  확인 결과 `.claude/worktrees/` 디렉토리 자체가 더 이상 존재하지 않음(Windows 파일
  잠금이 풀리며 자연히 정리된 것으로 보임). 별도 조치 불필요.
- ~~Task 5(pptx_builder) 리뷰의 미반영 Minor 사항~~ — `2026-07-21` 오후 세션에서 해소:
  `_add_scoring_table_slide`에 빈 `scoring_table` 가드 추가(`IndexError` 방지),
  섹션 슬라이드의 "근거자료: ..." 인용 렌더링을 검증하는 테스트와 빈 배점표 테스트
  2건 추가. 워크트리 `rfp-proposal-agent`(브랜치 `subagent-init-archi`)에서 커밋
  `8876889`, `origin/subagent-init-archi`에 push 완료.
- ~~`agent/` 오케스트레이션 패키지 구현 (Task 1~8) 및 main 병합~~ — `2026-07-21`
  저녁~밤 세션에서 완전히 해소: Task 6(content_writer)~8(pipeline) 구현, 24개
  테스트 전부 통과, PR #1을 squash merge로 main에 병합(`5bafdfa`), 이후 병합 후
  발견된 구조 불일치(25개구 배치로 완료된 12개구가 `giganlist/`로 안 옮겨짐)까지
  해소 — 12개구 전체를 `giganlist/`로 이동(`e1335d0`), build 스크립트는 이미
  `giganlist/{district}/...` 경로를 참조하고 있어 별도 수정 불필요, 두 build
  스크립트 재실행 확인. 후속 작업(구로부터 재개할 25개구 배치)은 위 "25개 자치구
  배치 프로젝트" 항목에 흡수됨(경로를 `giganlist/{구}/`로 바로 생성하도록 갱신).
- ~~CLAUDE.md/`institution-corpus-format` 스킬의 giganlist 경로 미반영 + bank_idea(s)_draft
  명명 불일치~~ — `2026-07-21` 밤 세션에서 해소: 3개 병렬 조사로 `CLAUDE.md` Layout
  섹션 5곳과 스킬(`SKILL.md` + `dobong_*_sample.txt` 3개)의 `{district}/`,
  `{institution}/` 패턴에 `giganlist/` 접두사가 전혀 반영 안 돼 있음을 확인, 전부
  수정. 명명 조사 중 예상과 반대되는 사실 발견 — 원래 5개구/스킬 예시(dobong)는
  전부 **복수형**(`bank_ideas_draft.txt`)인데 25개구 배치의 12개구는 전부
  **단수형**(`bank_idea_draft.txt`)이었음. 사용자 결정으로 복수형(원래 규격)을
  기준으로 통일, 12개구 파일명을 전부 rename. 커밋 `274eb7f`. 산출물 본문 내 3곳의
  단수형 자기참조는 의도적으로 보류(위 "2. 산출물 본문 내 ... 자기참조" 항목 참고).

### 22. ~~Python `assemble_deliverable` 이 전산팀 초안을 빠뜨린다~~ — **완료** (2026-08-28)

- **출처**: `2026-08-27_summary.md` `## Session 19:41`(발견) →
  `2026-08-28_summary.md` `## Session 15:30`(해소, 커밋 `ab2ec1c`).
- **무엇이었나**: `server/assembler.py` 의 `TEAM_ORDER = ["영업", "IT", "예산"]` —
  계획 I 에서 `IT` → `전산` 으로 개명됐고 `server/db.py` 에 데이터 마이그레이션까지
  있는데 이 목록만 옛 이름이라, **7단계 취합에서 전산팀 초안이 슬라이드째 빠졌다.**
- **고친 것**: 팀 목록의 출처를 `server/teams.AUTHORING_TEAMS` 하나로 통일.
  순서는 `(영업, 전산, 예산)` 으로 종전과 같아 슬라이드 순서는 안 바뀐다.
  전체 pytest **760 passed**.
- **왜 못 잡았나 — 이게 남길 값어치가 있는 부분이다.** 테스트가 **없어서**가 아니라
  픽스처가 `"IT"` 로 넣고 구현도 `"IT"` 를 읽어 **둘이 나란히 틀린 채로 통과**했다.
  이제 픽스처가 `AUTHORING_TEAMS` 를 그대로 돌리므로 이름을 어디든 따로 박으면 깨진다.
  고치기 전 코드에 새 테스트를 걸어 실제로 실패하는 것(`취합에서 빠진 팀: ['전산']`)을
  확인한 뒤 커밋했다.
- ✅ **전수조사 완료(2026-08-28, 커밋 `5bea1ad`) — 같은 부류가 하나 더 있었고 고쳤다.**
  `server/agent_adapter.py` 가 `"IT"` 를 두 곳에서 쓰고 있어(`TEAM_SEARCH_FILTERS` 와
  legacy 통째-읽기의 `prefix`), **전산팀이 예산팀 문서(`03_`)를 근거로 받고 있었다.**
  증상이 22번과 다르다 — 슬라이드가 빠지는 게 아니라 **근거 문서가 바뀐다.**
  테스트도 `"IT"` 로 호출해 **또 같은 오답을 공유**하고 있었다.
  이제 `SALES_TEAM, IT_TEAM, BUDGET_TEAM = AUTHORING_TEAMS` 로 풀어 받는다 —
  튜플이 바뀌면 **기동 시점에** 깨진다. 전체 pytest **761 passed**.
- **조사 결과 — 나머지는 문제없다**(같은 조사를 다시 하지 않도록 남긴다):
  | 위치 | 판정 |
  |---|---|
  | `agent/nodes/role_router.py` `ROLES`·`Literal[...]` | 이름 정확. `test_teams.py` 가 `ROLES == AUTHORING_TEAMS` 를 고정 |
  | `server/bidcase_repository.py` `TEAMS` | 이름 정확. 동기화 테스트 있음 |
  | `frontend/js/roles.js:78` | 이름은 맞지만 서버와 잇는 테스트가 없다 → **항목 24** |
  | 그 밖의 `"영업"` 단일 참조 | 특정 팀 하나를 가리키는 정상 코드(예: `content_writer`, `demo_seed`, `portfolio/capture`) |
- **이 부류를 다시 만났을 때의 판정 기준**: 팀 이름이 **하나만** 나오면 대개 정상이고,
  **목록·분기로 여러 팀을 열거**하면 의심한다. 그리고 **테스트가 있다고 안심하지 말 것** —
  두 건 모두 테스트가 구현과 같은 오답을 공유하고 있었다.

### 24. ~~`roles.js` 의 팀 목록이 서버와 이어져 있지 않다~~ — **완료** (2026-08-28)

- **출처**: `2026-08-28_summary.md` `## Session 16:10`(발견) → `## Session 15:54`(해소,
  커밋 `62cab63`).
- **무엇이었나**: `roles.approverOf` 가 `['영업','전산','예산']` 를 손으로 갖고 있었다.
  이름은 맞아서 동작에는 문제가 없었지만, 서버의 `AUTHORING_TEAMS` 가 바뀌면 **화면만
  조용히 옛 목록을 쓴다.** 그러면 그 팀의 결재자가 `null` 이 되어(설계상 "모르면
  지어내지 않는다") **오류 없이 결재 버튼만 안 뜬다.**
- **고친 것(ⓑ 안 채택)**: ① `approverOf` 의 리터럴을 없애고 `roles.TEAMS`
  (`AFFILIATIONS` 파생)를 쓰게 해 **파일 안에서 손으로 적는 팀 목록을 하나로** 줄였다.
  ② `server/tests/test_roles_js_matches_server_teams.py` 신설 — `roles.js` 를 읽어
  `AFFILIATIONS`·`DESIGNER`·`FINAL_APPROVER`·직책 3종을 서버와 대조하고,
  `approverOf` 에 팀 이름 리터럴이 **다시 생기면 실패**한다.
- **런타임 결합(ⓐ 안)은 만들지 않았다** — 목적은 드리프트를 잡는 것이지 기동 시점
  의존을 늘리는 것이 아니다. 파일을 읽어 대조만 한다.
- **검증**: `AFFILIATIONS` 를 `'IT팀'` 으로 바꿔 실제로 실패하는 것을 확인했다.
  pytest 761 → **769**, node **262 pass**.

