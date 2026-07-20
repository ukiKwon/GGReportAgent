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

### 1. `agent/` 오케스트레이션 패키지 구현 — 중단, 재개 방법 변경됨
- **출처**: `2026-07-20_1524_summary.md`(계획 필요) → `2026-07-20_1620_summary.md`(착수, 중단)
  → `2026-07-21` 세션에서 상태 재확인.
- **상태**: NEXT.md에 기록돼 있던 워크트리(`.claude/worktrees/rfp-proposal-agent`,
  브랜치 `worktree-rfp-proposal-agent`)는 **더 이상 존재하지 않음**(`git worktree list`에
  안 나타나고, 로컬에 해당 브랜치도 없음 — 디렉토리 자체가 사라짐). 계획 파일이 main에
  커밋됐다는 기록(`8857132`)도 부정확했음 — 실제로는 main에 없음.
  **작업물 자체는 유실되지 않고 원격 브랜치 `origin/subagent-init-archi`에 남아있음**
  (커밋 `8857132`~`f36807a`, Task 1~5에 해당하는 6개 커밋: agent 패키지 스켈레톤,
  rfp_analysis, spec_loader/institution_match, pptx_builder, 버그 픽스). 계획 파일도
  그 브랜치에만 있음: `git show origin/subagent-init-archi:docs/superpowers/plans/2026-07-20-rfp-proposal-agent.md`.
- **사용자 결정 (2026-07-21)**: 이번 세션에서 "원격 브랜치에서 재개" vs "다른 NEXT.md 항목
  진행" 중 후자를 선택 — 이 항목은 이번 세션에서 다루지 않음.
- **재개 방법**: 다음에 이 항목을 다룰 때는 `origin/subagent-init-archi`에서 새 워크트리를
  만들어(`git worktree add <path> origin/subagent-init-archi` 후 로컬 브랜치로 체크아웃)
  Task 6부터 이어서 진행. `.superpowers/sdd/progress.md`는 워크트리 전용(git 미추적)이라
  이전 세션 것은 유실됐으므로 계획 파일(`docs/superpowers/plans/2026-07-20-rfp-proposal-agent.md`,
  해당 브랜치에서 읽을 것)의 체크박스 상태로 Task 1~5 완료 여부를 다시 확인 후 진행.
- **주의**: Task 2에서 서브에이전트가 실수로 main에 직접 커밋한 사고가 있었음(복구됨) —
  향후 디스패치 시 "워크트리 절대경로에서만 작업, 커밋 전 `git rev-parse --show-toplevel`
  확인" 지시 필수.

### 2. Task 5(pptx_builder) 리뷰의 미반영 Minor 사항
- **출처**: `2026-07-20_1620_summary.md`
- **상태**: 수정 불필요 판정, 참고용으로만 남김.
- 내용:
  - 섹션 슬라이드가 "근거자료: ..." 인용 텍스트를 실제로 렌더링하는지 검증하는 테스트 없음
  - `scoring_table`이 빈 리스트일 때 `_add_scoring_table_slide`가 `IndexError` 가능성

### 3. 25개 자치구 배치 프로젝트 — 미완결 8/20 재개
- **출처**: `handoff_old/NEXT.md`(2026-07-20 기준, git 미추적 상태로 남아있던 별도
  작업 스레드 — 5개구 KB 제안 프로젝트/현재 agent 오케스트레이션 작업과는 무관한
  독립 프로젝트. 원본 파일은 이 항목에 병합 후 삭제됨. 세션 체크포인트 원본은
  `handoff/20260719_1142.md`, `20260719_1151.md`, `20260719_1157.md`,
  `20260719_handoff01.md`, `20260719_handoff02.md`, `20260720_완료처리.md`,
  `20260720_2135.md`로 함께 이동돼 있음 — 이 파일들 자체는 `2026-07-19_summary.md`/
  `2026-07-20_summary.md`로 병합된 뒤 삭제되어 더 이상 존재하지 않음, 위 두 summary
  파일에 내용이 온전히 보존돼 있음).
  → `2026-07-21` 세션에서 이어서 진행, 12/20까지 완료.
- **프로젝트 개요**: 서울시 25개 자치구 전체에 대해 동일한 3종 산출물(`spec/`, `plan/`,
  `bank_idea_draft.txt`)을 작성. **완료 12/20**(종로78, 중구77, 용산76, 성동76,
  중랑81, 성북76, 은평74, 강북72, 서대문73, 마포80, 양천84, 강서80 — 신뢰도 점수).
  미완결 8/20(순서대로): 구로, 금천, 영등포, 관악, 서초, 강남, 송파, 강동 —
  산출물 폴더(`{구영문명}/spec,plan,bank_idea_draft.txt`)는 `2026-07-21` 세션에서
  main에 git commit·push됨(이전에는 미추적 상태였음 — 아래 "비고" 참고).
- **중단 이력**: `2026-07-21` 세션에서 구로/금천 2건을 다음 페어로 디스패치했으나
  완료 전 사용자가 "하던일 멈추고 마무리해줘" 지시로 중단 요청 — 두 백그라운드
  에이전트(`a61894449083ba7c0` 구로, `a4c940fb5794690c6` 금천)를 `TaskStop`으로
  종료함. 산출물 디렉토리는 생성되지 않은 상태에서 중단됨(`git status` 클린 확인,
  버릴 작업 없음) — 완료 카운트는 그대로 12/20 유지. 다음 세션은 구로부터 재개.
- **재개 방법(중요 제약)**: 반드시 **2-parallel**로 디스패치(4-parallel/20-parallel
  전체 동시 디스패치는 세션 한도 초과로 전멸한 이력 2건 있음, 2026-07-19/20).
  세션 한도 실패 시 즉시 재시도하지 말고 해당 구 task를 pending으로 되돌린 뒤
  사용자의 명시적 재개 지시를 기다릴 것. 구별 디스패치는 Agent 도구
  (subagent_type: general-purpose)로 자기완결적 프롬프트 사용, `institution-corpus-format`
  스킬 규격(spec 8~10개 파일, plan 정확히 6개 파일, bank_idea_draft.txt 5개 축)을
  프롬프트에 직접 명시하고 `jongno/`를 참고 예시로 지시. 조작 금지 원칙(데이터 날조 금지,
  수치 불일치는 병기, hallucination 의심 시 재조회로 검증)도 프롬프트에 포함할 것 —
  2026-07-21 세션에서 실제 사용한 프롬프트 전문은 그 세션의 `2026-07-21_summary.md`
  참고.
- **참고용 완성 예시**: `jongno/spec/`, `jongno/plan/`, `jongno/bank_idea_draft.txt`.
- **비고**: 프로젝트 루트가 2026-07-20에 `gigan`에서 `GGReportAgent`로 폴더명 변경됨
  (robocopy로 전체 복사 완료). 15분 주기 모니터링 cron(ID `a9a58f91`, session-only,
  생성 후 7일 자동만료)은 세션 종료로 만료됨 — 계속 모니터링이 필요하면 CronCreate로
  재생성 필요. 완료된 12개구 산출물은 더 이상 git 미추적 상태가 아님(`2026-07-21`
  세션에서 커밋됨) — 다음 세션은 이 사실을 전제로 진행할 것.

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

- ~~브레인스토밍 재진입해 agent/ 패키지 스펙 확정~~ — `2026-07-20_1620_summary.md`에서
  스펙 작성 및 계획(`2026-07-20-rfp-proposal-agent.md`) 완료로 해소.
- ~~최종 리뷰 Minor 사항 2건 (rfp-locate 스킬)~~ — `2026-07-21_summary.md`에서 해소:
  `extract_text.py`에 `sys.stdout.buffer.write(UTF-8)` 사용 이유 주석 추가,
  `render_pages.py`의 `fitz.open()`을 `with` 문으로 감쌈.
- ~~`.claude/worktrees/skill-essential` 물리 디렉토리 잔여~~ — `2026-07-21` 세션에서
  확인 결과 `.claude/worktrees/` 디렉토리 자체가 더 이상 존재하지 않음(Windows 파일
  잠금이 풀리며 자연히 정리된 것으로 보임). 별도 조치 불필요.
