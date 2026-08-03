# 계획 D — 입찰상황판 확장 (스펙 화면 ①)

> **For agentic workers:** 태스크 단위로 TDD → 커밋. 순차 실행.

**Goal:** 스펙 §⑦ 화면 6종 중 마지막 하나. 지도가 보여주는 입찰일을 **실제 공고
(`bid_cases`) 기준**으로 바꾸고, 참여확정 3단계 결재를 화면에서 하며, 확정되면
오케스트레이터가 이어받게 한다.

## Context

C2까지로 화면 5종이 붙었고 스펙 §⑩ 재대조에서 ❌/⚠️로 남은 것이 전부 이 하나로 묶였다
(§② **1번** 예상/확정 배지 · **5번** 확정 선택 · **6번** 확정 시 3·4단계 자동 실행).

**탐색으로 드러난 것 — NEXT.md에 적어둔 "지도를 고쳐야 한다"는 틀렸다.**

- `logic.urgencyOf`가 `contractEnd`·`confirmed`로 임박도 색을 정하고, 랭킹 카드는
  `logic.formatBidDate`로 `날짜(확정/추측)`를 이미 찍고 있다.
  (⚠️ 작업 중 "지자체 면에도 추측이면 빗금이 쳐진다"고 적었는데 **틀렸다** —
  `render.js:340`의 빗금은 *마커* 전용이고 지자체는 `logic.js:146`에서 마커에서 제외된다.
  면에 확정/추측을 표시하지 않기로 사용자가 결정했다(2026-08-03).)
- 문제는 그 값의 출처다. 지도는 `institutions.contract_end`(CSV 반입) + 로컬 `confirmed`를
  보는데, **실제 공고 일정은 `bid_cases.expected_date/confirmed_date`에 따로 있다**
  (`backend/inbox_import.py`는 bid_case만 갱신하고 `institutions.contract_end`는 건드리지
  않는다). 진실이 두 곳인 것이 진짜 결함이다.
- → **병합 계층(`dashboard/js/serverdata.js`)에서 bid_case 일정을 `contractEnd`/`confirmed`로
  실어주면 `render.js`는 한 줄도 고칠 필요가 없다.**

**또 하나 — "확정 버튼" 하나로 끝나지 않는다.** `backend/bidcase_repository.py:170`
`submit_participation_decision`은 **tier 1·2·3 순차 결재**를 요구하고 tier 3에서야
`participation_status`가 `참여확정`이 된다(그때 `create_tasks_for_bid_case`도 돈다).

**사용자 확정 3건 (이번 대화)**

1. 참여확정 결재 UI는 **워크플로 탭**에 둔다 — **`render.js` 무수정**을 유지한다.
2. 입찰일은 **bid_case가 이긴다**: `confirmed_date` > `expected_date` >
   `institutions.contract_end`(CSV). 반입된 공고가 없는 기관은 지금과 똑같이 보인다.
3. 참여확정되면 **오케스트레이터가 자동으로 이어받되, 문제가 생기면 쪽지로 알린다**
   (조용히 실패하지 않는다).

## Global Constraints

- **`dashboard/js/render.js` 무수정** — 이번 계획의 핵심 제약이다. 지도 표시는 병합
  계층이 값을 바꿔주는 것으로 달성한다.
- 무빌드·무의존, IIFE + `module.exports` 이중 노출, 순수부만 `node --test`.
- 서버 모드 전용. `file://` 폴백에서는 지금 동작 그대로(번들 값 사용).
- 한글 이름은 **body로**(`X-User-Id`는 ASCII만). 모든 `fetch`는 `r.ok` + `.catch`.
- 주석·커밋 한국어, UTF-8, TDD, `py -3.14`.
- 기준선: `py -3.14 -m pytest agent backend collector -q` **382 passed**,
  `node --test dashboard/test/*.test.js` **86**.

---

## Task 1 — `GET /bidcases/latest` (기관별 최신 공고)

**Files:** `backend/bidcase_repository.py`, `backend/routers/bidcases.py`
**Test:** `backend/tests/test_api_bidcases_latest.py`(신규)

지도는 **전체 기관**의 일정이 필요하므로 단건이 아니라 목록이 필요하다.

```
GET /bidcases/latest
→ [{institution_id, bid_case_id, expected_date, confirmed_date, schedule_confidence,
    participation_status, participation_decision}]
```

- 기관마다 **최신 1건**(`OrchestratorService._latest_bid_case`와 같은 원칙 — `rowid` 내림차순).
- ⚠️ **라우트 순서**: `bidcases.py`에 이미 `@router.get("/{bid_case_id}")`가 있어
  `/latest`를 **그 앞에** 선언하지 않으면 `bid_case_id="latest"`로 잡힌다.
- `Institution` 모델은 건드리지 않는다 — bid_case는 기관 테이블의 정보가 아니다.

---

## Task 2 — 병합: bid_case 일정이 지도의 입찰일이 된다

**Files:** `dashboard/js/serverdata.js`, `dashboard/js/app.js`
**Test:** `dashboard/test/serverdata.test.js`

- `serverdata.applyBidCases(list, bidCases)` (순수) — `institutionId` 기준으로
  다음 우선순위를 적용한다:
  - `confirmed_date` 있으면 → `contractEnd = confirmed_date`, `confirmed = true`
  - 없고 `expected_date` 있으면 → `contractEnd = expected_date`, `confirmed = false`
  - 둘 다 없으면 **레코드를 그대로 둔다**(CSV 값 보존)
  - `bidCaseId`·`participationStatus`·`participationDecision`도 레코드에 실어 준다
    (워크플로 탭의 참여 결정 카드가 쓴다)
- `app.bootstrapServer`가 `/institutions`와 `/bidcases/latest`를 **병렬로** 받아
  `mergeUnion` 뒤에 `applyBidCases`를 적용한다. `/bidcases/latest` 실패는 무시하고
  기존 병합 결과를 쓴다(부가 정보라 화면을 막지 않는다).
- `store.LOCAL_ONLY_FIELDS`에 `confirmed`가 들어 있다 — 서버 모드에서 로컬 편집이
  bid_case 값을 덮는다. **`applyBidCases`는 `applyEdits` 뒤에 적용되지 않으므로**
  순서를 확인하고, 덮이면 안 되는 이유를 주석으로 남긴다(공고가 로컬 추측을 이긴다).

---

## Task 3 — 워크플로 탭의 참여 결정 카드

**Files:** `dashboard/js/workflow.js`, `dashboard/index.html`(스타일만 추가)
**Test:** `dashboard/test/workflow.test.js`

- **순수부** `workflow.participationRows(record)` → 3행
  `[{tier, role, by, choice, at, state}]`.
  `state`는 `'done'`(결재됨) / `'current'`(다음 차례) / `'todo'`.
  `participation_status`가 `검토중`이 아니면 모든 행이 `done`(더 못 누른다).
- 스테퍼 위에 `■ 참여 결정 (검토중)` 카드. `current` 행에만
  `[참여] [미참여] [보류]` 버튼을 띄운다.
- 전송: `POST /bidcases/{id}/participation-decisions`
  `{tier, role: 내 소속, by: 내 이름, choice}`. 프로필이 비면 먼저 입력하라고 알린다.
- 성공하면 `bootstrapServer()`로 목록을 새로 받아 지도·카드가 함께 갱신되게 한다.

---

## Task 4 — 참여확정 → 오케스트레이터 자동 시작 (실패는 쪽지로)

**Files:** `backend/routers/bidcases.py`
**Test:** `backend/tests/test_api_bidcases.py`(추가)

`post_participation_decision`이 `참여확정`을 만들었을 때만:

1. `POST /run`과 **같은 조건**을 확인한다(`rfp_path` 또는 `artifacts_exist`).
2. 되면 `request.app.state.orchestrator.start(...)`를 부른다.
3. **안 되면 조용히 넘어가지 않고** `create_notification(recipient="영업팀", kind="쪽지",
   content="참여확정됐지만 분석을 시작하지 못했습니다 — <사유>")`를 남긴다.
   이미 실행 중(`RuntimeError`)이어도 마찬가지로 알린다.
4. 어느 경우든 **결재 자체는 성공(200)** 이다 — 자동 실행 실패가 결재를 되돌리면 안 된다.

응답에 `run_started: bool`을 얹어 화면이 즉시 안내할 수 있게 한다.

---

## Task 5 — 마감: 가이드 §11 · 스펙 §⑩ 갱신 · NEXT.md 정정

**Files:** `docs/실행가이드_backend-agent.md`, 스펙 §⑩, `handoff/NEXT.md`

- 가이드 §11: 참여 결정 3단계를 **계정 전환기로 혼자 재현하는 법**(1차 영업팀 →
  2차 전산팀 → 3차 예산팀), 입찰일 우선순위, 자동 실행과 실패 쪽지.
- 스펙 §⑩의 1·5·6을 ✅로 갱신하고 집계를 다시 센다.
- **NEXT.md의 "지도를 건드려야 하는 유일한 작업" 문장을 정정한다** — 실제로는
  병합 계층에서 해결돼 `render.js` 무수정이었다.

---

## Verification

```bash
py -3.14 -m pytest agent backend collector -q
node --test dashboard/test/*.test.js
py -3.14 -m backend.demo --reset      # 데모 재생성 후 기동
```

1. 지도에서 도봉구 입찰일이 **bid_case 값**으로 바뀐다(반입 공고가 없으면 그대로).
2. 워크플로 탭 → 참여 결정 카드에서 계정을 바꿔가며 1→2→3차 결재.
3. 3차 승인 직후 **자동 실행 시도** — 데모는 `rfp_text.txt`가 없어 실패하므로
   **쪽지함에 "분석을 시작하지 못했습니다" 쪽지가 온다**(조용히 실패하지 않음 확인).
4. `git diff --stat`에 **`dashboard/js/render.js`가 없어야 한다.**
