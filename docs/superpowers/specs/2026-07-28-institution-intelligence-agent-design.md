# 기관 인텔리전스 에이전트(가칭) — 팀별 제안서 협업 워크플로우 설계

- **작성일**: 2026-07-28
- **상태**: 확정 (브레인스토밍 승인 완료)
- **위치**: 신규 — `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`
  (이하 "상위 E2E 스펙")의 5·6단계를 대체/구체화하는 하위 설계
- **선행 스펙**: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`.
  상위 스펙 §④의 "5단계 제안서 기획 → 6단계 세부기획(3팀)"이라는 순차 상태머신을, 본
  문서는 "**처음부터 3팀 병렬 + 팀별 승인 체인 + 진척도 공유**"로 대체한다. 상위 스펙의
  다른 부분(①목적, ②아키텍처, ③레지스트리 스키마, ⑥LLM 어댑터, ⑦영향범위, ⑧구현순서)은
  그대로 유효하며 본 문서와 충돌하지 않는다.

---

## ① 배경 / 이 설계가 대체하는 것

상위 E2E 스펙 §④는 9단계를 순차 상태머신으로 정의했다:

```
... 4 RFI분석 → 5 제안서기획(🛑 spec 승인) → 6 세부기획(3팀) → 7 취합 → 8 검토(🛑) → 9 제출
```

실제 업무 시나리오를 확인한 결과, 5단계(단일 draft)와 6단계(3팀 분화)를 순서대로 나누는
것은 현실과 맞지 않는다. 실제로는:

- 입찰 상황이 상황판에 뜨는 순간부터 **영업/IT/예산 3팀의 업무가 동시에 발생**한다.
- 각 팀은 **자기 파트만** "기관 인텔리전스 에이전트"(가칭)와 **대화하며** 초안을
  완성해간다 — 1회성 생성이 아니라 멀티턴 대화.
- 팀 내부에도 승인 절차(1차 본인 → 2차 팀장)가 있고, 영업팀의 "참여/미참여/보류" 결정에는
  별도의 3단계 결재(1차 실무자 → 2차 팀장 → 3차 부장)가 있다.
- 팀 간에는 **서로의 진척도를 볼 수 있어야** 한다(상황판에 퍼즐조각처럼 채워지는 시각화).

이 문서는 상위 스펙 §④의 5·6단계 행을 다음 하나의 흐름으로 대체하고, 그에 필요한 데이터
모델과 API 계약을 구체화한다. 7단계(취합→디자이너)·8단계(검토)·9단계(제출)는 상위 스펙
그대로 유지하며, 본 설계의 "3개 Task 완료 후 최종 결재"가 7단계 진입 조건이 된다.

**범위 밖**
- 1~3단계(입찰현황 파악·RFI 공시)의 실시간 크롤링/감지 로직 자체 — 상위 스펙과 동일하게
  범위 밖이며, 본 설계는 그 결과(상황판에 입찰건이 나타나는 것)를 입력으로 받는다.
- `agent/`의 `content_writer_node` 등 기존 5개 노드의 내부 로직 재구현 — 이 노드들은 그대로
  재사용하고, 이 문서는 그 위에 얹히는 대화형 레이어(Task/Message)만 다룬다.
- Next.js 프론트엔드 구현 자체(상위 스펙 sub-project 5) — 이 문서는 프론트가 호출할 API
  계약까지만 정의한다.

---

## ② 트리거 흐름

```
[상황 감지 — 범위 밖, DMZ sub-project 1~3의 산출물로 가정]
  · 예상 감지: registry의 contract_end/term 기반 배치가 "슬슬 입찰 시기"를 추정
    → 상황판에 status=예상 카드 등록
  · 확정 감지: DMZ RFI 공시 확인 → status=확정 으로 갱신
      │
      ▼
[배치 동기화 잡] status=예상 카드는 확정될 때까지 주기적으로 일정을 재확인·갱신
  (BidCase.last_synced_at 갱신) — 상세 배치 구현은 본 설계 범위 밖, BidCase 필드만 정의
      │
      ▼
[영업팀 3단계 결재] 참여 / 미참여 / 보류
  1차(영업실무자) 의견 제출 → 2차(영업팀장) 승인 → 3차(영업부장) 최종승인
  · 어느 단계든 반려·미참여·보류 선택 시 그 시점에서 종료(사유 기록, participation_status
    확정)
  · status=예상 단계에서도 결재 착수 가능 — 배치 갱신(일정 확정)과 참여결재는 서로 독립적
    으로 진행된다
      │
      ▼ (3차까지 "참여" 확정된 경우만)
영업/IT/예산 Task 3개 동시 생성(status=대기) + 각 담당자에게 알림
      │
      ▼
[각 담당자 화면] "나에게 할당된 입찰건" 목록(GET /bidcases?team=..&assignee=me)에 표시
      │
      ▼
담당자가 자기 Task를 열어 "기관 인텔리전스 에이전트"와 채팅(SSE 스트리밍)하며 초안 작성
      │
      ▼
본인 제출(1차, POST /tasks/{id}/submit)
      → 팀장 승인(2차, POST /tasks/{id}/approve)
      → 상황판의 해당 팀 퍼즐조각이 "완료"로 채워짐
  · 팀 간 진척도는 상호 열람 가능 — 쓰기(채팅·제출·승인)는 담당 팀만, 읽기는 전체 공개
      │
      ▼
3개 Task 모두 2차완료 → 최종 결재자에게 통지 → 승인(POST /bidcases/{id}/finalize)
      → 기획안 확정 → 상위 스펙 7단계(취합/디자이너 제출)로 진입
```

### 승인 체인이 두 군데로 나뉘는 이유

"참여결정"(BidCase 단위, 1~3차)과 "Task 작성물 결재"(Task 단위, 1~2차)는 성격이 다른
결재라 하나로 통합하지 않는다:

- 참여결정은 **영업 조직의 의사결정** — 입찰에 들어갈지 말지를 결정하며, 결정 주체가 항상
  영업 라인(실무자→팀장→부장)으로 고정된다.
- Task 결재는 **산출물의 품질 승인** — 3개 팀(영업/IT/예산) 각각의 담당 라인이 다르고,
  결재자는 "그 Task를 쓴 사람의 팀장"으로 팀마다 달라진다.

두 체인을 하나로 합치면 팀이 다른데도 같은 승인 로직을 억지로 공유하게 되어 오히려 코드가
복잡해진다.

---

## ③ 데이터 모델

기존 `backend/`의 `institutions` 테이블(sub-project 0, 이미 구현됨)은 그대로 두고, 아래
3개 테이블을 신규로 추가한다.

### BidCase (입찰 건)

기관(`institutions`)과 별개로 둔다 — 같은 기관이 여러 번(재입찰 등) 입찰건을 가질 수
있기 때문이다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `bid_case_id` | TEXT PK | 신규 발급 슬러그 |
| `institution_id` | TEXT FK → institutions | |
| `schedule_confidence` | TEXT | `예상` \| `확정` |
| `expected_date` | TEXT (nullable) | 예상 시점(`예상` 상태일 때) |
| `confirmed_date` | TEXT (nullable) | 확정 시점(`확정` 상태일 때) |
| `last_synced_at` | TEXT | 배치 동기화가 마지막으로 갱신한 시각 |
| `participation_status` | TEXT | `검토중` \| `참여확정` \| `미참여확정` \| `보류` |
| `participation_decision` | TEXT (JSON) | `[{tier:1|2|3, role, by, at, choice, comment}]` |

### Task (BidCase당 3개: 영업/IT/예산)

| 필드 | 타입 | 설명 |
|---|---|---|
| `task_id` | TEXT PK | 신규 발급 슬러그 |
| `bid_case_id` | TEXT FK → bid_cases | |
| `team` | TEXT | `영업` \| `IT` \| `예산` |
| `status` | TEXT | `대기` \| `작성중` \| `1차완료` \| `2차완료` |
| `progress_pct` | INTEGER | 0~100, 상황판 퍼즐조각 진행률 표시용 |
| `draft_content` | TEXT | 현재 초안 본문(에이전트가 대화 중 갱신) |
| `assignee` | TEXT | 1차 담당자(본인) |
| `approver` | TEXT | 2차 담당자(해당 팀장) |

`bid_case_id` + `team`은 유일해야 한다(한 입찰건당 팀별로 Task 1개).

### Message (Task당 다수 — 채팅 이력)

| 필드 | 타입 | 설명 |
|---|---|---|
| `message_id` | TEXT PK | 신규 발급 슬러그 |
| `task_id` | TEXT FK → tasks | |
| `role` | TEXT | `user` \| `agent` |
| `content` | TEXT | 메시지 본문 |
| `created_at` | TEXT | ISO 8601 |

---

## ④ API 엔드포인트 계약

```
POST /bidcases/{id}/participation-decisions
  body: {tier: 1|2|3, role, by, choice: "참여"|"미참여"|"보류", comment?}
  → tier 순서를 어기면 400. 3차까지 "참여" choice가 쌓이면 서버가 자동으로
    participation_status="참여확정"으로 전환하고 Task 3개(영업/IT/예산)를 생성한다.
    "미참여"|"보류"가 어느 tier에서든 제출되면 그 즉시 participation_status를
    미참여확정|보류로 확정하고 이후 tier 제출은 409.

GET  /bidcases/{id}
  → BidCase 필드 전체 + tasks: [{team, status, progress_pct, assignee, approver}] 배열.
    팀 소속과 무관하게 누구나 조회 가능(읽기 공개 원칙).

GET  /bidcases?team={team}&assignee={user}
  → 특정 담당자에게 할당된 BidCase+Task 목록. "내 화면" 데이터 소스.

GET  /tasks/{task_id}
  → Task 필드 전체 + messages: [{role, content, created_at}] 대화 이력 전체.

POST /tasks/{task_id}/messages
  body: {content}
  → text/event-stream. 사용자 메시지를 저장한 뒤, 에이전트 응답을 토큰 단위로 스트리밍하고
    완료 시 draft_content를 갱신·저장한다. status가 `대기`였다면 첫 메시지 전송 시
    `작성중`으로 전환.

POST /tasks/{task_id}/submit
  → 호출자가 assignee와 일치해야 함(불일치 시 403). status: 대기|작성중 → 1차완료.

POST /tasks/{task_id}/approve
  body: {approved: bool, comment?}
  → 호출자가 approver와 일치해야 함. approved=true → 2차완료.
    approved=false → 작성중으로 되돌리고 comment를 Message(role=agent 아님, 시스템 메모로
    기록)에 남긴다.

POST /bidcases/{id}/finalize
  body: {approved: bool, comment?}
  → 3개 Task가 모두 2차완료가 아니면 409. approved=true → 기획안 확정, 상위 스펙 7단계
    진입 트리거. approved=false → 지정된 Task만(또는 전체) 작성중으로 되돌림.
```

이 엔드포인트들은 상위 E2E 스펙 §④가 스케치만 해두었던 `/advance`·`/status`·`/checkpoint`를
대체한다 — 그 3개는 "하나의 stage를 하나의 API로" 가정했지만, 실제로는 팀별로 나뉜 Task
단위 결재가 필요하다는 것이 이번 설계로 확인됐기 때문이다.

---

## ⑤ 에이전트 연동

`POST /tasks/{task_id}/messages`가 호출하는 "기관 인텔리전스 에이전트"는 신규 구현이 아니라
기존 `agent/nodes/content_writer.py`를 대화형으로 감싸는 어댑터다:

- 팀(`영업`/`IT`/`예산`)에 따라 상위 스펙 §⑤의 라우팅 표(영업→`spec/`+`bank_ideas_draft.txt`,
  IT→`plan/02_IT디지털기획`, 예산→`plan/03_금전적지원`)로 근거 코퍼스를 고정한다.
- 콘텐츠 생성 원칙(본문은 코퍼스에서 조립, LLM은 문장 다듬기만)은 상위 스펙 §⑤ 그대로
  유지 — 자유생성 할루시네이션 리스크를 늘리지 않는다.
- LLM 백엔드는 상위 스펙 §⑥의 어댑터(`agent/llm.py`, `LLM_BASE_URL`/`LLM_MODEL` 환경변수)를
  그대로 사용한다.
- 완전 신규 기관(`giganlist/`에 없는 institution_id)의 경우, Task가 생성되기 전에
  `spec_research_node`가 비동기 백그라운드로 코퍼스를 새로 수집해야 한다 — 이 노드는
  BidCase 생성 트리거 시점에 한 번 실행되며, 진행 상태는 `GET /bidcases/{id}`의
  `schedule_confidence`/`last_synced_at`과는 별도로 BidCase에 `research_status`
  (`대기`|`진행중`|`완료`|`실패`) 필드를 추가해 폴링한다. 완료 전까지 Task 3개는 생성되지
  않는다.

---

## ⑥ 에러 처리 / 동시성

- tier 순서 위반(1차 없이 2차 제출 등), assignee/approver 불일치, finalize 전 Task 미완료
  등은 모두 4xx로 명시적 응답 — 상태 전이는 서버가 강제하고 프론트는 현재 상태를 반영만
  한다.
- `POST /tasks/{task_id}/messages` 스트리밍 중 연결이 끊기면 이미 저장된 사용자 메시지는
  유지되고, 에이전트 응답은 부분 저장하지 않는다(재시도 시 새 응답 생성) — draft_content는
  스트림이 끝까지 완료됐을 때만 갱신한다.
- 두 명이 같은 Task에 동시에 메시지를 보내는 경우(같은 담당자가 다른 탭을 열어둔 경우 등)는
  본 설계에서 잠금을 걸지 않는다 — 메시지는 append-only라 유실 없이 순서대로 쌓이고,
  draft_content 갱신은 마지막에 완료된 스트림이 이긴다(last-write-wins). 실사용에서 문제가
  확인되면 후속 설계에서 낙관적 잠금을 추가한다.

---

## ⑦ 상위 스펙과의 관계 요약

| 상위 스펙 §④ | 본 설계 |
|---|---|
| 5 제안서 기획(🛑 spec 승인, 단일 draft) | 삭제 — 3팀 Task 생성 시점부터 병렬 시작 |
| 6 세부기획(3팀, 체크포인트 없음) | Task/Message + 팀별 1차/2차 결재로 대체 |
| (신규) 참여 여부 결정 | BidCase 참여결정 3단계(1~3차)로 신설 |
| 7 취합(디자이너) | 유지 — `finalize` 승인이 진입 트리거 |
| 8 검토(🛑), 9 제출 | 유지, 본 설계 범위 밖 |

---

## 스펙 자체 검증 메모

- 플레이스홀더(TBD 등) 없음.
- ②(트리거 흐름)·③(데이터 모델)·④(API)가 서로 모순 없음: participation_status 값 4종이
  ②·③·④에서 동일하게 쓰이고, Task status 4종도 동일하게 유지됨.
- 상위 스펙과의 충돌 지점(5·6단계, `/advance`·`/status`·`/checkpoint`)을 §⑦에 명시적으로
  표로 정리해 어느 부분이 대체되고 어느 부분이 유지되는지 중의성 없앰.
- 범위 밖 항목(①)을 명시해 이번 설계가 크롤링·기존 5개 노드 내부 로직·Next.js 구현까지
  포함한다는 오해를 방지.
