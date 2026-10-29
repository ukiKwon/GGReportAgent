---
tags: [section, done]
원본: done.md
---

> 원본: `handoff/done.md` (파생본)

## 해소된 항목 (참고용 로그 — 지우지 않고 누적)

- ~~리포지토리 재구성 — 남은 것은 ⑦단계뿐~~ (구 항목 2) — `[[2026-08-21|2026-08-21_summary.md]]`
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

- ~~결재함·작업함 카드 본문이 고정 높이에 잘린다~~ (구 [[항목 17 uploader 붙이기|항목 17]]) —
  `[[2026-08-21|2026-08-21_summary.md]]` `## Session 10:05`에서 종결. 커밋 **`b78e5f2`**.
  원인이 둘이었다: ⓐ`.dg-body`에 클램프만 있고 잘렸다는 신호가 없었다
  ⓑ**결재함(`approvals.js`)은 토글 배선 자체가 없었다** — 작업함(`designer.js`)은
  원래 클릭하면 펴졌고 신호만 없었으므로, NEXT.md가 적어 둔 "공통 원인" 추정은
  절반만 맞았다. 사용자 선택 ⓐ안(클램프 유지 + 신호 추가)으로,
  `designer.wireBodyToggles(container)` 공통 함수가 **실제로 넘칠 때만** `.clamped`를
  붙이고 그때만 페이드와 `⌄ 더 보기`/`⌃ 접기`를 띄운다. 변형본 6개는 사용자
  지시로 그대로 뒀다(정본 `dashboard/index.html`만 수정). 캡처 19·20도 재촬영해
  교체했다.

- ~~impeccable 훅이 `portfolio/index.html`에 28건을 계속 올린다~~ (구 [[항목 18 uploader|항목 18]]) —
  `[[2026-08-21|2026-08-21_summary.md]]` `## Session 10:05`에서 종결. 커밋 **`b78e5f2`**.
  `npx impeccable detect` 실측은 **33건**이었다(훅은 5건씩 끊어 보고해 28건으로
  보였다). 사용자 확정 ⓐ안 + kicker·radius까지: side-tab 2건·kicker 2건·radius
  1건은 **고쳤고**, 색 21·폰트 6건은 `portfolio/index.html` **파일 한정 value
  예외**로 등록했다(`ignore-file`/`ignore-rule`은 쓰지 않았다). 검출 **0건**.

- ~~corpus-validation 브랜치·워크트리 잔여 정리~~ — `[[2026-07-30|2026-07-30_summary.md]]`
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
  (구 항목 2) — `[[2026-07-29|2026-07-29_summary.md]]` `## Session 15:51`에서 **확인 결과 이미
  존재하지 않아 종결**. 이 PC에서 `.claude/worktrees` 디렉터리 자체가 없고
  (`ls` 실패), `git worktree list`도 메인 리포 하나만 반환한다. 과거
  `skill-essential` 잔해와 같은 경로(Windows 파일 잠금이 풀리며 자연 정리)로
  보인다. 별도 조치 불필요.

- ~~main 미push 커밋 — GitHub 인증이 세션에 없어 push 차단~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) —
  `[[2026-07-29|2026-07-29_summary.md]]` `## Session 13:38` 직후 해소. **사용자가 세션 안에서
  `! git push origin main worktree-corpus-validation`을 직접 실행**해 인증과 함께
  push 완료(`b91b081..8c5225f main`, `8d94f88..a8e14fd worktree-corpus-validation`).
  `git rev-list --left-right --count origin/main...main` = `0 0` 검증됨.

- ~~corpus-validation 워크트리 — main 병합만 남음 (최우선)~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) —
  `[[2026-07-29|2026-07-29_summary.md]]` `## Session 11:14`에서 해소. 전체 브랜치 최종 리뷰 수행 →
  Minor 2건 발견(비UTF-8 파일이 plan/01 등 특정 위치에 있으면 규칙9 보고 대신 크래시,
  규칙9 중복 보고) → fix 커밋 `a8e14fd`를 브랜치에 얹고(148 passed 재확인)
  `--no-ff`로 main 병합(`c7ba0c7`). 병합 후 main에서 **148 passed**.
  이 병합으로 재구성 §⑦ ④단계(giganlist 이동)의 게이트가 풀림.
  워크트리는 다른 PC에 있어 이 PC에서는 원격 브랜치 기준으로 작업했다
  (`git branch worktree-corpus-validation origin/...`으로 로컬 브랜치 생성).
  **주의: fix 커밋 `a8e14fd`와 main 병합은 아직 미push**(현 [[항목 1 E2E 입찰워크플로|항목 1]] 참조) — 다른 PC
  워크트리에서 이어 작업하기 전에 push·fetch 동기화 필요.

- ~~병합 완료된 브랜치 2개 삭제 여부~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) — `[[2026-07-29|2026-07-29_summary.md]]`
  `## Session 08:05`에서 **사용자 승인 후 둘 다 삭제 완료**.
  로컬 `feat/stage7-assembler`(`784b496`) → `git branch -d`로 삭제(완전 병합 확인됨).
  원격 `origin/feature/treasury-bid-dashboard`(`464f906`) → `464f906`이 `origin/main`의
  조상임을 `git merge-base --is-ancestor`로 검증한 뒤 `git push origin --delete`.
  삭제 후 `git ls-remote --heads origin`에 남은 원격 브랜치는 `main`과
  `subagent-init-archi` 2개뿐이며, 후자는 새 [[항목 1 E2E 입찰워크플로|항목 1]]로 이월했다.

- ~~`main`의 미push 커밋 5개 — 다른 세션 작업 종료 후 push~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) —
  `[[2026-07-29|2026-07-29_summary.md]]` `## Session 07:59`에서 해소. **다른 세션이 push를 완료**해
  `git rev-list --left-right --count origin/main...main` = `0 0`(완전 동기화)이 됐다.
  이 세션이 만든 커밋 `1f9bcfe`(7단계 취합)·`5b45ac7`(handoff)가 `origin/main`에
  포함됨을 `git merge-base --is-ancestor`로 개별 검증했다. 함께 적혀 있던 로컬 브랜치
  `feat/stage7-assembler` 삭제 건은 미결이라 **현 [[항목 1 E2E 입찰워크플로|항목 1]]로 이관**해 원격 브랜치 삭제
  건과 합쳤다.

- ~~`agent/` RFP 팀 확장 구현 — Task 3(`spec_research_node`)부터 재개~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) —
  `[[2026-07-29|2026-07-29_summary.md]]` `## Session 00:29`에서 **"폐기"로 종결**. 두 가지 이유:
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
  `[[2026-07-28|2026-07-28_summary.md]]` `## Session 23:52`에서 해소. 사용자가 포그라운드 탭에서 체감을
  확인했고("0.4초는 마음에 든다"), 그 과정에서 나온 UI 피드백을 3라운드로 반영해 **main에
  커밋·push 완료**: `c5b03d6`(파스텔 팔레트·구 단위 지자체 색칠·지자체 외곽선 깜빡임·
  랭킹 카드 흰 테두리 누적 버그 수정·`🎨 지도 색상` 설정), `be194ee`(라벨 헤일로·라벨
  겹침 해소·범례를 지도 우하단으로+테마 연동·드릴인 0.4초 멈춤), `4909a11`(지도를 덮는
  큰 지역명 오버레이 제거). 테스트 `node --test dashboard/test/*.test.js` **36/36 통과**,
  콘솔 오류 0건. 원격 브랜치 삭제 건만 위 항목 2로 분리해 이월함.

- ~~`finalize` 엔드포인트에 호출자 신원(`X-User-Id`) 미수집~~ (구 [[항목 3 로컬 DB 파일 2건|항목 3]]) —
  같은 날 `[[2026-07-28|2026-07-28_summary.md]]` `## Session 21:30` 후반부에서 **사용자가 선택지 ①을
  승인해 즉시 해소**(커밋 `189bee0`, main push 완료). `bid_cases`에 `finalized_by`/
  `finalized_at` 컬럼 추가, `BidCase` 모델·`record_finalization()` 리포지토리 함수 추가,
  finalize가 `x_user_id: str = Header(...)`를 요구하도록 변경(승인·반려 양쪽 다 기록).
  기존 `registry.db`는 `CREATE TABLE IF NOT EXISTS`라 컬럼이 자동으로 안 붙어
  **사용자 승인 하에 삭제 후 재시드**함(gitignored라 리포지토리 영향 없음). 신규 테스트
  4건 + 기존 finalize 테스트 3건에 헤더 추가 → **66/66 통과**. 스펙 §③ 데이터모델 표에도
  두 컬럼과 "왜 이력 배열이 아니라 단일 컬럼인지"의 근거를 반영함.

- ~~E2E 입찰워크플로우 시스템 — sub-project 0(레지스트리 & 기관 API) 구현~~ (구 [[항목 3 로컬 DB 파일 2건|항목 3]]) —
  `[[2026-07-27|2026-07-27_summary.md]]` `## Session 22:33`에서 해소: `superpowers:subagent-driven-development`로
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
- ~~**25개 자치구 배치 프로젝트 (20/20 완결)**~~ (구 [[항목 1 E2E 입찰워크플로|항목 1]]) — `[[2026-07-27|2026-07-27_summary.md]]`
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
- ~~산출물 본문 내 `bank_idea_draft.txt`(단수형) 자기참조 3곳~~ (구 [[항목 3 로컬 DB 파일 2건|항목 3]]) —
  `[[2026-07-27|2026-07-27_summary.md]]` `## Session 07:27`에서 해소. 이 항목의 재개 조건이 "25개구 배치
  완료 후"였는데 같은 세션에서 배치가 완결되어 조건이 충족됨. `giganlist/gangbuk/plan/00`
  (91줄), `giganlist/gangbuk/plan/04`(92줄), `giganlist/yongsan/spec/05`(93줄) 3곳을
  복수형으로 정정하고 `grep -rn "bank_idea_draft\.txt" giganlist/` **0건**으로 검증 완료.

- ~~`main`의 미push 커밋 5개 — push 여부 사용자 판단 대기~~ (구 [[항목 5 gpt-oss-120b 실호출이 아직 검증되지 않았다|항목 5]]) —
  `[[2026-07-27|2026-07-27_summary.md]]`에서 해소 확인: `git rev-list --left-right --count
  origin/main...main` = `0 0`(완전 동기화), `git merge-base --is-ancestor`로 강남 커밋
  `a6d2896`·dashboard 커밋 `0450831` 둘 다 `origin/main`에 포함됨을 검증.
  **다른 세션이 이미 push를 완료**한 것으로 보임(당시 origin/main HEAD = `f1e8cf8`).
  이 항목에 함께 적혀 있던 "커밋 전 `git branch --show-current` 확인" 주의사항은 여전히
  유효하므로 **[[항목 1 E2E 입찰워크플로|항목 1]]로 이관해 보존**함. 이 해소로 이후 항목 번호가 하나씩 당겨짐
  (구 6 → 현 5).
- ~~브레인스토밍 재진입해 agent/ 패키지 스펙 확정~~ — `2026-07-20_1620_summary.md`에서
  스펙 작성 및 계획(`2026-07-20-rfp-proposal-agent.md`) 완료로 해소.
- ~~최종 리뷰 Minor 사항 2건 (rfp-locate 스킬)~~ — `[[2026-07-21|2026-07-21_summary.md]]`에서 해소:
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
