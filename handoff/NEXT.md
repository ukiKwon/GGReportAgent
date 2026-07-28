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

### 1. 병합 완료된 브랜치 2개 삭제 여부 — 사용자 판단 대기
- **출처**: `2026-07-29_summary.md` `## Session 07:59`(로컬 브랜치 건 추가),
  `2026-07-28_summary.md` `## Session 23:52`(원격 브랜치 건). 원격 건의 원래 이력은
  `2026-07-24_summary.md` `## Session 07:43`.
- **상태**: 둘 다 **비차단** — 지우지 않아도 아무 문제 없고, 내용은 이미 전부 main에
  병합·push돼 있다. 사용자에게 삭제 의사만 물으면 끝나는 건이다.
  - 로컬 `feat/stage7-assembler` — 7단계 취합(`backend/assembler.py`) 작업 브랜치.
    `git branch --merged main`에 나타남(완전 병합 확인). 삭제 시
    `git branch -d feat/stage7-assembler`.
  - 원격 `origin/feature/treasury-bid-dashboard` — `464f906`에서 남아 있음.
    `git ls-remote --heads origin`로 존재 확인됨. 삭제 시
    `git push origin --delete feature/treasury-bid-dashboard`.

> 현재 열린 항목은 위 1번 하나뿐이다. 다만 **다른 세션이 워크트리
> `worktree-corpus-validation`에서 코퍼스 검증 구현을 진행 중**이므로(2026-07-29 07:59
> 확인), 그 세션이 자기 항목을 여기에 추가할 수 있다.

---

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

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
