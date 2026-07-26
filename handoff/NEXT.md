# NEXT — 미해결 과제 추적

이 파일은 `handoff/YYYY-MM-DD_summary.md` 파일들(세션 섹션 단위로 append-only, 기존 세션
섹션은 절대 수정하지 않음)에 흩어진 "다음 세션에서 할 일" 항목 중 **아직 해소되지 않은 것만**
모아두는 상시 갱신 파일이다.

## 사용 규칙

- **handoff summary는 세션 섹션 단위 append-only.** 하루에 한 파일
  `handoff/YYYY-MM-DD_summary.md`을 쓰고, 같은 날 여러 세션이면 그 파일 안에
  `## Session HH:mm` 섹션을 시간순으로 이어붙인다. 기존에 적힌 세션 섹션은 절대 고치거나
  지우지 않는다.
- **관련성 우선 원칙 (A안).** SessionStart 훅이 자동 주입하는 "최신 summary"는 파일명
  정렬로 고른 *최근 활동 참고*일 뿐, 다음 세션이 실제로 다룰 일(거의 항상 이 NEXT.md의
  열린 항목이며, 그 항목의 출처는 훨씬 과거 summary일 수 있음)과는 무관하다. 따라서
  **이 파일이 진짜 이월 기억장치**이고, 열린 항목은 각자 자기완결적이어야 한다. 각 열린
  항목은 반드시 **(1) 출처 summary 참조**(`YYYY-MM-DD_summary.md`의 `## Session HH:mm`
  섹션까지)와 **(2) 그 summary를 열지 않아도 재개 가능한 완결 정보**(워크트리/브랜치/
  어디까지/다음 단계)를 담는다. (1)은 (2)를 다 담기 어려울 때의 폴백이지, 아는 정보를
  생략하는 핑계가 아니다.
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

### 1. 25개 자치구 배치 프로젝트 — 미완결 2/20(송파·강동) 재개
- **출처**: `handoff_old/NEXT.md`(2026-07-20 기준, git 미추적 상태로 남아있던 별도
  작업 스레드 — 5개구 KB 제안 프로젝트/현재 agent 오케스트레이션 작업과는 무관한
  독립 프로젝트. 원본 파일은 이 항목에 병합 후 삭제됨. 세션 체크포인트 원본은
  `handoff/20260719_1142.md`, `20260719_1151.md`, `20260719_1157.md`,
  `20260719_handoff01.md`, `20260719_handoff02.md`, `20260720_완료처리.md`,
  `20260720_2135.md`로 함께 이동돼 있음 — 이 파일들 자체는 `2026-07-19_summary.md`/
  `2026-07-20_summary.md`로 병합된 뒤 삭제되어 더 이상 존재하지 않음, 위 두 summary
  파일에 내용이 온전히 보존돼 있음).
  → `2026-07-21` 세션에서 이어서 진행, 12/20까지 완료. 이후 별도 세션에서 구로/금천
  2건 추가 완료, 14/20까지 진행. 이후 `2026-07-21` 세션(오후)에서 영등포/관악 2건
  추가 완료, 16/20까지 진행. 이후 `2026-07-22` 세션(10분 타임박스, 1건만 디스패치)에서
  서초 1건 추가 완료, 17/20까지 진행. 이후 `2026-07-26` 세션(`## Session 08:20`)에서
  강남 1건 추가 완료, **18/20**까지 진행.
- **프로젝트 개요**: 서울시 25개 자치구 전체에 대해 동일한 3종 산출물(`spec/`, `plan/`,
  `bank_ideas_draft.txt`)을 작성. **완료 18/20**(종로78, 중구77, 용산76, 성동76,
  중랑81, 성북76, 은평74, 강북72, 서대문73, 마포80, 양천84, 강서80, 구로84, 금천84,
  영등포81, 관악81, 서초84, **강남79** — 신뢰도 점수).
  미완결 2/20(순서대로): 송파, 강동 —
  산출물 폴더(`giganlist/{구영문명}/spec,plan,bank_ideas_draft.txt`)는 각 세션에서
  main에 git commit·push됨(이전에는 미추적 상태였음 — 아래 "비고" 참고).
- **강남 완료 이력**: `2026-07-26` 세션(`## Session 08:20`, 07-25 밤 시작해 자정 넘김)에서
  **1건 단독 디스패치**(사용자 지시로 2-parallel 제약 해제 — 아래 "재개 방법" 참고). 산출물
  검증 통과 — spec 10개(`00_인덱스`~`09_민원게시판_2026년정리`, 강남구 자체 발표 5개 분야
  사용: 주민생활/일자리경제/복지보육교육/문화체육/도시환경교통)/plan 6개/
  bank_ideas_draft.txt(복수형, 5축 10개 아이디어). **신뢰도 79/100** — 서초·구로·금천(84)보다
  낮고, 예산 비공개율이 주 원인. 인용 수치(예산확인율 7.1%, 교차확인 60.7/30.4/8.9%, 민원
  안전교통 47.4%, 차액 89.9%)는 컨트롤러가 spec 원문과 직접 대조해 일치 확인함.
  특이사항: **총예산 1조 4,804억 중 사업별 예산 확인은 4건(7.1%)뿐 → 차액 13,308억(89.9%)
  확인 불가**를 명시(기금 400억 제외 시 92.6%로 두 계산 병기), **사업 건수 강남구 발표 57건
  vs 조사 확인 56건** 불일치를 세 개 분류체계 병용(보도자료 5분야/홈페이지 3탭/민원통계
  9분야) 탓으로 추정해 병기, 2025.9.24부터 국민신문고 연계로 **2026년 개별 민원 원문 열람이
  구조적으로 불가**. 자체 검증에서 허위 인용 1건(plan/01 "기획예산과 spec/01 확인됨" → spec에
  근거 없음, 정정)과 과장 서술 1건(plan/02 IT-3 "처리됨" vs 원문 "교부 예정", 등급 A→B)을
  잡아냄. 은행 관점 최대 발견: 구 대출이자 지원사업 2026년 협약 금융기관 7곳에 **KB 미포함**.
  **에이전트가 2번 중단됨(둘 다 코드/데이터 문제 아님)** — (1) 이전 CLI 프로세스 종료로 stopped
  (파일 0개 생성 상태), (2) 세션 한도(reset 2:30am) API 에러(spec 01~08까지 남아있었음). 둘 다
  새로 띄우지 않고 `SendMessage`로 transcript 재개해 조사 컨텍스트를 보존함. **다음 세션은
  송파부터 재개.**
- **서초 완료 이력**: `2026-07-22` 세션에서 10분 타임박스로 1건만 단독 디스패치(2-parallel
  제약이 아니라 사용자가 시간 제한을 요청해 단건으로 진행). 산출물 검증 통과 — spec 9개
  (`00_인덱스`~`08_민원게시판_2026년정리`, 서초구 자체 발표 "2026년 달라지는 구정 47건"
  분류를 그대로 사용: 주민생활/복지지원/보육과교육/환경/도시인프라)/plan 6개/
  bank_ideas_draft.txt(복수형). 신뢰도 84/100. 특이사항: 홈페이지 교차확인 27건 중
  확인됨 11%·부분확인 11%·확인안됨 78%(예산 확인 사업 0건, 종로구보다 투명성 낮음),
  민원게시판이 2025.6.25 국민신문고로 통합 전환되어 담당부서 개별표기가 사라진 구조적
  차이를 명시, 작성 중 발견된 plan/03 FN-3의 spec 인용 오류(spec/02→spec/03)를 검증
  단계에서 정정, FN-1(SOC 인접지역-메이플자이 민원 인과관계 미확인)을 타당성 "중"으로
  감점. (이 항목이 가리키던 "다음 세션은 강남" 은 `2026-07-26` 세션에서 완료됨.)
- **구로/금천 완료 이력**: 별도 세션에서 구로/금천 2건을 2-parallel로 디스패치, 둘 다
  완료. 산출물 검증 통과 — 구로 spec 8개(4대 실행전략 구조라 06번 미사용, 정상)/plan 6개/
  bank_ideas_draft.txt(복수형), 금천 spec 9개/plan 6개/bank_ideas_draft.txt(복수형).
  두 구 모두 신뢰도 84/100. 특이사항: **구로는 예산 확인율 0/21**(개별 사업 예산 전부
  비공개, 서울재정포털도 데이터 없음 — 조작 없이 명시), 민원게시판 JS 렌더링으로 미확인.
  **금천은 분야합 5,787억 ≠ 총액 7,511억**(차액 1,724억을 인건비/기금 등 미분류로 명시),
  부서명 전부 추정 표기.
- **영등포/관악 완료 이력**: `2026-07-21` 오후 세션에서 2-parallel로 디스패치, 둘 다
  완료. 산출물 검증 통과 — 영등포 spec 8개/plan 6개/bank_ideas_draft.txt(복수형, 5축
  15개 아이디어), 관악 spec 10개/plan 6개/bank_ideas_draft.txt(복수형, 5축 16개
  아이디어). 두 구 모두 신뢰도 81/100. 특이사항: **영등포**는 초안 작성 에이전트가
  bank_ideas_draft.txt에 실존 브랜드명("우리은행 영등포구청지점")을 2곳 썼던 것을
  자체 검증 단계에서 발견해 일반 표현으로 직접 수정, IT-3 인용 수치 불일치(6개 구역 vs
  7건)로 감점, 3대분야 예산합(4,757억)이 총예산(9,958억)의 47.8%에 그쳐 미분류 비중을
  명시. **관악**은 plan/05 검증에서 실제 결함 3건을 지적(IT-4의 "확인안됨→역할분담
  불투명"이라는 논리적 비약이 institution-corpus-format 원칙 위반이라 최대 감점, IT-3의
  낙관적 서술, KPI 임의 수치 미구분) — 사용자 지시로 이 3건 전부 해당 plan 파일에서
  직접 수정 완료(`plan/00`, `plan/02`, `plan/03`, `plan/04`). **다음 세션은 서초부터
  재개.**
- **재개 방법(중요 제약)**: **1개 구씩 순차 디스패치** — `2026-07-26` 세션에서 사용자가
  토큰 소모량을 고려해 기존 "반드시 2-parallel" 제약을 **1건씩**으로 교체 지시함(4-parallel/
  20-parallel 전체 동시 디스패치가 세션 한도 초과로 전멸한 이력 2건이 있으니 병렬 확대는
  여전히 금지). **각 구가 끝날 때마다 마무리(handoff 갱신+커밋+push)하고 다음 구 진행 여부를
  사용자에게 확인**할 것. 마무리 범위는 그 세션 작업분으로 한정(다른 세션 진행분 커밋 금지).
  **프롬프트에 "파일 하나 완성할 때마다 즉시 디스크에 쓰라(중단돼도 진행분 보존)"를 반드시
  넣을 것** — 강남에서 2번 중단을 겪으며 실효성이 확인됨. 중단 시엔 새 에이전트를 띄우지 말고
  `SendMessage`로 transcript 재개하되, **디스크 실제 상태(이미 생성된 파일 목록)를 명시**해
  재조사를 막을 것. 세션 한도 실패 시 즉시 재시도하지 말고 리셋 시각 경과 확인 후
  사용자의 명시적 재개 지시를 기다릴 것. 구별 디스패치는 Agent 도구
  (subagent_type: general-purpose)로 자기완결적 프롬프트 사용, `institution-corpus-format`
  스킬 규격(spec 8~10개 파일, plan 정확히 6개 파일, **`bank_ideas_draft.txt`(복수형!)**
  5개 축)을 프롬프트에 직접 명시하고 `giganlist/jongno/`를 참고 예시로 지시. 조작 금지 원칙(데이터
  날조 금지, 수치 불일치는 병기, hallucination 의심 시 재조회로 검증)도 프롬프트에
  포함할 것 — 2026-07-21 세션에서 실제 사용한 프롬프트 전문은 그 세션의
  `2026-07-21_summary.md` 참고.
- **중요 (2026-07-21 밤 세션에서 경로 변경됨)**: 완료된 12개구(종로~강서)는 원래
  루트(`{구영문명}/`)에 있었으나, `agent/` 패키지의 giganlist 구조와 통일하기 위해
  전부 `giganlist/{구영문명}/`으로 이동됨(커밋 `e1335d0`). **다음에 완료할 구
  (영등포부터)는 산출물을 처음부터 `giganlist/{구영문명}/spec,plan,bank_ideas_draft.txt`
  경로로 바로 생성할 것** — 디스패치 프롬프트의 참고 예시 경로도
  `giganlist/jongno/`로 갱신해서 지시할 것(이전 세션 프롬프트 전문에 `jongno/`로
  적혀 있었다면 그대로 복사하지 말고 경로를 고쳐서 사용).
- **중요 (2026-07-21 밤 세션에서 파일명도 통일됨)**: 12개구는 원래 산출물 파일명이
  `bank_idea_draft.txt`(단수형)였으나, 원래 5개구/`institution-corpus-format`
  스킬 규격이 `bank_ideas_draft.txt`(복수형)이므로 전부 복수형으로 rename 통일함
  (커밋 `274eb7f`). **다음에 완료할 구(영등포부터)도 처음부터 `bank_ideas_draft.txt`
  (복수형)로 파일명을 생성할 것** — 디스패치 프롬프트에 파일명을 명시할 때 복수형임을
  강조해서 지시.
- **참고용 완성 예시**: `giganlist/jongno/spec/`, `giganlist/jongno/plan/`,
  `giganlist/jongno/bank_ideas_draft.txt`.
- **⚠️ 커밋 전 브랜치 확인 (구 항목 5에서 이관, 여전히 유효)**: 이 리포는 여러 세션이
  **같은 워킹트리를 공유**한다. 2026-07-26 세션 시작 시 HEAD가
  `feature/dashboard-enhancements`(다른 세션 브랜치)에 있어서 강남 커밋이 거기 얹혔다가
  main으로 옮겨진 사고가 있었다. **커밋 전 반드시 `git branch --show-current`로 브랜치를
  확인할 것.** (이 주의사항이 붙어 있던 "미push 커밋 5개" 항목 자체는 2026-07-27 세션에서
  해소 확인되어 제거됨 — 아래 "해소된 항목" 참고.)
- **비고**: 프로젝트 루트가 2026-07-20에 `gigan`에서 `GGReportAgent`로 폴더명 변경됨
  (robocopy로 전체 복사 완료). 15분 주기 모니터링 cron(ID `a9a58f91`, session-only,
  생성 후 7일 자동만료)은 세션 종료로 만료됨 — 계속 모니터링이 필요하면 CronCreate로
  재생성 필요. 완료된 12개구 산출물은 더 이상 git 미추적 상태가 아님(`2026-07-21`
  세션에서 커밋됨) — 다음 세션은 이 사실을 전제로 진행할 것.

### 2. `agent/` RFP 팀 확장 구현 — Task 1·2 완료, Task 3(`spec_research_node`)부터 재개
- **출처**: `2026-07-21_summary.md` "Session 오후 4"(스펙·계획 작성), "Session 오후 5"
  (계획 실행 착수, Task 1·2 구현).
- **배경**: 기존 `agent/` 파이프라인(PR #1로 병합된 8-Task 구현)은 "RFP·spec이 이미
  있다"는 전제로 시작해 `giganlist/{구}/spec/`을 읽기만 함 — RFP 탐색 단계도, spec/plan/
  bank_ideas_draft를 새로 만드는 단계도 없었음. 이를 채우기 위해 "기관명만 입력하면
  RFP 탐색 → (신규 기관이면) spec/plan/bank_ideas_draft 자동 생성 → 보고서 → PPT"까지
  자동화하는 확장 가능한 단일 파이프라인으로 설계. 스펙:
  `agent/docs/superpowers/specs/2026-07-21-rfp-agent-team-design.md`(커밋 `47e3ee8`,
  main에 push됨). 계획: `agent/docs/superpowers/plans/2026-07-21-rfp-agent-team.md`
  (커밋 `343372c`, main에 push됨) — 7-Task TDD 계획.
- **설계 요지**: 기존 4개 노드(`institution_match`/`content_writer`/`verification`/
  `pptx_builder`)는 변경 없이 재사용, 새 노드 3개(`rfp_locate_node`/`spec_research_node`/
  `plan_writer_node`)만 추가. 확장성은 `institution_match_node`가 채우는
  `matched_district`/`institution_spec_dir` 필드 유무로 파이프라인이 스스로 분기 —
  지역별 분기 코드 추가 불필요. 체크포인트는 spec 생성 직후 1곳뿐(이후 자동 진행).
  실행은 `python -m agent.main "<기관명>"` CLI. 새 노드들은 **Claude Agent SDK로
  서브에이전트를 호출**하는 방식으로 구현(langchain tool-calling 확장이 아님) —
  계획 수립 중 사용자와 확정. 나라장터 상시 크롤링/모니터링은 범위 밖으로 명시적 제외.
- **구현 착수**: `superpowers:subagent-driven-development`로 진행 중. 워크트리
  `.claude/worktrees/rfp-agent-team`(브랜치 `worktree-rfp-agent-team`, `EnterWorktree`로
  생성)에서 작업. supervisor 노드는 별도로 만들지 않기로 결정(컨트롤러 세션 자신이
  Task별 디스패치·리뷰를 수행하는 것으로 충분, 파이프라인 분기 자체가 상태 필드
  체크만으로 단순함).
- **완료 (Task 1, 2)**:
  - Task 1: `run_subagent` 헬퍼(`agent/tools/subagent_runner.py`) — `claude-agent-sdk`
    (`0.2.124`) 설치·실제 API 구조 확인 후 구현. 커밋 `1504d8e`. 리뷰 Spec ✅/Quality
    Approved(Minor: 미사용 import, 안 막음).
  - Task 2: `rfp_locate_node`(`agent/nodes/rfp_locate.py`) — 기존 `rfp_analysis_node`가
    읽는 `report_new/{institution}/{rfp_scoring.json, rfp_text.txt}` 경로 규약을 정확히
    맞춰 구현, 파일 부재 시 `FileNotFoundError`. 커밋 `0e759e7`. 리뷰 Spec ✅/Quality
    Approved(Minor: "파일 하나만 존재" 케이스 테스트 누락, `or` 로직 자체는 정확).
  - 두 Task 모두 Minor만 있어 fix 라운드 없이 통과, 워크트리 안
    `.superpowers/sdd/progress.md`(git-ignored, 커밋 대상 아님)에 진행상황 기록됨.
- **미완료 (Task 3~7)**: `spec_research_node`, `plan_writer_node`, CLI 검토
  체크포인트(`confirm_spec_review`), `agent/main.py` 전체 파이프라인 CLI, end-to-end
  검증 — 전부 미착수.
- **재개 방법**: `.claude/worktrees/rfp-agent-team`(브랜치 `worktree-rfp-agent-team`)에
  `EnterWorktree`(path 지정)로 재진입 → `.superpowers/sdd/progress.md`로 Task 1·2
  완료 확인 → superpowers:subagent-driven-development 스킬의 `task-brief` 스크립트로
  Task 3 브리핑 생성해 이어서 디스패치. 계획 파일은
  `agent/docs/superpowers/plans/2026-07-21-rfp-agent-team.md`, 스펙 파일은
  `agent/docs/superpowers/specs/2026-07-21-rfp-agent-team-design.md`(둘 다
  `agent/docs/superpowers/`, repo 루트 `docs/superpowers/`의 기존 agent 오케스트레이션
  계획과는 다른 경로이므로 혼동하지 말 것). 워크트리의 커밋은 아직 원격에 push되지
  않음 — main에는 스펙/계획 문서 커밋(`47e3ee8`, `343372c`)만 있고, 노드 구현 커밋
  (`1504d8e`, `0e759e7`)은 워크트리 브랜치에만 있음.
- **⚠️ 중요 갱신 (`2026-07-26_summary.md` 3번째 세션 섹션)**: 신규 스펙
  `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`(repo 루트,
  `agent/docs/...`가 아님)가 이 스펙의 핵심 결정 **#4(Claude Agent SDK 서브에이전트로
  스킬 호출)와 #5(CLI 단독 실행)를 명시적으로 대체**한다고 선언함 — 완전 폐쇄망
  운영에서는 Claude Agent SDK 자체가 외부(Anthropic) 네트워크 의존이라 동작 불가하기
  때문. 즉 워크트리에 이미 구현된 **Task 1(`run_subagent`, claude-agent-sdk 기반)과
  Task 2(`rfp_locate_node`)는 폐쇄망 전제와 충돌해 그대로 재사용 불가할 가능성이 큼**.
  Task 3부터 단순 재개하지 말고, **재개 전 반드시 사용자에게 "기존 Task1·2를 폐쇄망
  버전으로 다시 구현할지, 신규 스펙 sub-project 3(agent 신규 노드) 계획을 새로 짤지"를
  먼저 확인**할 것.

### 3. 산출물 본문 내 `bank_idea_draft.txt`(단수형) 자기참조 3곳 — 의도적으로 보류
- **출처**: `2026-07-21_summary.md`(밤 세션, giganlist 경로/파일명 통일 작업 중 발견).
- **내용**: 파일명 자체는 전부 `bank_ideas_draft.txt`(복수형)로 통일됐으나, 다음 두 파일의
  본문 텍스트 안에서 자기 자신을 단수형(`bank_idea_draft.txt`)으로 지칭하는 문장이 남아있음:
  - `giganlist/gangbuk/plan/00_신규 사업 제안 - 총괄 개요.txt` (91번 줄)
  - `giganlist/gangbuk/plan/04_실행 로드맵 및 기대효과.txt` (92번 줄)
  - `giganlist/yongsan/spec/05_문화경제분야_사업목록_예산.txt` (93번 줄)
- **왜 지금 안 고쳤는지**: 이건 CLAUDE.md/`institution-corpus-format` 스킬(문서·규격
  레벨) 문제가 아니라 각 구 산출물 콘텐츠 자체의 문제라, 이번 세션 작업 범위 밖으로
  판단. 사용자가 명시적으로 "완료 처리된 구는 고쳐도 되지만, 아직 진행 중(in-progress)인
  구는 계속 단수형 파일명을 쓸 가능성이 있으니 일단 보류"로 결정 — 남은 8개구(구로~강동)
  디스패치가 여전히 단수형으로 나올 위험이 있는 동안은 완료분만 먼저 고쳐도 다시
  불일치가 생길 수 있다는 판단.
- **재개 방법**: 25개구 배치가 전부 완료되어 파일명 규칙(복수형)이 안정된 뒤, 전체
  `giganlist/*/plan/*.txt`, `giganlist/*/spec/*.txt`를 대상으로
  `grep -rl "bank_idea_draft\.txt" giganlist/*/plan giganlist/*/spec`로 남은 단수형
  자기참조를 재검색해 일괄 정정.

### 4. `dashboard/` 금고은행 입찰 히트맵 — 애니메이션 체감만 육안 확인 남음(포그라운드 탭)
- **출처**: `2026-07-25_summary.md` `## Session (브라우저 검증)`. 구현·리뷰·병합은
  `2026-07-24_summary.md` `## Session 07:43`. 스펙/계획:
  `docs/superpowers/specs/2026-07-23-treasury-bid-dashboard-design.md`,
  `docs/superpowers/plans/2026-07-23-treasury-bid-dashboard.md`.
- **상태**: Task 1~16 전부 구현·리뷰 클린, **main 병합·push 완료(`464f906`)**. D3
  v7.9.0 번들 배치(`1b85a3c`). 2026-07-25 세션에서 **브라우저 검증 대부분 통과** —
  확장 file:// 차단 우회로 로컬 http 서버(`py -m http.server`, fetch 0건이라 file://과
  코드경로 동일)로 검증: 로드/범례5색/필터/티커, 전국지도(서울·경기 활성), 상세
  드릴인(마커 원·삼각/랭킹4카드), 글리프 ?·!, 무결성 console.warn(레코드 미삭제),
  미상 후순위 정렬, 필터 토글(마커 4→3), 편집 모달·유효저장·localStorage 영속,
  Export 직렬화, 탭2 지역그리드·관심핀바(★서울), 탭1 관심 글로우(금색 drop-shadow),
  새로고침 영속(tbd.watchRegions/tbd.edits), D3 폴백(텍스트 랭킹) — **전부 정상**.
  d3-zoom 배선도 즉시 zoom.transform 적용으로 검증됨.
- **남은 단계 (유일·비차단)**: 애니메이션 **체감**(750ms fly-to 줌인, 구름 페이드)만
  자동 검증 불가 — 자동화 탭이 백그라운드(`document.hidden=true`)라 rAF 스로틀로 d3
  transition이 진행 안 됨(코드 버그 아님, 즉시 transform은 정상 적용 확인). **사용자가
  포그라운드 탭에서 `dashboard/index.html` 열고 서울/경기 클릭해 줌 체감만 육안 확인**
  하면 완결. 원격 `origin/feature/treasury-bid-dashboard`는 남아있음(삭제는 사용자 판단).
- **주의**: 테스트는 `node --test dashboard/test/*.test.js`. 확장은 file:// 직접
  네비게이션을 막으므로(navigate/omnibox 모두 차단) 브라우저 재검증 시 로컬 http
  서버 경유가 확실 — `cd dashboard && py -m http.server 8817`(python은 스토어 스텁이라
  실패, `py` 런처 사용). ship-as-is Minor 목록은 `.superpowers/sdd/progress.md` +
  `2026-07-24_summary.md` 07:43 섹션.

### 5. E2E 입찰워크플로우 시스템 — sub-project 0(레지스트리) 계획 작성 완료, 실행 미착수
- **출처**: `2026-07-26_summary.md` `## Session (E2E 입찰워크플로우 시스템 — 브레인스토밍→
  스펙→sub-project 0 플랜)`.
- **배경**: 사용자가 실제 업무 9단계 workflow(입찰현황 파악→...→제안서 제출) 전체를 담는
  시스템을 원함 — 기존 `dashboard/`·`report/`·`agent/`는 그 시스템의 컴포넌트일 뿐.
  `superpowers:brainstorming`으로 배포형태(부분 폐쇄망, 경계는 3/4단계 사이)·LLM(GPT-OSS
  120B, 어댑터 분리)·콘텐츠 생성(코퍼스+LLM polish 하이브리드)·아키텍처(Approach A,
  Next.js+FastAPI+SQLite 레지스트리)·2-트랙 배포(로컬 폐쇄망 운영 / AWS+Vercel 데모)까지
  전부 확정.
- **산출물**: 스펙 `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`
  (커밋 `1cf9d70`, repo 루트 — `agent/docs/...`의 기존 스펙과 다른 경로). 이 스펙 §⑧에서
  구현을 6개 sub-project(0 레지스트리→1 DMZ FastAPI→2 폐쇄망 백엔드 코어→3 agent 신규
  노드→4 6단계 3팀분화→5 Next.js 프론트→6 Track2 배포)로 분리하기로 명시.
  sub-project 0 계획 `docs/superpowers/plans/2026-07-26-registry-institutions-api.md`
  (커밋 `64ad8aa`) — `backend/` 패키지 신규, SQLite 스키마+repository CRUD+CSV
  반입(기존 dashboard 템플릿 재사용)+FastAPI 4개 엔드포인트(list/detail/import/artifacts,
  `advance`/`status`/`checkpoint`는 의도적 제외)+giganlist 23개구 시딩, 5개 TDD 태스크.
- **환경 메모(재개 시 바로 필요)**: 이 머신은 맨 `python`/`pip`가 Windows Store 스텁이라
  실패 — 실제 인터프리터는 `py -3`(3.14.0). `fastapi`/`pydantic`/`pytest`/`httpx` 전부
  미설치 상태 확인함(plan Task 1 Step 2가 설치).
- **다음 단계**: 사용자에게 실행방식(1. Subagent-Driven 추천 / 2. Inline) 질문한
  상태에서 "마무리해줘" 지시가 들어와 **실행은 아직 시작 안 함**. 다음 세션은 이
  선택부터 받아서 `superpowers:subagent-driven-development` 또는
  `superpowers:executing-plans`로 Task 1부터 진행.
- **참고**: 항목 2(agent/ RFP 팀 확장)의 기존 설계가 이 스펙으로 일부 대체됨 — 위 항목 2의
  "⚠️ 중요 갱신" 참고.

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

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
