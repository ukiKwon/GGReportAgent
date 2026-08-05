# 계획 I — 역할·결재 라인과 메뉴 권한

## Context

계획 H(디자이너 전용 뷰)를 화면으로 확인하면서 사용자가 **결재 라인이 통째로 빠져
있다**는 것을 짚었다. 지금은 누가 무엇을 결재하는지가 없어서:

- 팀 작업물을 **아무도 결재하지 않는다.** `POST /tasks/{id}/approve` API는 이미
  있는데(`backend/routers/tasks.py:384`) **누를 화면이 없다.** 그래서 팀 Task는
  영원히 `1차완료`에 머문다.
- 그 결과 디자이너 제출 조건을 `승인완료`로 걸 수가 없어, 계획 H는 **`작업 중`이
  아닐 것**이라는 약한 규칙으로 타협했다. 사용자가 이를 바로잡았다 —
  **"작업 중이 끝나고 승인완료까지 받은 상태여야 제출 가능한 게 맞다."**
- 디자이너 제출물이 **각 팀으로 돌아가지 않는다.**
- 최종 결재자(**본부장**)에게는 워크플로 현황판이 필요 없는데 볼 것이 그것뿐이다.
- 역할별 메뉴 노출이 **코드에 하드코딩**돼 있어(`app.SERVER_ONLY_IDS`,
  `applyDesignerUI`) 운영자가 손댈 수 없다.

목표는 **사람 → 역할 → 볼 화면 → 결재할 것**의 사슬을 실제로 세우는 것이다.

### 사용자 확정 결정 4건 (이번 대화)

1. **역할은 소속 값을 늘려서 표현** — 지금의 `이름+소속` 프로필 구조를 그대로 쓴다.
2. **`인사권자` → `본부장`으로 개명** (역할을 둘로 나누지 않는다).
3. **메뉴 권한은 관리 화면까지** — 역할×메뉴 토글을 DB에 두고 전산팀이 관리.
4. **디자이너 제출물은 알림 + 각 팀 화면에서 열람.**

### 탐색으로 확인한 현재 지형

| 필요한 것 | 이미 있는 것 |
|---|---|
| 팀 작업 결재 | **`POST /tasks/{id}/approve`** — `1차완료`→`2차완료`, `claim_approver_if_unset`까지 완성. **화면만 없다.** |
| 게이트 결재 | `POST /institutions/{id}/checkpoint` (`{approved, comment, by}`) |
| 역할별 작업 목록 | `GET /tasks?team=…` (계획 H에서 기관 횡단으로 만듦) |
| 다른 팀 산출물 열람 | `GET /tasks/{id}/handoff` |
| 팀명↔쪽지 수신자 | `backend/teams.py`(`inbox_name`·`AGENT_TEAMS`·`is_working`) |
| 한글 이름 신원 | `_actor(by, x_user_id)` — 헤더가 ASCII만 받는 문제를 이미 푼 자리 |
| 탭 노출 토글 | `app.applyServerModeUI` / `app.applyDesignerUI` |

### 범위를 크게 줄이는 발견 2가지

1. **`handoff`는 이미 "자기 팀을 뺀 나머지"를 준다**(`WHERE team <> ?`,
   `tasks.py:219`). 즉 **디자이너가 아닌 사람이 열면 디자이너 작업물이 자동으로
   포함된다.** 따라서 "각 팀 화면에서 디자이너 작업물 열람"은 **새 화면이 아니라
   디자이너 탭의 노출 조건을 푸는 일**이다 → 탭을 **`작업함`으로 일반화**한다.
2. **결재는 전부 같은 모양**이다 — 담당이 제출(`1차완료`) → 결재자가 승인(`2차완료`).
   팀 작업이든 디자이너 작업이든 `POST /tasks/{id}/approve` 하나로 끝난다.
   결재자만 다르다(**팀 작업 = 그 팀의 팀장 / 디자이너 작업 = 본부장**).

### 함께 정리하는 기존 결함 (NEXT.md 이월)

**`bidcase_repository.TEAMS = ["영업","IT","예산"]`인데 그래프의
`role_router.ROLES = ("영업","전산","예산")`이다.** 참여확정은 전자로, 5단계
`draft_team`은 후자로 Task를 만들어 **한 공고에 `IT`와 `전산`이 둘 다 생길 수 있다.**
역할 어휘를 세우는 계획이라 여기서 `전산`으로 통일한다(그래프·프롬프트·데모가
모두 `전산`을 쓰고, `IT`를 쓰는 곳은 이 상수 하나뿐이다).

---

## Global Constraints

- **무빌드·무의존** — npm 금지. IIFE + `module.exports`/`root.X` 이중 노출,
  순수 로직만 `node --test`로 고정하는 기존 패턴 그대로.
- **지도 무수정** — `dashboard/js/render.js`는 한 줄도 고치지 않는다(계획 A1 이후
  한 번도 안 깨진 제약). `index.html`은 **추가만**(소속 `<option>` 목록은 교체).
- **9단계 그래프 구조 무수정** — 게이트 흐름은 그대로. `_gate_final`의 알림
  **수신자 문자열만** `인사권자`→`본부장`으로 바뀐다.
- **`X-User-Id`는 ASCII만** — 한글 이름은 본문 `by`로(`_actor` 재사용).
- 모든 `fetch`는 `r.ok` 검사 + `.catch`. 모든 출력은 `esc()` 통과.
- 색은 기존 CSS 변수만.
- 주석·커밋 한국어, UTF-8, TDD. 커밋 끝에
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **런처**: `py -3`은 3.15라 의존성이 없다. **`py -3.14`를 쓴다.**
- 기준선: `py -3.14 -m pytest agent backend collector -q` **635 passed**,
  `node --test dashboard/test/*.test.js` **166**.

---

## Task 1 — 역할 어휘를 한 자리에 (`backend/teams.py`)

**Files:** `backend/teams.py`, `backend/bidcase_repository.py`,
`agent/orchestrator/graph.py`, `agent/orchestrator/subagents.py`, `backend/demo_seed.py`
**Test:** `backend/tests/test_teams.py`(신규)

- 역할 목록을 상수로: 팀원 `영업팀`·`전산팀`·`예산팀`, 팀장 `영업팀장`·`전산팀장`·
  `예산팀장`, `디자이너`, `본부장`, 그리고 운영자 역할(전산팀이 겸한다).
- `team_of(role)` — 역할 → `tasks.team`. `영업팀`·`영업팀장` → `영업`,
  `디자이너` → `디자이너`. 접미사를 떼는 규칙을 **여기 한 곳에만** 둔다.
- `lead_of(team)` — `영업` → `영업팀장`. 제출 알림 수신자 결정에 쓴다.
- `is_lead(role)` / `FINAL_APPROVER = "본부장"`.
- **`인사권자` → `본부장` 개명**: `graph.py`의 `notify("인사권자", …)`,
  `subagents.verifier`, `demo_seed.NOTIFICATIONS`, `index.html`의 소속 목록.
  기존 DB에 남은 `인사권자` 행은 건드리지 않는다(과거 기록이다) — 대신
  `inbox_name`이 옛 이름도 찾도록 별칭 한 줄을 둔다.
- **`TEAMS`를 `["영업","전산","예산"]`으로 통일** + 기존 `IT` 행 마이그레이션
  (`UPDATE tasks SET team='전산' WHERE team='IT'`, 멱등). `db.py`의 `MIGRATIONS`는
  컬럼 추가용이라 여기 못 넣으므로 `init_db`에 데이터 마이그레이션 자리를 하나 만든다.

---

## Task 2 — 메뉴 권한 (DB + API)

**Files:** `backend/db.py`, `backend/menu_repository.py`(신규),
`backend/routers/menus.py`(신규), `backend/main.py`
**Test:** `backend/tests/test_api_menus.py`(신규)

```sql
CREATE TABLE role_menus (
    role    TEXT NOT NULL,
    menu    TEXT NOT NULL,      -- map/regions/workflow/chat/knowledge/tasks/approvals/admin
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (role, menu)
);
```

```
GET /menus?role=영업팀   → {"role":"영업팀","menus":{"map":true,"workflow":true,…}}
GET /menus              → 전체 역할×메뉴 표 (관리 화면용) + 메뉴 정의 목록
PUT /menus              → [{role, menu, enabled}, …] 일괄 저장
```

- **기본값은 코드에 둔다**(`DEFAULT_MENUS`). DB에 행이 없으면 기본값을 쓴다 —
  빈 운영 DB에서도 화면이 정상 동작해야 하고, 새 메뉴를 추가했을 때 아무도
  못 보는 상태가 되면 안 된다.
- 기본 매핑(초안): 본부장은 **워크플로·지식 없이** `결재함`만, 팀장은 `작업함`+`결재함`,
  팀원·디자이너는 `작업함`, 전산팀은 거기에 `권한관리` 추가. 지도·지역별은 전원 공통.
- ⚠️ **자물쇠 안전장치**: `admin`(권한관리) 메뉴를 **모든 역할에서 끄는 저장은 거부**한다
  (400). 안 그러면 한 번의 실수로 아무도 권한 화면에 못 들어가 되돌릴 방법이 없다.

---

## Task 3 — 프로필 소속 확장 + 탭 노출 일원화

**Files:** `dashboard/index.html`, `dashboard/js/app.js`, `dashboard/js/store.js`
**Test:** `dashboard/test/app_menus.test.js`(신규) — 순수부만

- 소속 `<option>`을 Task 1의 역할 목록으로 교체(쪽지함 수신자 datalist도 함께).
- `app.applyMenuPermissions()` 신설 — `GET /menus?role=<내 소속>`으로 탭 버튼을
  토글하고, **`applyServerModeUI`·`applyDesignerUI`를 여기로 흡수**한다.
  서버 모드가 아니면(=`file://`) 서버 전용 메뉴는 전부 끈다(기존 규칙 유지).
- 숨겨진 탭이 활성 상태면 지도로 되돌린다(계획 H에서 만든 동작 유지).
- 순수 함수 `app.visibleTabs(menus, serverMode)`를 따로 빼서 node로 고정한다
  (DOM 없이 규칙만 검증).

---

## Task 4 — 디자이너 탭 → **작업함**으로 일반화

**Files:** `dashboard/js/designer.js`(→ 탭 라벨·노출 조건), `dashboard/index.html`
**Test:** `dashboard/test/designer.test.js`(추가)

- 탭 이름을 **`작업함`**으로, 노출 조건을 `menus.tasks`로 바꾼다(소속 문자열 하드코딩
  제거). 파일명은 `designer.js` 그대로 둔다 — 개명은 diff만 키우고 얻는 게 없다.
- `GET /tasks?team=<team_of(내 소속)>`으로 조회하므로 **팀원도 자기 팀 작업을 본다.**
- 이관 패키지는 이미 "자기 팀을 뺀 나머지"라 **팀원이 열면 디자이너 작업물이 보인다**
  (사용자 요구 4의 '각 팀 화면에서 열람'이 여기서 충족된다).
- 팀장이 열면 자기 팀 작업이 보이되 **결재는 결재함에서** 한다(역할 분리).

---

## Task 5 — 결재함 탭 (`dashboard/js/approvals.js` 신규)

**Files:** `dashboard/js/approvals.js`(신규), `dashboard/index.html`,
`backend/routers/tasks.py`, `backend/routers/workflow.py`
**Test:** `dashboard/test/approvals.test.js`(신규), `backend/tests/test_api_approvals.py`(신규)

**백엔드**
- `GET /approvals?role=영업팀장` → 그 역할이 결재할 것 전부:
  - 팀장: 자기 팀의 `1차완료` Task
  - 본부장: **디자이너**의 `1차완료` Task + **대기 중인 게이트**(최종결재)
- 게이트 목록은 `OrchestratorService.pending_gate`를 기관마다 도는 대신
  기관 목록과 한 번에 묶어 돌려준다(`GET /institutions/{id}/status`와 같은 근거).
- `TaskApprovalIn`에 `by` 추가(한글 결재자 이름 — `_actor` 관행).
- **반려 시 담당자에게 알림**을 보낸다. 지금은 status만 `작성중`으로 되돌리고
  아무도 모른다(제출 알림을 붙일 때와 같은 종류의 구멍).

**프런트**
- 순수부: `approvals.rows(payload)`(카드 모델), `approvals.kindLabel(item)`,
  `approvals.canDecide(item)`.
- 렌더: 결재 대기 카드(작성자·본문·파일·[승인]/[반려]+사유). 게이트 항목은
  `POST /institutions/{id}/checkpoint`로, Task 항목은 `POST /tasks/{id}/approve`로.
- **본부장 화면에는 워크플로가 없다** — 결재에 필요한 맥락(기관·단계·작성물)을
  카드 안에 담는다.

---

## Task 6 — 제출 규칙 강화 + 알림 수신자 역할화

**Files:** `backend/routers/tasks.py`, `backend/teams.py`, `dashboard/js/designer.js`
**Test:** `backend/tests/test_api_designer.py`(수정), `dashboard/test/designer.test.js`(수정)

- **`_require_teams_done`의 기준을 `2차완료`로 올린다** (사용자 확정). 계획 H에서
  "그래프가 2차완료를 안 만들어서" 약하게 잡았던 것이, Task 5의 팀장 결재 화면이
  생기면서 **비로소 성립한다.** 화면(`canSubmit`)과 서버 가드를 함께 올린다.
  - `waiting_on`의 의미도 "아직 승인 안 난 팀"으로 바뀐다. 문구도 함께 고친다.
- **제출 알림 수신자를 역할로 정한다**: 팀 작업 → `lead_of(team)`(그 팀 팀장),
  디자이너 작업 → **`본부장` + 3팀 전원**(사용자 요구 4의 '알림'). 지금은 전부
  `영업팀` 고정이다.
- 디자이너 Task도 승인되면 `2차완료`가 된다 — 결재자는 본부장.

---

## Task 7 — 권한 관리 화면 (`dashboard/js/admin.js` 신규)

**Files:** `dashboard/js/admin.js`(신규), `dashboard/index.html`
**Test:** `dashboard/test/admin.test.js`(신규)

- 역할(행) × 메뉴(열) 체크박스 표 + [저장]. `GET /menus` → `PUT /menus`.
- 순수부: `admin.grid(payload)` — 역할×메뉴를 표 모델로. `admin.diff(before, after)` —
  바뀐 것만 보내 되돌리기 쉽게.
- **자물쇠 경고**: `admin` 열을 전부 끄려 하면 저장 전에 화면에서 막는다(서버도 400).
- 이 탭 자체가 `menus.admin`으로 노출되므로, 기본값에서 **전산팀만 켜져 있다.**

---

## Task 8 — 데모·문서·이월 마감

**Files:** `backend/demo_seed.py`, `docs/실행가이드_backend-agent.md`,
`docs/superpowers/specs/…-multi-agent-collab-system-design.md`,
`handoff/NEXT.md`, `handoff/2026-08-05_summary.md`

- **데모에 역할별 계정을 심는다** — 팀장 3명·본부장 1명. 계정 전환기로 한 사람이
  전 결재 라인을 돌아볼 수 있어야 한다(계획 D의 3차 결재 실습과 같은 방식).
- `demo_seed --teams-done`은 유지하되, **팀장 결재 화면이 생겼으므로 그 화면으로도
  풀 수 있다**는 점을 가이드에 적는다(플래그는 지름길로 남긴다).
- **실행가이드 §16 신설** — 역할 목록과 각자 보는 화면, 결재 라인
  (팀원→팀장→디자이너→본부장), 권한 관리 화면 사용법, 자물쇠 안전장치.
  §15(디자이너 작업함)의 제출 조건 설명도 `승인완료` 기준으로 고친다.
- 스펙 §② 13·14·16 항목에 결재 라인 실체를 반영(현재 ✅이지만 근거가 바뀐다).
- NEXT.md에서 **`IT`/`전산` 이원화 항목 제거**(Task 1에서 해소).

---

## Verification

```bash
py -3.14 -m pytest agent backend collector -q      # 635 + 신규
node --test dashboard/test/*.test.js               # 166 + 신규
py -3.14 -m backend.demo                           # 데모 기동
```

브라우저 `http://localhost:8000/` — **계정 전환기로 역할을 갈아끼우며** 확인한다:

1. **팀원(`전산팀`)** → `작업함`만 보인다(워크플로·권한관리 없음). 자기 팀 작업이
   뜨고, 이관 패키지에 **디자이너 작업물이 보인다**.
2. **팀장(`전산팀장`)** → `결재함`에 전산팀의 제출된 작업이 뜬다. [승인] → 그 작업이
   `승인완료`가 되고, [반려] → 담당자에게 쪽지가 간다.
3. **디자이너** → 3팀이 전부 `승인완료`가 되기 전에는 **제출 버튼이 잠기고**
   "아직 승인 전인 팀: …"이 뜬다. 팀장 3명으로 전부 승인한 뒤 제출하면 성공하고,
   **3팀과 본부장에게 알림**이 간다.
4. **본부장** → `결재함`에 디자이너 제출물과 최종결재 게이트가 뜬다.
   **워크플로 탭은 보이지 않는다.**
5. **전산팀** → `권한관리`에서 `본부장 × 워크플로`를 켜고 저장 → 본부장으로 전환하면
   워크플로 탭이 생긴다. 되돌리면 사라진다.
6. **자물쇠** — `권한관리`에서 `admin` 열을 전부 끄려 하면 저장이 막힌다.
7. `file://`로 열면 서버 전용 탭이 전부 사라지고 지도는 그대로 동작한다.

## 이번 범위 밖

- **로그인·인증** — 프로필은 여전히 자기신고(localStorage)다. 폐쇄망 + nginx Basic
  Auth 전제(계획 G)이므로 앱 로그인은 별건이다. **권한은 화면 노출 제어이지 보안
  경계가 아니다**는 점을 가이드에 명시한다.
- 사용자 계정 관리(users 테이블) — 이번엔 역할 목록이 고정이다.
- 그래프에 디자이너 단계를 끼워 넣는 것(계획 H에서 범위 밖으로 확정).

---

## 실행 결과 (2026-08-05)

전 태스크 완료. pytest **635 → 690**, node **166 → 191**, `render.js` 무수정.

### 계획을 벗어난 판단 3건

1. **`inbox_name`을 고쳤다** — 계획에 없던 것이다. 팀장 역할을 추가하자 `startswith`
   추론이 `전산` → `전산팀장`을 골라, 데모에서 **권 차장(전산 팀원)이 전산팀장으로**
   나왔다. 아는 팀이면 `팀` 접미사를 붙이도록 바꿨다(알림 이력 유무로 소속이 흔들리면
   계정 전환기가 사람마다 다른 답을 준다). 이 변경으로 기존 테스트 3건의 기대치가
   바뀌었고, **새 동작이 더 맞다**고 판단해 테스트를 갱신했다.
2. **`FINAL_APPROVER`를 `agent/`에서 쓰지 않았다.** `subagents.py`에서 import하려다
   `ports.py`의 분리 관행(agent 층은 backend를 모른다)에 걸렸다. 리터럴 `"본부장"`으로
   두고 정본이 어디인지 주석에 남겼다.
3. **`menu_rules.js`를 따로 뺐다.** 계획은 `app.visibleTabs`로 적었는데, `app.js`는
   DOM에 깊게 묶여 있어 node에서 require할 수 없다. 규칙만 별도 모듈로 빼서 고정했다.

### 계획대로 간 것 중 값어치가 컸던 것

- **`handoff`가 이미 "자기 팀을 뺀 나머지"를 준다**는 발견 — 팀원 화면이 탭 노출
  조건을 푸는 것만으로 나왔다. 새 API도 새 화면도 필요 없었다.
- **자물쇠 안전장치** — 화면·서버 양쪽에서 막는다. 없었으면 한 번의 실수로 아무도
  권한 화면에 못 들어가는 상태가 만들어질 수 있었다.
- **제출 조건 강화가 계획 H의 테스트 4건에 정확히 걸렸다** — 무엇이 바뀌는지가
  테스트로 드러나 되짚기 쉬웠다.
