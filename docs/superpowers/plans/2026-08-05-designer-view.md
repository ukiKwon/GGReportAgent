# 계획 H — 디자이너 전용 뷰 (스펙 §② 14)

## Context

스펙 §⑩ 재대조에 **마지막으로 남은 ⚠️ 1건**이다(현재 ✅18 / ⚠️1 / ❌0). 7단계
`packager`가 이관 패키지(PPTX 골격)를 만들고 `이관` 알림을 보내지만, **디자이너가
무엇을 받았는지 열어볼 화면이 없어 쪽지 통지에 머문다**(스펙 195·231행).

사용자가 확정한 기능 9가지가 이번 범위다:
① 각 팀 최종 승인 산출물 확인 ② 작성자/작성팀에게 문의 ③ 작업물 업로드
④ 임시저장 ⑤ 발송·제출 ⑥ 요청받은 TASK 목록 ⑦ 그 우선순위 ⑧ 작업 중 TASK 목록
⑨ 목록별 처리상태 태그.

### 탐색으로 확인한 것 — 재사용이 대부분이다

| 필요한 것 | 이미 있는 것 |
|---|---|
| TASK 개체 | `tasks` 테이블 — `UNIQUE(bid_case_id, team)`, 상태 4종(대기/작성중/1차완료/2차완료), `draft_content`·`assignee`·`approver` |
| 제출 | `POST /tasks/{id}/submit` (`backend/routers/tasks.py:42`) — assignee 검증·상태 전이까지 완성 |
| 문의 | `POST /notifications` (`backend/routers/notifications.py:52`) — `sender`·`task_id`·`institution_id` 링크까지 있다 |
| 우선순위 계산 | `logic.daysUntil` (`dashboard/js/logic.js:82`) |
| 경로 탈출 방어 | `backend/archive.py:35-37`·`backend/routers/documents.py:48` 의 `commonpath` 가드 |
| 팀명→쪽지 수신자 | `backend/routers/accounts.py:_inbox_team` (`tasks.team`='영업' vs 알림 수신자 '영업팀' 불일치를 이미 푼 곳) |

### 사용자 확정 결정 4건 (이번 대화)

1. **작업물 = 파일 업로드**(PPTX 등). 신규 multipart 엔드포인트가 필요하다.
2. **우선순위 = 입찰일까지 남은 일수(자동)**. 새 컬럼을 두지 않는다.
3. **제출 = 결재 요청만 보낸다. 9단계 그래프 무수정** — 디자이너 작업은 7단계 이관
   이후의 병렬 트랙이다.
4. **탭은 소속이 '디자이너'일 때만** 보인다.

### 탐색 중 발견한 함정 2가지 (계획에 반영됨)

- **`task_update`로 디자이너 Task를 만들면 재실행 때 작업이 지워진다.** `packager`는
  최종반려 시 재실행된다(`subagents.py:121-123`의 F7 주석이 명시). `task_update`는
  `status='대기', progress=0`을 덮어쓰므로, 디자이너가 파일을 올려둔 뒤 최종반려가
  나면 상태가 초기화된다. → Recorder 포트에 **`task_open`**(행만 보장, 상태 불변)을
  새로 낸다.
- **"최종 승인난 산출물"을 `status='2차완료'`로 거르면 화면이 빈다.** 그래프 흐름에서
  팀 Task는 `draft_team`이 `1차완료`까지만 올리고, 5단계 기획승인은 기관 단위
  checkpoint라 팀 Task를 `2차완료`로 만들지 않는다(`approve_task`는 사람이
  `POST /tasks/{id}/approve`를 눌러야 탄다). → **거르지 않고 전부 보여주되 각자의
  실제 상태 태그를 단다.** 승인 안 난 것을 감추면 디자이너가 다 받은 줄 안다.

---

## Global Constraints

- **무빌드·무의존** — npm 금지. 기존 IIFE + `module.exports`/`root.X` 이중 노출 패턴
  (`dashboard/js/workflow.js`) 그대로. 순수 로직과 DOM 렌더를 한 파일에서 나누고
  순수부만 `node --test`로 고정한다.
- **지도·기존 탭 무수정.** `dashboard/js/render.js`는 한 줄도 고치지 않는다
  (계획 A1 이후 한 번도 안 깨진 제약 — 이번에도 유지). `index.html`은 **추가만**.
- **9단계 그래프 무수정** — `agent/orchestrator/graph.py`는 건드리지 않는다.
  `subagents.py`의 `packager`에 두 줄(`task_open` + 기존 notify 유지)만 더한다.
- **`X-User-Id`는 ASCII만** — 한글 이름은 body로 (A1 F10 결론).
- 모든 `fetch`는 `r.ok` 검사 + `.catch`. 모든 출력 텍스트는 `esc()` 통과.
- 색은 기존 CSS 변수만(`--panel`·`--line`·`--fg`·`--muted`·`--accent-color`·
  `--red`/`--orange`/`--blue`).
- 주석·커밋 한국어, UTF-8, TDD. 커밋 끝에
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **런처**: 이 PC의 `py -3`은 3.15라 의존성이 없다. **`py -3.14`를 쓴다.**
- 기준선: `py -3.14 -m pytest agent backend collector -q` **579 passed**,
  `node --test dashboard/test/*.test.js` **136**.

---

## Task 1 — 디자이너 Task를 만든다 (`task_open` 포트 신설)

**Files:** `agent/orchestrator/ports.py`, `agent/orchestrator/subagents.py`,
`backend/orchestrator_recorder.py`
**Test:** `agent/tests/test_orchestrator_subagents.py`, `backend/tests/test_orchestrator_recorder.py`

- `Recorder` Protocol + `NullRecorder`에 `task_open(team: str) -> None` 추가.
- `DbRecorder.task_open`은 `_ensure_task`만 부르고 **상태를 건드리지 않는다**.
  `_ensure_task`가 이미 멱등이라 구현은 한 줄이다.
- `packager`에 `recorder.task_open("디자이너")`를 기존 `notify` **바로 앞**에 넣는다.
- **회귀 테스트가 이 계획의 핵심 방어다**: 이미 `작성중`이고 파일이 올라간 디자이너
  Task가 있는 상태에서 `packager`를 다시 부르면 **상태·진행률이 그대로**여야 한다.

---

## Task 2 — `GET /tasks` 역할별 작업 목록 (기관 횡단)

**Files:** `backend/routers/tasks.py`, `backend/task_repository.py`
**Test:** `backend/tests/test_api_task_list.py`(신규)

기존 조회는 전부 기관 단위인데, 디자이너의 목록은 **여러 기관에 걸쳐** 있다.

```
GET /tasks?team=디자이너[&status=대기&status=작성중]
→ [{task_id, team, status, progress_pct, assignee, approver,
    institution_id, institution_name, bid_case_id,
    bid_date, schedule_confidence,   # 우선순위 계산 근거(화면이 D-day로 바꾼다)
    stage,                           # 기관의 현재 9단계
    file_count, updated_hint}]
```

- **`team`은 필수(400)** — 없이 열면 남의 작업까지 보이는 전체 조회가 된다
  (`notifications`의 `recipient` 필수와 같은 이유).
- `draft_content`는 **목록에서 제외**한다(무겁다). 상세에서만 준다.
- `bid_date`는 `confirmed_date > expected_date` 우선순위. 계획 D의
  `serverdata.applyBidCases`가 쓰는 규칙과 같다 — 값 선택 규칙을 화면에 복제하지 않게
  **서버가 골라서 준다**.

---

## Task 3 — 이관 패키지 열람 `GET /tasks/{task_id}/handoff`

**Files:** `backend/routers/tasks.py`
**Test:** `backend/tests/test_api_handoff.py`(신규)

스펙 §② 14의 본체다. 디자이너 Task 하나 → 그 `bid_case`의 산출물 일체.

```
{
  institution_id, institution_name, stage,
  pptx_path,                         # institutions.pptx_path (7단계 packager 산출물)
  teams: [{team, status, assignee, approver, contact, draft_content}],
  scoring: {total_score, criteria:[…]} | null,   # rfp_scoring.json
  coverage: {…} | null                           # coverage_map.json
}
```

- **`teams`는 거르지 않는다** — 위 "함정 2" 참조. 승인 안 난 팀도 실제 상태와 함께
  넣고, 화면이 태그로 구분한다. 디자이너 자신의 Task는 목록에서 뺀다.
- `contact`는 **서버가 계산해 준다** — `accounts.py:_inbox_team`을 공용 자리로 옮겨
  재사용한다(프런트가 '영업'→'영업팀' 규칙을 복제하면 두 곳이 어긋난다).
- `scoring`·`coverage`는 파일이 없으면 `null`. 없다고 500을 내지 않는다.
- 산출물 파일 본문은 여기서 주지 않는다 — **`GET /documents?path=`가 이미 있다**
  (지식 탭의 원문 열기). 화면은 그것을 재사용한다.

---

## Task 4 — 작업물 파일 (업로드·목록·내려받기·삭제)

**Files:** `backend/task_files.py`(신규), `backend/routers/tasks.py`
**Test:** `backend/tests/test_task_files.py`(신규), `backend/tests/test_api_task_files.py`(신규)

```
POST   /tasks/{task_id}/files   (multipart, X-User-Id)  → 201 {name, size, uploaded_at}
GET    /tasks/{task_id}/files                           → [{name, size, uploaded_at}]
GET    /tasks/{task_id}/files/{name}                    → FileResponse
DELETE /tasks/{task_id}/files/{name}                    → 204
```

- 저장 위치: **`{output_root}/{기관명}/design/{task_id}/{파일명}`**.
  `task_id`로 한 겹 더 내려 같은 기관의 여러 bid_case가 섞이지 않게 한다.
- **파일명 위생 3중**: ① `os.path.basename`으로 경로 성분 제거 ② 확장자 허용목록
  (`.pptx .ppt .pdf .png .jpg .jpeg .zip`) ③ 저장 직전
  `commonpath` 가드(`archive.py:35-37`과 같은 방식). 기관명에 `..`가 섞이는 경로도
  같은 가드로 막힌다.
- **용량 상한 50MB** — 넘으면 413. 폐쇄망이라도 디스크는 유한하다.
- 권한: `POST /tasks/{id}/upload`와 **같은 선점 관행**(`tasks.py:92-96`) — assignee가
  NULL이면 첫 업로드가 선점, 이미 다른 사람이면 403.
- 같은 이름 재업로드는 **덮어쓴다**(디자이너가 수정본을 올리는 흐름이 자연스럽다).
  덮어썼다는 사실은 응답에 `replaced: true`로 알린다.

---

## Task 5 — 임시저장과 제출

**Files:** `backend/routers/tasks.py`, `backend/task_repository.py`
**Test:** `backend/tests/test_api_task_draft.py`(신규), `backend/tests/test_api_tasks.py`(추가)

- **임시저장 `PATCH /tasks/{task_id}/draft`** — `draft_content`(설명 메모)만 갱신하고
  **메시지를 남기지 않는다**. 기존 `POST /tasks/{id}/upload`를 쓰지 않는 이유: 그쪽은
  호출마다 "업로드 즉시검사 —…" agent 메시지를 남겨서, 임시저장을 누를 때마다 로그가
  쌓인다. 임시저장은 기록할 사건이 아니다.
- **제출은 기존 `POST /tasks/{task_id}/submit`을 그대로 쓴다.** 다만 **지금은 아무에게도
  알리지 않는다** — 제출해도 아무 일이 안 일어난다. 여기에 `결재요청` 알림 발송을
  더한다(수신자 `영업팀`, `task_id`·`institution_id` 링크 포함).
  - ⚠️ **이 변경은 디자이너뿐 아니라 3팀 제출에도 적용된다.** 의도적이다 — 기존 구멍을
    메우는 것이고, 알림 없는 제출은 어느 팀에서도 의미가 없다. 기존 테스트가 알림
    개수를 세고 있으면 그 기대치를 갱신한다(감추지 않는다).

---

## Task 6 — 디자이너 탭 (`dashboard/js/designer.js`)

**Files:** `dashboard/js/designer.js`(신규), `dashboard/index.html`(추가만),
`dashboard/js/app.js`
**Test:** `dashboard/test/designer.test.js`(신규)

**순수부 (node --test로 고정)**

- `designer.priority(task, today)` → `{days, level, label}`.
  `logic.daysUntil`을 재사용하되 **구간은 이 화면 것을 따로 둔다** — `computeUrgency`의
  182/365/730일은 계약 만료 기준이라 작업 마감에는 너무 길다.
  `≤7 급함(red) / ≤30 임박(orange) / ≤90 보통 / 그 외 여유 / 날짜 미상 최하위`.
- `designer.buckets(tasks)` → `{requested, working, done}`.
  `대기`=요청받음, `작성중`=작업 중, `1차완료`·`2차완료`=제출됨.
- `designer.statusTag(status)` → `{cls, text}` (기능 ⑨).
- `designer.sortByPriority(tasks, today)` — 날짜 미상은 **뒤로**(Infinity).
- `designer.handoffRows(payload)` — 팀별 산출물 행 + 상태 태그 + 문의 수신자.

**렌더·배선**

- `#tab-designer`: 좌측 목록(요청받은 / 작업 중 / 제출됨 3구획, 각 행에 D-day 배지와
  상태 태그) + 우측 상세.
- 상세: ① 이관 패키지(팀별 산출물 카드 — 본문 열기는 `GET /documents`, 각 카드에
  **[문의]** 버튼 → 쪽지함 발송 폼을 수신자·링크 채워서 연다) ② 내 작업물(파일 목록·
  드래그 없는 단순 `<input type=file>` 업로드·삭제) ③ 메모 + **[임시저장]**
  ④ **[제출]**(확인 대화 후 submit).
- **문의는 `notify.js`의 발송 경로를 재사용**한다 — 쪽지 발송 폼을 두 벌 만들지 않는다.
  `notify.openCompose({recipient, institutionId, taskId})`를 노출해 부른다.
- 폴링은 **하지 않는다**. 탭 진입·조작 후에만 다시 읽는다(워크플로의 2초 폴링은 그래프가
  돌기 때문이고, 디자이너 목록은 그렇게 자주 바뀌지 않는다).

**노출 조건** — `app.js`

- `app.SERVER_ONLY_IDS`에 `tab-btn-designer`를 넣지 **않는다**. 조건이 하나 더 있기
  때문이다: `app.applyDesignerUI()`를 새로 만들어 **서버 모드 AND 소속=='디자이너'**
  일 때만 표시하고, `applyServerModeUI`와 `onProfileChanged` 양쪽에서 부른다
  (프로필은 언제든 바뀐다 — 계정 전환기가 있다).
- 숨겨진 탭이 활성 상태였다면 `map` 탭으로 되돌린다(빈 화면이 남지 않게).

---

## Task 7 — 데모 데이터·가이드·스펙 마감

**Files:** `backend/demo_seed.py`, `docs/실행가이드_backend-agent.md`,
`docs/superpowers/specs/2026-07-31-multi-agent-collab-system-design.md`,
`handoff/NEXT.md`, `handoff/2026-08-05_summary.md`

- **`demo_seed.py`의 `TEAMS`에 `("디자이너", "demo-t-design", "대기", 0, None)` 추가.**
  이게 없으면 계정을 디자이너로 바꿔도 목록이 비어 **화면 확인 자체가 불가능**하다.
  데모 파일 1~2개(더미 PPTX)도 함께 심어 파일 목록·내려받기를 보이게 한다.
- **실행가이드 §15 신설** — 디자이너 뷰 사용법, 탭이 안 보일 때(소속 확인),
  우선순위가 입찰일 기준이라는 점, 파일 제약(확장자·50MB), 제출하면 영업팀에
  결재요청이 간다는 점.
- **스펙 §⑩ 14번 ⚠️ → ✅**, 집계를 **✅19 / ⚠️0 / ❌0**으로 갱신. 231행의 미충족
  사유 문단도 함께 정리한다.
- `NEXT.md`에서 항목 1의 "§② 14" 블록 제거 + 이번 세션 summary에 해소 사실 기록.

---

## Verification

```bash
py -3.14 -m pytest agent backend collector -q      # 579 + 신규
node --test dashboard/test/*.test.js               # 136 + 신규
py -3.14 -m backend.demo                           # 데모 기동 (운영 자료와 분리)
```

브라우저 `http://localhost:8000/`:

1. 상단바 계정 전환기로 **디자이너**를 고른다 → **[디자이너] 탭이 나타난다.**
   다른 계정(예: 김 차장/영업)으로 바꾸면 **탭이 사라진다.**
2. 목록에 도봉구 건이 **요청받음**으로 뜨고, **D-day 배지와 상태 태그**가 보인다.
   입찰일이 없는 건은 맨 뒤에 '미상'으로 간다.
3. 상세에서 **팀별 산출물 카드**가 보이고, 본문 열기를 누르면 원문이 뜬다.
   승인 안 난 팀도 **감춰지지 않고 자기 상태 태그를 달고** 보인다.
4. 카드의 **[문의]** → 쪽지 발송 폼이 수신자(예: `전산팀`)가 채워진 채 열린다.
   보낸 뒤 소속을 `전산팀`으로 바꾸면 그 쪽지가 보인다.
5. `.pptx`를 올린다 → 파일 목록에 뜬다. **`.exe`는 거부**되고, 같은 이름을 다시 올리면
   덮어쓰며 그 사실을 알린다. 내려받기와 삭제가 동작한다.
6. 메모를 쓰고 **[임시저장]** → 새로고침해도 남아 있고, **워크플로 탭 로그에 새 줄이
   생기지 않는다**(임시저장은 기록할 사건이 아니다).
7. **[제출]** → 상태가 `1차완료`로 바뀌고, 소속을 `영업팀`으로 바꾸면 **결재요청 쪽지가
   와 있다.**
8. **최종반려로 `packager`가 재실행돼도 5~7에서 올린 파일과 상태가 그대로다**
   (Task 1의 회귀 방어 — 화면에서도 한 번 확인한다).
9. `dashboard/index.html`을 `file://`로 직접 열면 **디자이너 탭이 안 보이고** 지도는
   그대로 동작한다.

## 이번 범위 밖

- **9단계 그래프에 디자이너 단계를 끼워 넣는 것** — 사용자가 "결재 요청만, 그래프
  무수정"으로 확정. 디자이너 작업이 8단계 검증 대상에 포함되어야 한다면 별도 계획.
- 파일 미리보기(PPTX 썸네일) — 폐쇄망에서 렌더러가 필요해 별건이다. 이번엔 내려받기까지.
- `NEXT.md` 항목 7(coverage_map `pii_count` 근본 수정)·M-1·M-6은 그대로 열려 있다.

---

## 실행 결과 (2026-08-05)

전 태스크 완료. 테스트 pytest **579 → 627**, node **136 → 160**, `render.js` 무수정.

### 계획을 벗어난 판단 4건

1. **`GET /tasks/{id}/handoff`에서 에이전트 전용 단계를 뺐다.** 계획은 "거르지 않는다"
   였는데, 실기동에서 RFI분석·취합·검증이 **빈 카드 3개**로 올라왔다. 이들은 사람
   작성물이 없고 문의할 상대도 아니며, 산출물은 `scoring`·`coverage`·`pptx_path`로
   따로 실린다. `backend/teams.AGENT_TEAMS`로 걸렀다. "승인 안 난 **팀**은 감추지
   않는다"는 원칙 자체는 그대로다.
2. **한글 신원(`by`) 경로를 새로 냈다.** 계획에 없던 것이다. `X-User-Id`가 ASCII만
   받아서 담당자가 '최 디자이너'면 자기 작업에 파일 하나 못 올리고 403이 났다 —
   데모 검증이 아예 불가능했다. `CheckpointIn.by`와 같은 관행으로 풀었다
   (`_actor(by, x_user_id)`, `TaskActorIn`/`TaskDraftIn`).
3. **`task_dir`에 조각 검사(`_plain_segment`)를 더했다.** 계획은 `commonpath` 가드만
   적었는데, `task_id`가 `../..`이면 최종 경로가 `output_root` **안쪽**에 떨어져
   가드를 통과하면서도 제 자리를 벗어난다. 테스트가 먼저 잡았다.
4. **데모 시드를 계획보다 넓게 손봤다.** 디자이너 Task·파일 2건에 더해 **팀별
   작성물(`DRAFTS`)과 `pptx_path`**까지 넣었다. 없으면 이관 패키지 카드가 전부
   "작성물 없음"이라 기능 ①을 화면에서 확인할 수 없었다. 전산팀만 `2차완료`로 둬서
   "승인 안 난 팀도 감추지 않는다"는 동작이 한눈에 보이게 했다.

### 계획대로 간 것 중 값어치가 컸던 것

- **`task_open` 회귀 테스트**. 계획이 "핵심 방어"라고 못박은 그대로, `task_update`를
  썼다면 최종반려 한 번에 디자이너의 업로드 상태가 초기화됐을 것이다.
- **`GET /documents` 재사용** — 산출물 본문 열람 API를 새로 만들지 않았다.
- **`notify.openCompose`** — 쪽지 발송 폼을 두 벌 만들지 않았다.
