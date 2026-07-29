# 리포 재구성 ①~③단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 재구성 스펙 §⑦의 게이트 없는 앞 3단계를 실행한다 — ①1세대 산출물을 `archive/`로 격리, ②시스템 생성물(`registry.db`·PPTX)을 `data/`로 분리, ③`corpus/` 부분 신설(`RFP/`→`corpus/rfp/`, `report/`→`corpus/reports/`, `corpus/inbox/` 생성). ④(giganlist 이동)는 corpus-validation 병합(NEXT.md 항목 1) 완료 전이므로 **이 계획의 범위 밖**이다.

**Architecture:** 코드 수정은 ②단계의 경로 기본값 3곳뿐이고 나머지는 전부 `git mv` + 문서 참조 갱신이다. 각 단계는 독립 커밋으로 완결되며 어느 시점에 멈춰도 리포가 깨지지 않는다(스펙 §⑦의 보장을 커밋 단위로 구현).

**Tech Stack:** git mv, Python 3.14 (`py -3`), pytest. **코드 신규 작성 없음, 신규 의존성 없음.**

**설계 근거:** `docs/superpowers/specs/2026-07-29-repo-restructure-design.md` §④·§⑦

## 계획 작성 시점의 사전 조사 결과 (착수 시 재확인)

- `tmp/`·`workflow/`는 **이미 존재하지 않는다** (2026-07-29 확인, untracked 파일 0건).
  스펙 §⑦ 1단계의 "tmp/ 내용물 이동·빈 폴더 삭제"는 **no-op** — 확인만 하고 넘어간다.
  NEXT.md가 우려한 `tmp/KB_AI_Lab_교육내용정리.html` 보존 문제도 함께 소멸.
- 1세대 산출물의 코드 참조: `build_report.py`·`build_html_report.py` **자기 자신뿐**
  (`*.py` 전체 grep 확인). 문서 참조는 CLAUDE.md에 다수 — Task 1에서 갱신.
- `RFP/`·`report/` 경로의 코드 참조: `backend/`·`agent/`·`dashboard/`의 `.py`에서 **0건**.
  (`report_new/`는 별개 — finalize 산출물 폴더로, ②단계에서 `data/`로 흡수.)
- `registry.db` 경로 기본값: `backend/main.py:22`(`REGISTRY_DB_PATH` env 기본값),
  `backend/seed.py:7`(`DEFAULT_DB_PATH`). 테스트는 전부 `tmp_path` 주입이라 영향 없음.
- PPTX 산출 기본값: `backend/main.py:11`·`backend/assembler.py:16`의
  `output_root: str = "report_new"`. 테스트는 전부 주입이라 영향 없음.
- 현재 테스트 기준선: `py -3 -m pytest backend agent -q` → **96 passed** (backend 72 + agent 24).

## Global Constraints

- 이 머신에서 맨 `python`/`pip`는 Windows Store 스텁 — **항상 `py -3`**.
- 브랜치 `restructure-stage1-3`에서 작업한다. 다른 세션이 같은 리포에서 작업 중일 수
  있으므로 **경로를 명시한 커밋**(`git add <paths>`)만 사용, `git add -A` 금지.
- 파일 이동은 반드시 `git mv`로 (히스토리 보존).
- `giganlist/`·`backend/` 로직·`agent/` 로직은 **건드리지 않는다** (②단계 기본값 문자열
  3곳 제외). corpus-validation 브랜치와의 병합 충돌 면적을 최소화하기 위함.
- 각 Task 완료 시점마다 `py -3 -m pytest backend agent -q` → **96 passed** 유지 확인.
- 커밋 메시지에 스펙 §⑦의 몇 단계인지 명시한다.

---

### Task 1: ①단계 — 무위험 정리 (`archive/` 신설)

**Files:**
- Move → `archive/`: `build_report.py`, `build_html_report.py`, `gigan.zip`,
  `html_한글화_계획.md`, `구청_log.md`, `GGReportAgent_가이드.html`,
  `GGReportAgent_사업제안보고서.html`, `GGReportAgent_사업제안보고서_dark.html`
- Move: `log/` → `archive/log/`
- Update: `CLAUDE.md` (이동한 파일들의 경로 서술 갱신)

- [ ] **Step 1: 이동 전 참조 재확인**

```bash
grep -rn --include="*.py" -e build_report -e build_html_report -e "구청_log" giganlist backend agent dashboard docs
```

build 스크립트 자기 참조 외 0건이어야 한다. 새 참조가 생겼으면 멈추고 보고.

- [ ] **Step 2: `git mv`로 이동**

```bash
mkdir archive
git mv build_report.py build_html_report.py gigan.zip html_한글화_계획.md 구청_log.md archive/
git mv GGReportAgent_가이드.html GGReportAgent_사업제안보고서.html GGReportAgent_사업제안보고서_dark.html archive/
git mv log archive/log
```

- [ ] **Step 3: CLAUDE.md 갱신** — Layout 섹션에서 `build_report.py`·`build_html_report.py`·
  `구청_log.md`·`html_한글화_계획.md`·`gigan.zip` 서술의 경로 앞에 `archive/`를 붙이고,
  "1세대 산출물은 `archive/`로 격리됨(재구성 스펙 §⑦ 1단계)" 한 줄을 추가한다.
  내용 서술 자체는 유지(스크립트 gotcha 문단 등은 여전히 유효).

- [ ] **Step 4: 테스트 + 커밋**

```bash
py -3 -m pytest backend agent -q   # 96 passed
git add archive CLAUDE.md
git commit -m "refactor(restructure): stage 1 — archive 1st-gen artifacts and log/ (spec §⑦-1)"
```

### Task 2: ②단계 — `data/` 분리

**Files:**
- Modify: `backend/main.py` (경로 기본값 2곳), `backend/seed.py` (`DEFAULT_DB_PATH`),
  `backend/assembler.py` (`output_root` 기본값), `.gitignore`
- Create: `data/.gitkeep`

- [ ] **Step 1: 기본값 교체** — 기본값 문자열만 바꾼다(시그니처·로직 불변):
  - `backend/main.py:22` — `"registry.db"` → `"data/registry.db"`
  - `backend/seed.py:7` — `DEFAULT_DB_PATH = "registry.db"` → `"data/registry.db"`
  - `backend/main.py:11`·`backend/assembler.py:16` — `"report_new"` → `"data/report_new"`
  - `init_db`/`seed`가 부모 디렉터리를 만들어 주는지 확인 — 안 만들면
    `os.makedirs(parent, exist_ok=True)` 한 줄을 db 초기화 직전에 추가(이 계획에서
    허용되는 유일한 로직성 변경).

- [ ] **Step 2: `.gitignore` 갱신** — `registry.db`·`report_new/` 항목을 `data/` 단일
  항목으로 교체하고 `!data/.gitkeep` 예외를 둔다. `data/.gitkeep` 생성.
  루트에 실존하는 `registry.db`(gitignored)는 `data/`로 **파일 이동**(git 추적 밖이라
  `mv` — 다른 세션이 서버를 띄워 사용 중이면 멈추고 사용자에게 확인).

- [ ] **Step 3: 테스트 + 커밋**

```bash
py -3 -m pytest backend agent -q   # 96 passed (테스트는 전부 경로 주입이라 무영향이어야 함)
git add backend/main.py backend/seed.py backend/assembler.py .gitignore data/.gitkeep
git commit -m "refactor(restructure): stage 2 — split system artifacts into data/ (spec §⑦-2)"
```

`docs/실행가이드_backend-agent.md`의 registry.db 서술도 이 커밋에 포함해 갱신한다.

### Task 3: ③단계 — `corpus/` 부분 신설

**Files:**
- Move: `RFP/` → `corpus/rfp/`, `report/` → `corpus/reports/`
- Create: `corpus/inbox/.gitkeep`
- Update: `CLAUDE.md`, `.claude/skills/rfp-locate/SKILL.md`(참조 있으면), 기타 grep으로 걸리는 문서

- [ ] **Step 1: 이동 전 참조 확인**

```bash
grep -rn --include="*.py" -e "RFP/" -e "RFP\\\\" backend agent dashboard        # 0건 예상
grep -rln -e "RFP/" -e "report/" CLAUDE.md .claude docs architecture handoff    # 문서 참조 목록 수집
```

코드 참조가 나오면 멈추고 보고. (`handoff/`는 과거 기록이므로 **갱신하지 않는다** —
append-only 규약. 목록 수집은 참고용.)

- [ ] **Step 2: `git mv` + inbox 생성**

```bash
mkdir corpus
git mv RFP corpus/rfp
git mv report corpus/reports
mkdir corpus/inbox && touch corpus/inbox/.gitkeep
```

- [ ] **Step 3: 문서 갱신** — CLAUDE.md의 `report/` 섹션 경로를 `corpus/reports/`로,
  Step 1에서 걸린 살아있는 문서(`docs/`·`architecture/`·스킬)의 `RFP/`·`report/` 경로를
  갱신. `handoff/` 과거 세션 섹션은 제외.

- [ ] **Step 4: 테스트 + 커밋**

```bash
py -3 -m pytest backend agent -q   # 96 passed
git add corpus CLAUDE.md docs architecture .claude
git commit -m "refactor(restructure): stage 3 — corpus/{rfp,reports,inbox} (spec §⑦-3)"
```

### Task 4: 마무리 — 검증·병합 준비

- [ ] `py -3 -m pytest backend agent -q` 96 passed +
  `node --test dashboard/test/*.test.js` 36 passed 최종 확인.
- [ ] `git log --oneline main..HEAD` — 커밋 3개(단계당 1개)인지 확인.
- [ ] main 병합은 **사용자 확인 후** — corpus-validation 병합(NEXT.md 항목 1)과의 순서를
  사용자가 정한다(먼저 병합돼도 이 브랜치와 충돌 면적 없음: 겹치는 파일은
  `.gitignore`·`backend/db.py` 정도이고 이 계획은 `db.py`를 건드리지 않는다).
- [ ] 병합 후 NEXT.md 항목 2 상태 갱신(①~③ 완료, ④는 항목 1 게이트 유지) + 당일
  summary에 세션 섹션 append.
