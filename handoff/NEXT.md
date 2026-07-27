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

### 1. `agent/` RFP 팀 확장 구현 — Task 1·2 완료, Task 3(`spec_research_node`)부터 재개
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

### 2. `dashboard/` 금고은행 입찰 히트맵 — 애니메이션 체감만 육안 확인 남음(포그라운드 탭)
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

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

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
