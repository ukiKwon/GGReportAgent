# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 대화 스타일 (사용자 요청)

- 답변은 **10줄 이내**로, 사용자가 보기 쉽게 정리해서 제시한다.
- 상세 내용이 필요하거나 사용자에게 확인·선택을 물어야 하는 상황이면, 본문 아래에
  `🙋 **물어볼게:**` 로 분리해서 질문한다 (본문은 짧게 유지).
- **질문 블록은 본문과 시각적으로 확실히 떼어 놓는다.** 사용자가 "겹쳐 보인다"고 두 번
  지적한 부분이다 — 본문 마지막 줄 바로 뒤에 붙으면 터미널에서 본문의 연장처럼 읽힌다.
  형식을 다음으로 고정한다:
  1. 본문이 끝나면 `---` 구분선을 넣는다.
  2. `🙋 **물어볼게:**` 를 **한 줄로 단독** 배치한다 (같은 줄에 질문 내용을 붙이지 않는다).
  3. 질문이 둘 이상이거나 한 줄을 넘으면 **각각 `-` 목록 항목으로 개행**한다.
     한 문단으로 이어 쓰지 않는다.
- **작업 착수 전에 의도를 먼저 설명하고 진행 의사를 묻는다** (2026-08-06 사용자 요청).
  코드를 고치기 시작하기 전에 ⓐ무엇을 ⓑ왜 지금 ⓒ어떤 근거로 하는지를 짧게 밝히고,
  위 형식의 질문 블록으로 진행 여부를 확인한다.
  - **"순서대로 해"·"계속해" 같은 포괄 지시도 백지위임이 아니다** — 이 저장소는
    `handoff/NEXT.md`에 열린 항목이 많아서, **항목이 바뀔 때마다 다시 묻는다.**
    한 번의 승인이 다음 항목까지 덮지 않는다.
  - 물어야 하는 단위는 **작업 항목**이다. 이미 승인된 한 작업 안의 세부 단계
    (테스트 수정·커밋 등)까지 매번 묻지는 않는다.
- 사용자가 **"이전으로 돌려줘"** 라고 하면 이 스타일을 해제하고 기본 방식으로 돌아간다.

## What this repository is

A one-off research + document-generation project (originally the `기관/` folder inside
a larger course-workspace repo, later split out as its own repo — see `구청_log.md` for
the full provenance). The deliverable is a proposal package aimed at identifying where a
bank (KB) could partner with 5 Seoul district offices (구청) on policy initiatives, built
entirely from public district-government planning documents and complaint-board data —
no live scraping or APIs, no application code to run/test/lint.

There is no build, lint, or test command. The only "commands" are the two standalone
Python report generators described below.

## Layout

Every district folder lives under `corpus/institutions/` (e.g. `corpus/institutions/dobong/`,
`corpus/institutions/jongno/`) — this includes both the original 5 districts (도봉→`dobong`,
노원→`nowon`, 광진→`gwangjin`, 동대문→`dongdaemun`, 동작→`dongjak`) and the districts added
since by the 25-district batch project. Each district has an identical two-stage folder
structure:

- **`corpus/institutions/{district}/spec/`** — raw research findings: the district's multi-year policy
  plan (사업목록 및 예산 by chapter/분야), a website-verification pass
  (`0X_홈페이지검색확인결과.txt`, cross-checking whether each budgeted project can actually be
  found/confirmed on the district's own site), and a complaint-board survey for 2026
  (`0X_민원게시판_2026년정리.txt`). `00_인덱스.txt` in each `spec/` folder indexes and
  sanity-checks the other files (e.g. verifies per-chapter project counts and budget sums
  add up to the stated totals) — read it first when exploring a district's spec data.
- **`corpus/institutions/{district}/plan/`** — derived proposal documents built from that district's
  spec data: `00_제안개요_및_배경`, `01_제안사업_요약표`, `02_IT디지털기획_사업제안` (IT-1, IT-2, …),
  `03_금전적지원_사업제안` (FN-1, FN-2, …), `04_실행로드맵_및_기대효과`, and
  `05_검증결과` — an independent validation pass scoring each proposed item for overlap
  with existing district projects and giving the district plan an overall 신뢰도(trust)
  score out of 100 (도봉 74, 노원 88, 광진 88, 동대문 82, 동작 84).
- **`corpus/institutions/{district}/bank_ideas_draft.txt`** — a separate, later-added draft layer that
  re-reads a district's full spec+plan and proposes bank-partnership angles (소상공인금융/
  청년금융/IT협력/복지주택금융/SOC참여). Explicitly a draft only — not merged into
  `plan/`, and every idea in it cites back to a specific `spec/NN` or `plan/NN` source by
  file index (e.g. `spec/02(1장-4)`, `plan FN-1`) so claims stay traceable to real
  district data.
- **`corpus/`** — RAG source material, per the repo-restructure spec §⑦ stage 3:
  `corpus/rfp/` (RFP announcement PDFs, formerly root `RFP/`), `corpus/reports/`
  (see below), and `corpus/inbox/` (drop zone for files brought in from outside
  the closed network — empty until the collector exists; the format those files
  must take is fixed by `collector/SCHEMA.md`).
- **`collector/`** — the outside-the-network announcement collector's slot
  (restructure spec §⑦ stage 6). **Currently `SCHEMA.md` only, no code.** That file
  is the whole interface between the two sides: the collector never imports repo
  code, it just drops a batch folder (`manifest.json` + `institutions.csv` +
  `files/`) into `corpus/inbox/`. Read it before adding anything here, and before
  changing `server/csv_import.py`'s header map — the CSV half of the contract is
  that map.
- **`corpus/reports/`** (formerly `total/`, then root `report/`) — the combined
  cross-district output:
  - `5-report_2.0.html` — **the current main deliverable.** A single-file offline app
    with a 3-tab sidebar: 대시보드 (25-district Seoul GeoJSON map — do not modify without
    explicit instruction, especially the map; district click opens a centered quick-view
    overlay showing only 구청 사업현황 분석), 지역구 상세 (card grid of the 5 districts →
    per-district document view merging 1.0's static doc panels with 2.0's JS-rendered
    analysis via `.js-slot` placeholders, 9 subtabs in narrative order 계획→달성도→민원→
    KB제안→로드맵→검증), and 사업별 (topic-based 5-column comparison grid).
  - `5-report_1.0.html` — the legacy static HTML report (renamed from
    `서울시_5개구청_사업제안기획안.html`); source of the district panels imported into 2.0.
    Keep it unchanged as reference.
  - `서울시_5개구청_사업제안기획안.docx` — the DOCX deliverable.
- **`archive/`** — 1st-generation artifacts, quarantined here per the repo-restructure
  spec (`docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §⑦ stage 1).
  Everything below still has valid content but is no longer at repo root:
  - **`archive/build_report.py`** — generates the DOCX version (python-docx: cover page →
    one 1-page summary per district → per-district detail chapters).
  - **`archive/build_html_report.py`** — generates the HTML version (sidebar/tab
    navigation per district, subtabs per plan section; per-district `district_colors`,
    `trust_scores`, `budget_info`, `key_problems`, `top_projects` dicts are hardcoded near
    the top of the file — update those in place rather than re-deriving them from spec
    files by hand).
  - **`archive/구청_log.md`** — timestamped work log of how all of the above was produced
    (mostly parallel background research agents). Read it before assuming a spec/plan
    file's provenance or before treating a discrepancy as a bug rather than known history.
  - **`archive/html_한글화_계획.md`** — a draft plan (not yet applied to source) for
    replacing the English tokens `spec`/`plan` with Korean equivalents throughout the HTML
    output and its source `.txt` files. Read this before doing any find/replace on
    `spec`/`plan` strings — it documents which occurrences are file-index references that
    must keep their numeric suffix vs. free-text usages that can be reworded outright.
  - **`archive/gigan.zip`** — archive of this project's contents; not a source of truth,
    don't extract-and-edit into it.
  - **`archive/log/`** — past-session work logs (progress checks, batch completion logs).
  - **`archive/GGReportAgent_*.html`** (3 files) — early root-level report/guide HTML.

## Important gotcha: hardcoded output paths don't match this repo's layout

Both `build_report.py` (`DOC_PATH`) and `build_html_report.py` (`OUT_PATH`) still point at
`C:\claude_workspace\서울시_5개구청_사업제안기획안.{docx,html}` — the parent directory,
from when the district folders lived one level up (before the `기관/`→repo split recorded
in `구청_log.md`). The actual current deliverables live in `corpus/reports/` **inside this
repo**. Running either script as-is will write to the old parent-directory path, not update
the files in `corpus/reports/` (and would regenerate only the 1.0-style layout — 2.0 was hand/agent-
authored HTML+JS, no script generates it). Fix `DOC_PATH`/`OUT_PATH` (and double check any relative reads of
`corpus/institutions/{district}/plan/*.txt` against the current working directory) before rerunning
either generator.

Both scripts also duplicate source content as hardcoded Python dicts/strings rather than
reading district `plan/`/`spec/` `.txt` files at generation time — when a district's
underlying research changes, the corresponding dict in the build script needs a matching
manual update, not just an edit to the `.txt` file.

## gstack 스킬 (작업 방식 참고)

`docs/gstack_구조.md` — 사용자 전역(`~/.claude/skills/gstack/`)에 설치된 gstack 스킬 54개의
구조 지도. 역할 페르소나 6종(CEO·엔지니어링매니저·디자이너·DX·CSO·YC파트너)과 6단계
파이프라인(발상→계획리뷰→구현→검증→배포→문서)을 표로 정리해 뒀다. 이 저장소의 코드가 아니라
**작업을 역할별로 나눠 수행하는 방식**에 대한 참고 자료이므로, 리뷰·검증·문서화 작업을 어떤
순서로 걸지 정할 때 읽는다.

스킬 목록에는 라우터 `gstack` 하나만 노출된다 — 하위 53개는 `.agents/skills/` 안에 중첩돼
있어서 개별로 보이지 않는다.

**⚠️ 이 저장소와 겹치는 부분**: gstack의 `/context-save`·`/context-restore`는 아래 `handoff/`
체계와 정확히 같은 일을 한다. 둘을 같이 쓰면 이월 기억이 두 군데로 갈라지므로,
**이 저장소는 `handoff/` 체계만 쓴다** — gstack의 컨텍스트 저장 스킬은 여기서 호출하지 않는다.

## 플러그인 활용 (사용자 요청 2026-10-29)

사용자 전역에 플러그인이 여럿 설치돼 있다. **작업을 보고 맞는 플러그인을 스스로 골라 쓴다.**
판단이 어렵거나 사용자가 직접 확인하는 게 낫다면, "이 시점에 이 플러그인으로 확인해보라"고
**매번 안내한다.** (위 "작업 착수 전 승인" 규칙이 우선 — 플러그인 사용도 작업 항목 단위로 먼저 알리고 묻는다.)

- UI/디자인: `impeccable`(진단·개선) → `frontend-design`(미학 방향) → `playwright`(스크린샷 확인) → `playground`(시안 비교)
- 커밋/PR: `commit-commands` · 리뷰: `code-review`, `pr-review-toolkit`, `code-simplifier` · 보안: `security-guidance`, `claude-security`
- 기능 개발 흐름(기획→설계→구현): `feature-dev` · Java 백엔드 코드 이해: `jdtls-lsp` (Java 언어 서버가 PC에 있어야 함)
- CLAUDE.md 정비: `claude-md-management` · 훅/플러그인 제작: `hookify`, `plugin-dev` · 라이브러리 문서: `context7`
- 에이전트 팀(`.claude/agents/`, 9개 읽기 전용)과 `agent-dashboard/`(에이전트 대시보드) 설명은 `handoff/agents/README.md`·`agent-dashboard/README.md`.
- 설치 현황이 바뀌면 이 목록도 같이 고친다.

## 에이전트 팀 자동 투입 (사용자 요청 2026-10-30)

사용자는 에이전트를 직접 조작하지 않는다. **작업 항목을 승인하면 메인이 알아서 역할 에이전트(`.claude/agents/`)를 투입한다.**
대시보드(`agent-dashboard/`)는 **세션 시작 때 자동으로 뜬다**(SessionStart 훅 `start.js`: 서버가 없을 때만 띄우고 브라우저를 연다. 끄려면 환경변수 `AGENT_DASH_NO_OPEN=1`). 에이전트의 작업 상태는 훅(`hook.js`)으로 자동 표시한다 — 화면의 시작/멈춤 버튼은 시험용일 뿐이다.

- **역할 간 이동·되돌림·멈춤 규칙은 `handoff/agents/graph.md`(에이전트 그래프)를 따른다.** 사용자는 그 문서의 판단 지점(G1~G6)에서만 개입하고, 나머지는 메인이 자동으로 라우팅한다. 작업마다 `handoff/agents/runs/`에 실행 기록을 남긴다.
- 투입 순서(해당하는 역할만): `planner`(범위·선택지) → `design-reviewer`(화면 규격) → `frontend-dev`/`backend-dev`(패치안)
  → 메인이 적용·테스트 → `qa-verifier`(독립 검토) → `security`(권한·입력·비밀값)·`data-auditor`(레코드 값) → `pm`(여러 항목 정리). 큰 작업 묶음이 끝났거나 "마무리" 전에는 `cleaner`(청소부)로 정리 후보를 점검한다.
- **이 프로젝트의 모든 작업은 최우선으로 역할 에이전트를 호출해서 한다 — 경중과 무관하다**(사용자 요청 2026-10-30; 한두 줄 수정·오타도 포함, 이전의 "사소한 일 예외"는 폐지). 어떤 역할을 부르고 언제 끝낼지는 **메인이 정한다.** **어느 역할에도 속하지 않는 일은 모두 `cleaner`(청소부)에게 넘긴다**(사용자 요청 2026-10-30; 청소부도 읽기 전용이라 처리안을 보고하고 적용은 메인이 한다). **예외: `CLAUDE.md`·역할 정의(`.claude/agents/`) 같은 규칙급 문서는 메인이 직접 고친다**(사용자 확인 2026-10-30). **청소부의 원칙: 커밋·푸시가 기본 업무이고, 병합(`--merge`) 등 그 밖의 작업은 사용자가 별도로 요청할 때만 한다**(사용자 요청 2026-10-30; **커밋은 작업 한 바퀴가 끝날 때마다 무조건 1회, 푸시는 오후 6시 자동 마무리에서** — 사용자가 푸시·PR을 직접 요청하면 예외) — 작업이 끝나도 사용자가 요청하기 전에는 병합을 하지 않고, 먼저 묻지도 않는다. 에이전트를 건너뛰고 메인이 직접 고쳤다면 그 사실을 보고에서 숨기지 않는다.
- 에이전트는 모두 읽기 전용이다. **파일 적용·테스트 실행·커밋은 메인이 한다.** 보고서는 `handoff/agents/<이름>/`에 저장한다.
- 승인 범위: 이미 승인된 작업 항목 안에서 읽기 전용 에이전트를 부르는 것은 다시 묻지 않는다. 코드 적용·푸시 등은 기존 규칙대로.
- 병렬로 불러도 되는 것(서로 독립인 검토)은 한 번에 부른다.

## 작업 확인 순서

작업을 시작하거나 "무엇이 남았나"를 확인할 때 **`handoff/NEXT.md`를 가장 먼저 본다.**
NEXT.md는 통째로 암기하는 문서가 아니라 열린 항목의 작성 방식·현황을 보는 문서다.
완료된 항목은 `handoff/done.md`로 옮겨 NEXT.md에는 열린 것만 남긴다.

## 여러 세션 동시 작업 (사용자 요청 2026-10-29)

같은 저장소에서 세션이 둘 이상 돌 수 있다. 작업을 시작할 때 `ListAgents`로 다른 세션이 있는지 보고,
있으면 아래를 따른다. (세션이 하나뿐이면 아래 "Handoff summaries" 규칙만 적용된다.)

1. **작업 폴더를 세션마다 분리한다.** `git worktree`(`EnterWorktree`)로 세션마다 별도 폴더·브랜치에서
   작업하고 끝나면 병합한다. 같은 폴더를 어쩔 수 없이 공유하면 파일 담당을 나눈다.
2. **병렬 세션은 handoff 기록을 세션별 파일에 쓴다** — `handoff/sessions/YYYY-MM-DD_HHmm_<세션이름>.md`.
   날짜별 `YYYY-MM-DD_summary.md`에는 **병합·마무리하는 세션이** 그 내용을 `## Session HH:mm` 섹션으로
   옮겨 적는다(append-only 유지). SessionStart 훅은 `sessions/` 안을 읽지 않으니 옮기지 않으면 다음 세션에 안 보인다.
3. **공통 문서는 종류별로 다룬다.**
   - 날짜별 summary: 이어 붙이기만 한다. `.gitattributes`의 `merge=union`이 동시 추가를 둘 다 살린다.
   - `handoff/NEXT.md`: **항목 단위로 부분 수정**(Edit)한다 — 파일을 통째로 다시 쓰지 않는다. 고치기 전에 최신
     내용을 다시 읽고, 완료분은 `done.md`로 옮긴다. 항목별 파일로 쪼개는 안은 NEXT 28(슬림화)과 함께 검토한다.
   - `CLAUDE.md`·설계서처럼 모두가 읽는 문서: 한 번에 한 세션만 고친다. `git status`에 내가 만들지 않은 변경이
     보이면 건드리지 말고 사용자에게 알린다.
4. **커밋은 경로를 지정한다.** `git add -A`·`git commit -a`를 쓰지 않는다. 남의 미커밋 변경은 담지 않는다
   (사용자가 같이 담으라고 한 경우만).
5. **서버·DB·포트는 한 세션만 쓴다.** `localhost:8080` 서버, 로컬 MySQL, `target/`을 동시에 쓰지 않는다.
   테스트나 빌드 전에 다른 세션이 쓰는 중인지 확인한다.
6. **병합은 짧고 자주 한다.** 공통 문서를 고치기 전에 최신 상태를 먼저 받는다(`git pull`).

## Handoff summaries

**What "마무리해줘" (finalize/wrap up) means in this repo:** update or create the day's
`handoff/YYYY-MM-DD_summary.md` (and `handoff/NEXT.md` if any open item changed status),
`git commit` the result, and `git push`. All three steps — not just one — unless the user
explicitly narrows the scope in that request.

`handoff/` holds short markdown recaps of work done in this repo, plus one tracker file:

- **`handoff/YYYY-MM-DD_summary.md`** — one file per calendar day, after every 5
  completed tasks in a session's task list, covering what was done, key decisions, and
  what's left. If a summary is due on a day that already has a file, append a new
  `## Session HH:mm` section to the bottom of that day's file — never edit or remove an
  existing session section. **Append-only at the session-section level**: once a
  session's section is written, it is never edited or deleted by a later session.
- **`handoff/NEXT.md`** — the one file in this folder that IS meant to be edited in
  place. It tracks only the currently-unresolved "what's left" items, deduplicated
  across all past summaries, so a new session doesn't have to read every summary file
  to know what's still open. **`NEXT.md` — not the auto-loaded latest summary — is the
  system's actual carry-forward memory** (see the "relevance over recency" note below);
  each open item must therefore be self-sufficient. Rules for maintaining it:
  - **Every open item must carry (1) an explicit source-summary reference** — the
    `YYYY-MM-DD_summary.md` file (and `## Session HH:mm` section) it originated from or
    was last updated in — **and (2) enough resume-complete detail to continue WITHOUT
    opening that summary** (worktree/branch, how far it got, exact next step). The
    source reference is the fallback for when the item can't fully inline everything; it
    is never a substitute for (2) when the detail is knowable.
  - When a session resolves an item, remove it from `NEXT.md` **and** record that
    resolution explicitly in that session's own summary file (which item, how/where
    it was resolved — commit hash, worktree, etc.).
  - When an item is still open but progress was made, update its status in place
    (don't delete it) — leave enough detail (worktree/branch, how far it got) for the
    next session to resume, and refresh its source-summary reference to the session that
    just touched it.
  - New unresolved items go into `NEXT.md` as they're identified, tagged with the
    summary file they came from.
  - **Agent-owned items carry a `[담당: <agent>]` tag** (2026-10-30): per-agent history lives in `handoff/agents/<name>/` reports and `handoff/agents/history/`; NEXT.md keeps only current status, the next step, and a pointer. NEXT.md stays the single owner of "what to do next" — see `handoff/agents/README.md` "NEXT.md와의 관계".
  - Only remove an item once it is actually done — a session finding an item still
    open should leave it open ("wait" rather than prematurely closing it).

A `SessionStart` hook in `.claude/settings.json` automatically injects both `NEXT.md`
(if present) and the most recent `YYYY-MM-DD_summary.md` file (by filename sort order,
matched with a strict `^\d{4}-\d{2}-\d{2}_summary\.md$` pattern) as context at the start
of every new session, so this recap loop is self-sustaining without manual action. Older
daily summary files are not auto-injected — `NEXT.md` is what carries forward anything
from them that still matters.

**Relevance over recency (why the latest-summary load is not the memory).** The
auto-injected "most recent summary" is chosen purely by filename sort — it is a
*recent-activity glance*, not a search, and it has no guaranteed relationship to whatever
the next session will actually work on (which is almost always an open `NEXT.md` item,
and that item may trace back to a much older summary). So do **not** rely on the latest
summary to surface what matters; rely on `NEXT.md` being self-sufficient per the rule
above. When a `NEXT.md` item does need its full history, its source-summary reference
tells you exactly which file to open on demand — no need to load every summary up front.

**Acknowledge the load, every session:** the hook has no user-visible notification channel
— the injected content only lands in Claude's own context. So in your first reply of every
new session in this repo, state in one short line whether `NEXT.md` and/or a dated summary
were loaded (and which file), before doing anything else. If neither was injected (e.g.
`handoff/` was empty), say that too — don't silently proceed either way.
