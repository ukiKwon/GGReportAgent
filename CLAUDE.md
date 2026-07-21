# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 대화 스타일 (사용자 요청)

- 답변은 **10줄 이내**로, 사용자가 보기 쉽게 정리해서 제시한다.
- 상세 내용이 필요하거나 사용자에게 확인·선택을 물어야 하는 상황이면, 본문 아래에
  `🙋 **물어볼게:**` 로 분리해서 질문한다 (본문은 짧게 유지).
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

Every district folder lives under `giganlist/` (e.g. `giganlist/dobong/`,
`giganlist/jongno/`) — this includes both the original 5 districts (도봉→`dobong`,
노원→`nowon`, 광진→`gwangjin`, 동대문→`dongdaemun`, 동작→`dongjak`) and the districts added
since by the 25-district batch project. Each district has an identical two-stage folder
structure:

- **`giganlist/{district}/spec/`** — raw research findings: the district's multi-year policy
  plan (사업목록 및 예산 by chapter/분야), a website-verification pass
  (`0X_홈페이지검색확인결과.txt`, cross-checking whether each budgeted project can actually be
  found/confirmed on the district's own site), and a complaint-board survey for 2026
  (`0X_민원게시판_2026년정리.txt`). `00_인덱스.txt` in each `spec/` folder indexes and
  sanity-checks the other files (e.g. verifies per-chapter project counts and budget sums
  add up to the stated totals) — read it first when exploring a district's spec data.
- **`giganlist/{district}/plan/`** — derived proposal documents built from that district's
  spec data: `00_제안개요_및_배경`, `01_제안사업_요약표`, `02_IT디지털기획_사업제안` (IT-1, IT-2, …),
  `03_금전적지원_사업제안` (FN-1, FN-2, …), `04_실행로드맵_및_기대효과`, and
  `05_검증결과` — an independent validation pass scoring each proposed item for overlap
  with existing district projects and giving the district plan an overall 신뢰도(trust)
  score out of 100 (도봉 74, 노원 88, 광진 88, 동대문 82, 동작 84).
- **`giganlist/{district}/bank_ideas_draft.txt`** — a separate, later-added draft layer that
  re-reads a district's full spec+plan and proposes bank-partnership angles (소상공인금융/
  청년금융/IT협력/복지주택금융/SOC참여). Explicitly a draft only — not merged into
  `plan/`, and every idea in it cites back to a specific `spec/NN` or `plan/NN` source by
  file index (e.g. `spec/02(1장-4)`, `plan FN-1`) so claims stay traceable to real
  district data.
- **`total/`** — the combined cross-district output:
  `서울시_5개구청_사업제안기획안.docx` and the matching `.html` (tabbed by district, one
  subtab per plan section, district identity colors from the dataviz skill's categorical
  palette). These are the actual current deliverables.
- **`build_report.py`** — generates the DOCX version (python-docx: cover page → one
  1-page summary per district → per-district detail chapters).
- **`build_html_report.py`** — generates the HTML version (sidebar/tab navigation per
  district, subtabs per plan section; per-district `district_colors`, `trust_scores`,
  `budget_info`, `key_problems`, `top_projects` dicts are hardcoded near the top of the
  file — update those in place rather than re-deriving them from spec files by hand).
- **`구청_log.md`** — timestamped work log of how all of the above was produced (mostly
  parallel background research agents). Read it before assuming a spec/plan file's
  provenance or before treating a discrepancy as a bug rather than known history.
- **`html_한글화_계획.md`** — a draft plan (not yet applied to source) for replacing the
  English tokens `spec`/`plan` with Korean equivalents throughout the HTML output and its
  source `.txt` files. Read this before doing any find/replace on `spec`/`plan` strings —
  it documents which occurrences are file-index references that must keep their numeric
  suffix vs. free-text usages that can be reworded outright.
- **`gigan.zip`** — archive of this project's contents; not a source of truth, don't
  extract-and-edit into it.

## Important gotcha: hardcoded output paths don't match this repo's layout

Both `build_report.py` (`DOC_PATH`) and `build_html_report.py` (`OUT_PATH`) still point at
`C:\claude_workspace\서울시_5개구청_사업제안기획안.{docx,html}` — the parent directory,
from when the district folders lived one level up (before the `기관/`→repo split recorded
in `구청_log.md`). The actual current deliverables live in `total/` **inside this repo**.
Running either script as-is will write to the old parent-directory path, not update the
files in `total/`. Fix `DOC_PATH`/`OUT_PATH` (and double check any relative reads of
`giganlist/{district}/plan/*.txt` against the current working directory) before rerunning
either generator.

Both scripts also duplicate source content as hardcoded Python dicts/strings rather than
reading district `plan/`/`spec/` `.txt` files at generation time — when a district's
underlying research changes, the corresponding dict in the build script needs a matching
manual update, not just an edit to the `.txt` file.

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
  to know what's still open. Rules for maintaining it:
  - When a session resolves an item, remove it from `NEXT.md` **and** record that
    resolution explicitly in that session's own summary file (which item, how/where
    it was resolved — commit hash, worktree, etc.).
  - When an item is still open but progress was made, update its status in place
    (don't delete it) — leave enough detail (worktree/branch, how far it got) for the
    next session to resume.
  - New unresolved items go into `NEXT.md` as they're identified, tagged with the
    summary file they came from.
  - Only remove an item once it is actually done — a session finding an item still
    open should leave it open ("wait" rather than prematurely closing it).

A `SessionStart` hook in `.claude/settings.json` automatically injects both `NEXT.md`
(if present) and the most recent `YYYY-MM-DD_summary.md` file (by filename sort order,
matched with a strict `^\d{4}-\d{2}-\d{2}_summary\.md$` pattern) as context at the start
of every new session, so this recap loop is self-sustaining without manual action. Older
daily summary files are not auto-injected — `NEXT.md` is what carries forward anything
from them that still matters.

**Acknowledge the load, every session:** the hook has no user-visible notification channel
— the injected content only lands in Claude's own context. So in your first reply of every
new session in this repo, state in one short line whether `NEXT.md` and/or a dated summary
were loaded (and which file), before doing anything else. If neither was injected (e.g.
`handoff/` was empty), say that too — don't silently proceed either way.
