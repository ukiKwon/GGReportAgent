# NEXT — 미해결 과제 추적

이 파일은 `handoff/YYYY-MM-DD_summary.md` 파일들(세션 섹션 단위로 append-only, 기존 세션
섹션은 절대 수정하지 않음)에 흩어진 "다음 세션에서 할 일" 항목 중 **아직 해소되지 않은 것만**
모아두는 상시 갱신 파일이다.

## 사용 규칙

- **handoff summary는 세션 섹션 단위 append-only.** 하루에 한 파일
  `handoff/YYYY-MM-DD_summary.md`을 쓰고, 같은 날 여러 세션이면 그 파일 안에
  `## Session HH:mm` 섹션을 시간순으로 이어붙인다. 기존에 적힌 세션 섹션은 절대 고치거나
  지우지 않는다.
- 세션이 시작되면 이 파일을 읽고, 여기 열려 있는 항목 중 이번 세션에서 다룰 것을 확인한다.
- 세션이 어떤 항목을 **완전히 해소**하면:
  1. 이 파일(NEXT.md)에서 그 항목을 제거(또는 "해소됨" 섹션으로 이동 후 다음 정리 때 삭제)한다.
  2. 그 사실을 **이번 세션의 handoff summary 파일에도 명시적으로 기록**한다
     (예: "NEXT.md의 'Minor 리뷰 사항 반영' 항목 해소함 — 커밋 abcd123").
- 항목이 **진행 중이지만 아직 안 끝났으면** 지우지 않고 남겨둔다 — 상태만 갱신
  (예: 담당 워크트리/브랜치, 어디까지 했는지)해서 다음 세션이 이어받게 한다.
- 새로 발생한 미해결 항목은 이 파일에 바로 추가한다(출처 handoff 파일명과 함께).

---

## 열린 항목

### 1. `agent/` 오케스트레이션 패키지 구현 — 진행 중
- **출처**: `2026-07-20_1524_summary.md`(계획 필요) → `2026-07-20_1620_summary.md`(착수, 중단)
- **상태**: 워크트리 `C:\claude_workspace\GGReportAgent\.claude\worktrees\rfp-proposal-agent`
  (브랜치 `worktree-rfp-proposal-agent`)에서 subagent-driven-development로 진행 중.
  Task 1~5 완료(리뷰 통과), **Task 6~10 남음**. 계획 파일:
  `docs/superpowers/plans/2026-07-20-rfp-proposal-agent.md`(main에 커밋됨, `8857132`).
- **재개 방법**: `git worktree list`로 워크트리 존재 확인 → 존재하면 해당 경로로 재진입 후
  `.superpowers/sdd/progress.md`(워크트리 내부, git 미추적) 읽고 Task 6부터 이어서 진행.
  세부 내용은 `2026-07-20_1620_summary.md` 참고.
- **주의**: Task 2에서 서브에이전트가 실수로 main에 직접 커밋한 사고가 있었음(복구됨) —
  향후 디스패치 시 "워크트리 절대경로에서만 작업, 커밋 전 `git rev-parse --show-toplevel`
  확인" 지시 필수.

### 2. 최종 리뷰 Minor 사항 2건 반영 여부 (rfp-locate/institution-corpus-format 스킬)
- **출처**: `2026-07-20_1524_summary.md`
- **상태**: 선택/낮은 우선순위, 아직 미반영.
- 내용:
  - `extract_text.py`에 `sys.stdout.buffer.write(UTF-8)` 사용 이유를 설명하는 주석 한 줄 추가
  - `render_pages.py`의 `fitz.open()`을 `with` 문으로 감싸기

### 3. `.claude/worktrees/skill-essential` 물리 디렉토리 잔여
- **출처**: `2026-07-20_1524_summary.md`, `2026-07-20_1620_summary.md`(재확인, 여전히 잔여)
- **상태**: git worktree 레지스트리에서는 이미 제거됨(`git worktree list`에 안 나타남),
  Windows 파일 잠금으로 물리 삭제만 실패. 무해하나 잠금 풀리면
  `rm -rf .claude/worktrees/skill-essential`로 정리 가능.

### 4. Task 5(pptx_builder) 리뷰의 미반영 Minor 사항
- **출처**: `2026-07-20_1620_summary.md`
- **상태**: 수정 불필요 판정, 참고용으로만 남김.
- 내용:
  - 섹션 슬라이드가 "근거자료: ..." 인용 텍스트를 실제로 렌더링하는지 검증하는 테스트 없음
  - `scoring_table`이 빈 리스트일 때 `_add_scoring_table_slide`가 `IndexError` 가능성

### 5. 25개 자치구 배치 프로젝트 — 미완결 10/20 재개
- **출처**: `handoff_old/NEXT.md`(2026-07-20 기준, git 미추적 상태로 남아있던 별도
  작업 스레드 — 5개구 KB 제안 프로젝트/현재 agent 오케스트레이션 작업과는 무관한
  독립 프로젝트. 원본 파일은 이 항목에 병합 후 삭제됨. 세션 체크포인트 원본은
  `handoff/20260719_1142.md`, `20260719_1151.md`, `20260719_1157.md`,
  `20260719_handoff01.md`, `20260719_handoff02.md`, `20260720_완료처리.md`,
  `20260720_2135.md`로 함께 이동돼 있음).
- **프로젝트 개요**: 서울시 25개 자치구 전체에 대해 동일한 3종 산출물(`spec/`, `plan/`,
  `bank_idea_draft.txt`)을 작성. 완료 10/20(종로78, 중구77, 용산76, 성동76, 중랑81,
  성북76, 은평74, 강북72, 서대문73, 마포80 — 신뢰도 점수), 평균 약 204,420
  tokens/구. 미완결 10/20(순서대로): 양천, 강서, 구로, 금천, 영등포, 관악, 서초,
  강남, 송파, 강동 — 산출물 폴더(`{구영문명}/spec,plan,bank_idea_draft.txt`)는
  git 미추적 상태로 디스크에만 존재.
- **재개 방법(중요 제약)**: 반드시 **2-parallel**로 디스패치(4-parallel/20-parallel
  전체 동시 디스패치는 세션 한도 초과로 전멸한 이력 2건 있음, 2026-07-19/20).
  세션 한도 실패 시 즉시 재시도하지 말고 해당 구 task를 pending으로 되돌린 뒤
  사용자의 명시적 재개 지시를 기다릴 것. 구별 디스패치는 Agent 도구
  (subagent_type: general-purpose)로 자기완결적 프롬프트 사용, 완료된 10개 구와
  동일한 파일 구조 규격(`spec/` 8~10개, `plan/` 정확히 6개, `bank_idea_draft.txt`
  5개 카테고리) 준수. 프롬프트 템플릿·구별 랜드마크 참고 목록·조작 금지 원칙 등
  세부 사항은 `handoff/20260720_완료처리.md` 및 이동된 대시보드 SDD 체크포인트
  파일들 참고.
- **참고용 완성 예시**: `jongno/spec/`, `jongno/plan/`, `jongno/bank_idea_draft.txt`.
- **비고**: 프로젝트 루트가 2026-07-20에 `gigan`에서 `GGReportAgent`로 폴더명 변경됨
  (robocopy로 전체 복사 완료). 15분 주기 모니터링 cron(ID `a9a58f91`, session-only,
  생성 후 7일 자동만료)이 있었으나 새 세션에서는 유지되지 않을 수 있음 — 계속
  모니터링이 필요하면 CronCreate로 재생성 필요.

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

- ~~브레인스토밍 재진입해 agent/ 패키지 스펙 확정~~ — `2026-07-20_1620_summary.md`에서
  스펙 작성 및 계획(`2026-07-20-rfp-proposal-agent.md`) 완료로 해소.
