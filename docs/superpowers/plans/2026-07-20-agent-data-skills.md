# Agent Data Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two Claude Code skills — `rfp-locate` (find an RFP PDF and extract its text + scoring table) and `institution-corpus-format` (the standard spec/plan/bank_ideas_draft document format for any local government or public institution) — as documented in `docs/superpowers/specs/2026-07-20-agent-data-skills-design.md`.

**Architecture:** Both skills live under `.claude/skills/` (Claude Code's project-level skill directory) as `SKILL.md` + supporting files. `rfp-locate` bundles two Python scripts (`extract_text.py` using pypdf, `render_pages.py` using PyMuPDF) that Claude runs via Bash; both scripts are pure functions tested directly against the sample RFP PDF already in this repo. `institution-corpus-format` is a reference-only skill (no scripts) — it bundles three reference excerpt files pulled verbatim from the existing `dobong/` corpus so Claude can see real formatting without copying `dobong`'s actual data into a new institution's files.

**Tech Stack:** Python 3.12 (already installed), `pypdf` 6.14.2 (already installed), `pymupdf` 1.28.0 (already installed) — no new dependencies to install.

## Global Constraints

- Both skills are Reference/Technique-type skills per `superpowers:writing-skills` (not discipline-enforcing) — test via retrieval/application scenarios, not adversarial pressure-testing.
- `SKILL.md` frontmatter: only `name` and `description` fields, `name` uses lowercase letters/numbers/hyphens only, `description` starts with "Use when..." and states triggering conditions only (never summarizes the workflow).
- No new Python dependencies — `pypdf` and `pymupdf` are already installed system-wide; scripts must not assume a virtualenv or requirements.txt.
- Sample RFP for testing: `RFP/수원시 금고 지정 계획 공고문.pdf` (6 pages; pypdf extracts all 6 pages cleanly with 0 replacement characters, total 3965 chars, avg ~660 chars/page; scoring table is on page index 5 (page 6) as `【별표1】금고지정 평가항목 및 배점`, raw text run-on without table structure — column boundaries do NOT survive extraction, so scoring-table structuring requires an LLM/vision pass, not regex).
- Scoring-table JSON output path: `report_new/{institution}/rfp_scoring.json`; raw text at `report_new/{institution}/rfp_text.txt` (per spec Skill 1 §6).
- All spec/plan/bank_ideas_draft file names and numbering in `institution-corpus-format` must match the spec document's tables exactly (`00_인덱스.txt`, `01_개요.txt`, `0N_{장명}_사업목록_예산.txt`, `0N_홈페이지검색확인결과.txt`, `0N_민원게시판_YYYY년정리.txt` for `spec/`; `00_제안개요_및_배경.txt` through `05_검증결과.txt` for `plan/`).
- Reference excerpts pulled from `dobong/` must be labeled as examples only, with an explicit "원본 그대로 재사용 금지" instruction in the skill body (per spec Skill 2 "포함 파일" section).
- Abnormal-text threshold (from spec §4): average chars/page < 50, OR fraction of `�` (U+FFFD) replacement characters across all page text > 1%.

---

### Task 1: `extract_text.py` — pypdf text extraction with abnormality detection

**Files:**
- Create: `.claude/skills/rfp-locate/scripts/extract_text.py`
- Test: `.claude/skills/rfp-locate/scripts/test_extract_text.py`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `extract_pdf_text(pdf_path: str) -> dict` — returns `{"pages": [str, ...], "full_text": str, "avg_chars_per_page": float, "is_abnormal": bool, "abnormal_reason": str | None}`
  - `is_text_abnormal(pages: list[str]) -> tuple[bool, str | None]` — returns `(True, reason)` if abnormal, else `(False, None)`. Abnormal if average chars/page < 50, OR if the fraction of `�` (U+FFFD) replacement characters across all page text exceeds 1%.
  - CLI: `python extract_text.py <pdf_path> [--out <json_path>]` — prints the dict as JSON to stdout, or writes to `--out` if given.

- [ ] **Step 1: Write the failing tests**

Create `.claude/skills/rfp-locate/scripts/test_extract_text.py`:

```python
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from extract_text import extract_pdf_text, is_text_abnormal

SAMPLE_RFP = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
    "RFP", "수원시 금고 지정 계획 공고문.pdf",
)


def test_extract_pdf_text_normal_pdf():
    result = extract_pdf_text(SAMPLE_RFP)
    assert result["is_abnormal"] is False
    assert result["abnormal_reason"] is None
    assert len(result["pages"]) == 6
    assert "수원시" in result["full_text"]
    assert "【별표1】" in result["pages"][5] or "별표" in result["pages"][5]
    assert result["avg_chars_per_page"] > 50


def test_is_text_abnormal_short_pages():
    pages = ["a" * 10, "b" * 5, "c" * 8]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is True
    assert "avg" in reason.lower() or "char" in reason.lower()


def test_is_text_abnormal_replacement_chars():
    pages = ["normal text here, plenty of characters to pass length check " * 3,
             "�" * 200 + "more text to pad length past fifty chars per page"]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is True
    assert "replacement" in reason.lower() or "�" in reason


def test_is_text_abnormal_clean_text():
    pages = ["normal readable text " * 10, "more normal readable text here " * 10]
    abnormal, reason = is_text_abnormal(pages)
    assert abnormal is False
    assert reason is None


def test_cli_prints_json_to_stdout():
    script = os.path.join(os.path.dirname(__file__), "extract_text.py")
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    data = json.loads(result.stdout)
    assert data["is_abnormal"] is False
    assert len(data["pages"]) == 6


def test_cli_writes_to_out_file(tmp_path):
    script = os.path.join(os.path.dirname(__file__), "extract_text.py")
    out_path = tmp_path / "result.json"
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP, "--out", str(out_path)],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    data = json.loads(out_path.read_text(encoding="utf-8"))
    assert len(data["pages"]) == 6
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest .claude/skills/rfp-locate/scripts/test_extract_text.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'extract_text'` (file doesn't exist yet)

- [ ] **Step 3: Write minimal implementation**

Create `.claude/skills/rfp-locate/scripts/extract_text.py`:

```python
import argparse
import json

import pypdf


def is_text_abnormal(pages: list[str]) -> tuple[bool, str | None]:
    total_chars = sum(len(p) for p in pages)
    avg_chars_per_page = total_chars / len(pages) if pages else 0
    if avg_chars_per_page < 50:
        return True, f"avg chars/page {avg_chars_per_page:.1f} is below 50 threshold"

    full_text = "\n".join(pages)
    if full_text:
        replacement_ratio = full_text.count("�") / len(full_text)
        if replacement_ratio > 0.01:
            return True, f"replacement char (�) ratio {replacement_ratio:.1%} exceeds 1%"

    return False, None


def extract_pdf_text(pdf_path: str) -> dict:
    reader = pypdf.PdfReader(pdf_path)
    pages = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(pages)
    avg_chars_per_page = (sum(len(p) for p in pages) / len(pages)) if pages else 0
    is_abnormal, abnormal_reason = is_text_abnormal(pages)

    return {
        "pages": pages,
        "full_text": full_text,
        "avg_chars_per_page": avg_chars_per_page,
        "is_abnormal": is_abnormal,
        "abnormal_reason": abnormal_reason,
    }


def main():
    parser = argparse.ArgumentParser(description="Extract text from a PDF via pypdf")
    parser.add_argument("pdf_path")
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    result = extract_pdf_text(args.pdf_path)
    output = json.dumps(result, ensure_ascii=False, indent=2)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
    else:
        print(output)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest .claude/skills/rfp-locate/scripts/test_extract_text.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/rfp-locate/scripts/extract_text.py .claude/skills/rfp-locate/scripts/test_extract_text.py
git commit -m "feat: add pypdf text extraction script for rfp-locate skill"
```

---

### Task 2: `render_pages.py` — PyMuPDF page-to-image rendering (fallback path)

**Files:**
- Create: `.claude/skills/rfp-locate/scripts/render_pages.py`
- Test: `.claude/skills/rfp-locate/scripts/test_render_pages.py`

**Interfaces:**
- Consumes: nothing directly (invoked manually by Claude when `extract_text.py`'s `is_abnormal` is `True`)
- Produces:
  - `render_pdf_pages(pdf_path: str, out_dir: str, dpi: int = 200) -> list[str]` — renders every page to a PNG in `out_dir`, returns the list of written file paths in page order (`page_0.png`, `page_1.png`, ...).
  - CLI: `python render_pages.py <pdf_path> <out_dir> [--dpi 200]` — renders pages, prints the list of written paths (one per line) to stdout.

- [ ] **Step 1: Write the failing tests**

Create `.claude/skills/rfp-locate/scripts/test_render_pages.py`:

```python
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(__file__))
from render_pages import render_pdf_pages

SAMPLE_RFP = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "..",
    "RFP", "수원시 금고 지정 계획 공고문.pdf",
)


def test_render_pdf_pages_writes_one_png_per_page(tmp_path):
    out_dir = str(tmp_path)
    paths = render_pdf_pages(SAMPLE_RFP, out_dir)
    assert len(paths) == 6
    for p in paths:
        assert os.path.isfile(p)
        assert p.endswith(".png")
        assert os.path.getsize(p) > 0


def test_render_pdf_pages_are_in_page_order(tmp_path):
    out_dir = str(tmp_path)
    paths = render_pdf_pages(SAMPLE_RFP, out_dir)
    names = [os.path.basename(p) for p in paths]
    assert names == [f"page_{i}.png" for i in range(6)]


def test_cli_renders_and_prints_paths(tmp_path):
    script = os.path.join(os.path.dirname(__file__), "render_pages.py")
    out_dir = str(tmp_path)
    result = subprocess.run(
        [sys.executable, script, SAMPLE_RFP, out_dir],
        capture_output=True, text=True, encoding="utf-8",
    )
    assert result.returncode == 0
    printed = [line for line in result.stdout.strip().splitlines() if line]
    assert len(printed) == 6
    assert all(os.path.isfile(p) for p in printed)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest .claude/skills/rfp-locate/scripts/test_render_pages.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'render_pages'`

- [ ] **Step 3: Write minimal implementation**

Create `.claude/skills/rfp-locate/scripts/render_pages.py`:

```python
import argparse
import os

import fitz  # PyMuPDF


def render_pdf_pages(pdf_path: str, out_dir: str, dpi: int = 200) -> list[str]:
    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)
    written = []
    for i, page in enumerate(doc):
        pixmap = page.get_pixmap(dpi=dpi)
        out_path = os.path.join(out_dir, f"page_{i}.png")
        pixmap.save(out_path)
        written.append(out_path)
    return written


def main():
    parser = argparse.ArgumentParser(description="Render PDF pages to PNG via PyMuPDF")
    parser.add_argument("pdf_path")
    parser.add_argument("out_dir")
    parser.add_argument("--dpi", type=int, default=200)
    args = parser.parse_args()

    paths = render_pdf_pages(args.pdf_path, args.out_dir, dpi=args.dpi)
    for p in paths:
        print(p)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest .claude/skills/rfp-locate/scripts/test_render_pages.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/rfp-locate/scripts/render_pages.py .claude/skills/rfp-locate/scripts/test_render_pages.py
git commit -m "feat: add PyMuPDF page rendering fallback script for rfp-locate skill"
```

---

### Task 3: `references/scoring_schema.json` — scoring table JSON schema example

**Files:**
- Create: `.claude/skills/rfp-locate/references/scoring_schema.json`

**Interfaces:**
- Consumes: nothing (reference document, not executed)
- Produces: an example JSON file that `SKILL.md` (Task 4) links to and that downstream skills/agents can copy the shape from.

- [ ] **Step 1: Write the reference file**

Create `.claude/skills/rfp-locate/references/scoring_schema.json`, using the real 수원시 금고 지정 RFP scoring table (page index 5) as the worked example:

```json
{
  "institution": "수원시",
  "rfp_title": "수원시 금고 지정 계획 공고문",
  "total_score": 100,
  "criteria": [
    {
      "category": "금융기관의 대내외적 신용도 및 재무구조의 안정성",
      "item": "외부기관의 신용조사 상태평가",
      "score": 8,
      "description": "국외평가기관(4점) + 국내평가기관(4점). 지역조합은 국내평가기관 신용조사만으로 전체 배점(8점) 평가."
    },
    {
      "category": "금융기관의 대내외적 신용도 및 재무구조의 안정성",
      "item": "주요 경영지표 현황",
      "score": 17,
      "description": "총자본비율(6점, 지역조합은 순자본비율), 고정이하여신비율(6점), 자기자본이익율(5점)."
    },
    {
      "category": "시에 대한 대출 및 예금금리",
      "item": "정기예금 예치금리, 수시입출금식 예금 적용 금리, 시에 대한 대출금리, 정기예금 만기경과 시 적용금리",
      "score": 21,
      "description": null
    },
    {
      "category": "시민이용 편의성",
      "item": "관내 지점 수, 무인점포 수, ATM 설치 대수 / 지방세입금 수납처리능력 / 지방세입금 납부편의 증진방안",
      "score": 22,
      "description": "금고 지정 여부에 따라 필수로 설치되는 지점은 제외."
    },
    {
      "category": "금고업무 관리능력",
      "item": "세입세출업무 자금관리 능력 / 금고관리업무 수행능력 / 전산시스템 보안관리 등 전산처리능력 / OCR센터 운영능력 및 계획",
      "score": 25,
      "description": "전산시스템 보안인증 등 전산보안 강화 평가."
    },
    {
      "category": "지역사회기여 및 시와의 협력사업",
      "item": "지역사회에 대한 기여실적 / 시와의 협력사업계획",
      "score": 7,
      "description": "기여는 '실적'으로만, 협력사업은 '계획'으로만 평가."
    }
  ]
}
```

- [ ] **Step 2: Verify the file is valid JSON**

Run: `python -c "import json; json.load(open('.claude/skills/rfp-locate/references/scoring_schema.json', encoding='utf-8')); print('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/rfp-locate/references/scoring_schema.json
git commit -m "docs: add scoring table JSON schema reference for rfp-locate skill"
```

---

### Task 4: `rfp-locate/SKILL.md` — skill instructions

**Files:**
- Create: `.claude/skills/rfp-locate/SKILL.md`

**Interfaces:**
- Consumes: `extract_text.py` (Task 1), `render_pages.py` (Task 2), `references/scoring_schema.json` (Task 3) — all referenced by relative path from this file.
- Produces: the complete, discoverable `rfp-locate` skill.

- [ ] **Step 1: Write `SKILL.md`**

Create `.claude/skills/rfp-locate/SKILL.md`:

```markdown
---
name: rfp-locate
description: Use when starting proposal work for a new institution's RFP (공고문), when asked to find or locate an RFP PDF, or when asked to extract a scoring table (배점표) from an RFP document
---

# rfp-locate

## Overview

Finds the RFP (공고문) PDF for the institution being worked on, extracts its full text, and structures its scoring table (배점표: evaluation items and point weights) into JSON. Downstream proposal-writing work (requirement extraction, section/slide planning) consumes this skill's output rather than re-parsing the PDF.

## When to Use

- User says "RFP 찾아줘" or "배점표 추출해줘"
- Starting proposal work for a new local-government or public-institution RFP and no scoring table JSON exists yet for it

## Workflow

1. **Locate the PDF** — scan `RFP/` in the repo root.
   - Exactly one PDF present → use it.
   - Multiple PDFs → ask the user which one; never guess.
   - Empty folder → search the web for the institution's official announcement PDF by name; if found, download it into `RFP/` and confirm with the user before proceeding. If not found, ask the user to upload the file or provide a path — never fabricate content.
2. **Extract text** — run `scripts/extract_text.py <pdf_path>`. This returns `pages`, `full_text`, `avg_chars_per_page`, `is_abnormal`, `abnormal_reason`.
3. **Fallback if abnormal** — if `is_abnormal` is `true` (avg chars/page under 50, or over 1% replacement characters — typically a CID-font or image-embedded PDF), run `scripts/render_pages.py <pdf_path> <out_dir>` to render each page to PNG, then read each PNG with the Read tool (vision) to recover the text and scoring table by inspection. This is not a hypothetical case — 도봉구's 4개년계획 PDF required exactly this fallback (see `구청_log.md` 14:11–14:29).
4. **Structure the scoring table** — from the extracted (or vision-read) text, produce a JSON object matching `references/scoring_schema.json`'s shape: `institution`, `rfp_title`, `total_score`, and a `criteria` list of `{category, item, score, description}`. The raw extracted text does not preserve table column boundaries (verified on the sample RFP: the scoring table's 항목/세부항목/배점/비고 columns collapse into one text run) — this structuring step requires reading the text and reconstructing the table, not a mechanical parse.
5. **Save outputs**:
   - `report_new/{institution}/rfp_scoring.json` — the structured scoring table
   - `report_new/{institution}/rfp_text.txt` — the full extracted (or vision-read) text

## Error Handling

- Never guess a missing file or an unclear extraction result — always confirm with the user.
- A scoring table may not exist in every RFP. If none is found after a genuine attempt, save `"criteria": []` and tell the user no scoring table was found — an empty list is a valid result, not a failure.

## Reference

- `references/scoring_schema.json` — worked example using the 수원시 금고 지정 RFP's actual scoring table.
```

- [ ] **Step 2: Verify frontmatter is valid**

Run: `python -c "
import re
text = open('.claude/skills/rfp-locate/SKILL.md', encoding='utf-8').read()
m = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
assert m, 'no frontmatter found'
assert 'name: rfp-locate' in m.group(1)
assert 'description: Use when' in m.group(1)
print('frontmatter ok')
"`
Expected: `frontmatter ok`

- [ ] **Step 3: Manually verify the skill is usable** (retrieval/application scenario, per superpowers:writing-skills reference-skill testing — not adversarial pressure testing)

Open a fresh conversation context (or simulate by re-reading only this file with no prior context) and confirm:
- The description alone tells you when to invoke this skill (no workflow summary leaked into the trigger)
- Following the workflow steps in order, using only `scripts/extract_text.py` and `scripts/render_pages.py` as documented, actually produces a valid `rfp_scoring.json` for `RFP/수원시 금고 지정 계획 공고문.pdf`

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/rfp-locate/SKILL.md
git commit -m "docs: add rfp-locate SKILL.md"
```

---

### Task 5: `institution-corpus-format` reference excerpts

**Files:**
- Create: `.claude/skills/institution-corpus-format/references/dobong_spec_sample.txt`
- Create: `.claude/skills/institution-corpus-format/references/dobong_plan_sample.txt`
- Create: `.claude/skills/institution-corpus-format/references/dobong_bank_ideas_sample.txt`

**Interfaces:**
- Consumes: `dobong/spec/00_인덱스.txt`, `dobong/plan/00_제안개요_및_배경.txt`, `dobong/plan/01_제안사업_요약표.txt`, `dobong/bank_ideas_draft.txt` (existing files, read-only source material)
- Produces: three excerpt files that Task 6's `SKILL.md` links to as format examples.

- [ ] **Step 1: Create `dobong_spec_sample.txt`**

Copy the full content of `dobong/spec/00_인덱스.txt` verbatim into `.claude/skills/institution-corpus-format/references/dobong_spec_sample.txt`, and prepend this header before the copied content:

```
[예시 발췌 — 원본 그대로 재사용 금지. 신규 기관 작업 시 형식만 참고할 것.
 출처: dobong/spec/00_인덱스.txt]

```

(then the verbatim content of `dobong/spec/00_인덱스.txt` follows)

- [ ] **Step 2: Create `dobong_plan_sample.txt`**

Concatenate `dobong/plan/00_제안개요_및_배경.txt` and `dobong/plan/01_제안사업_요약표.txt` into `.claude/skills/institution-corpus-format/references/dobong_plan_sample.txt`, with the same warning header prepended once at the top, and a `--- (01_제안사업_요약표.txt) ---` divider between the two files' content:

```
[예시 발췌 — 원본 그대로 재사용 금지. 신규 기관 작업 시 형식만 참고할 것.
 출처: dobong/plan/00_제안개요_및_배경.txt + dobong/plan/01_제안사업_요약표.txt]

(... verbatim content of 00_제안개요_및_배경.txt ...)

--- (01_제안사업_요약표.txt) ---

(... verbatim content of 01_제안사업_요약표.txt ...)
```

- [ ] **Step 3: Create `dobong_bank_ideas_sample.txt`**

Copy the first ~60 lines of `dobong/bank_ideas_draft.txt` (through at least one complete numbered category and 2-3 full idea entries) into `.claude/skills/institution-corpus-format/references/dobong_bank_ideas_sample.txt`, with the same warning header style prepended:

```
[예시 발췌 — 원본 그대로 재사용 금지. 신규 기관 작업 시 형식만 참고할 것.
 출처: dobong/bank_ideas_draft.txt (앞부분 발췌)]

(... verbatim excerpt of dobong/bank_ideas_draft.txt, first category + 2-3 idea entries ...)
```

- [ ] **Step 4: Verify excerpts contain the warning header**

Run: `for f in .claude/skills/institution-corpus-format/references/dobong_*.txt; do grep -q "원본 그대로 재사용 금지" "$f" || echo "MISSING WARNING: $f"; done`
Expected: no output (all three files contain the warning)

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/institution-corpus-format/references/
git commit -m "docs: add dobong reference excerpts for institution-corpus-format skill"
```

---

### Task 6: `institution-corpus-format/SKILL.md` — format rules

**Files:**
- Create: `.claude/skills/institution-corpus-format/SKILL.md`

**Interfaces:**
- Consumes: the three reference files from Task 5, `rfp-locate`'s `rfp_scoring.json` shape (Task 3/4) for the note about `plan/02...`, `03...` category naming.
- Produces: the complete, discoverable `institution-corpus-format` skill.

- [ ] **Step 1: Write `SKILL.md`**

Create `.claude/skills/institution-corpus-format/SKILL.md`:

```markdown
---
name: institution-corpus-format
description: Use when writing or reviewing spec/plan/bank_ideas_draft files for a local government or public institution, or when checking an existing district's files against the standard format
---

# institution-corpus-format

## Overview

Defines the standard file layout, section format, and citation rules for `{institution}/spec/`, `{institution}/plan/`, and `{institution}/bank_ideas_draft.txt` — for any local government or public institution, not only the existing 5 districts (도봉/노원/광진/동대문/동작). This skill governs format only; researching and writing the actual content is separate work.

## When to Use

- Organizing web-research findings into `spec/` files for a new institution
- Writing or reviewing a `plan/` proposal document
- Drafting `bank_ideas_draft.txt`
- Double-checking an existing district's files still match the standard format

## `{institution}/spec/` — raw research (numbering fixed, chapter names vary by institution)

| File | Content |
|---|---|
| `00_인덱스.txt` | One-line summary per file, plus a self-check: total item count and budget sum shown as chapter-sums = grand-total |
| `01_개요.txt` | Institution's plan overview, vision/goals, chapter structure, total budget |
| `0N_{장명}_사업목록_예산.txt` | Numbered items (`N-M`), budget, year-by-year table. Chapter names/count follow that institution's own plan structure — do not force district chapter names onto a different institution |
| `0N_홈페이지검색확인결과.txt` | Cross-check each project against the institution's own website. Classify as exactly one of **확인됨 / 부분확인 / 확인안됨** — "확인안됨" means a search limitation, not that the project was cancelled |
| `0N_민원게시판_YYYY년정리.txt` | Latest-year complaint-channel activity and pattern summary |

New institutions: gather this via web search. The 5 existing districts (도봉/노원/광진/동대문/동작) are already-complete reference templates — do not re-research them.

## `{institution}/plan/` — proposal documents (every claim cites spec)

| File | Content |
|---|---|
| `00_제안개요_및_배경.txt` | Proposal rationale and background |
| `01_제안사업_요약표.txt` | Table columns: 번호(`IT-N`/`FN-N`) / 사업명 / 우선순위 / 추정예산 / 담당(추정) / **연계 근거(spec/NN)** |
| `02_..._사업제안.txt`, `03_...` | Category-specific detail. Categories should follow the RFP's scoring-table categories (from `rfp-locate`'s `rfp_scoring.json`) when one exists — the dobong "IT디지털기획/금전적지원" 2-category split is an example, not a fixed schema |
| `04_실행로드맵_및_기대효과.txt` | Execution schedule, expected effects |
| `05_검증결과.txt` | Per-item **중복여부/타당성등급/판단근거/수정권고사항**, plus an overall trust score (/100). `판단근거` must cross-check citation accuracy against the spec source itself — if a citation is wrong or exaggerated, flag it in `수정권고사항` and lower the grade |

## `{institution}/bank_ideas_draft.txt`

- Header states: "초안(draft) — 정식 반영 전, plan 반영 여부 별도 검토 필요"
- States its evidence scope: "근거자료: {institution}/spec/00~NN, {institution}/plan/00~NN"
- Organized by axis (소상공인금융/청년금융/IT협력/복지주택금융/SOC참여 — axes may be adapted per institution, but every idea must belong to one)
- Each idea has exactly 3 blocks, in order: `연계 구청사업/근거` (cites spec/plan) → `구체적 상품/협력 형태` → `은행 기대효과`
- Product names are generic categories (정책연계대출, 매칭적금, etc.), never real financial product brand names

## Citation Rule (applies throughout)

Every factual or numeric claim cites its source as `spec/NN`, `spec/NN(장-M)`, or `plan XX-N`. `05_검증결과.txt` cross-checks these citations against the actual spec text — a mismatch, exaggeration, or misquote lowers the grade and must be named in `수정권고사항` (example: dobong's IT-3 cited a project as "확인됨" when the spec source actually said "부분확인" — this exact kind of error is what `05_검증결과.txt` exists to catch).

## Reference

- `references/dobong_spec_sample.txt` — real `00_인덱스.txt` excerpt (format only, do not reuse the data)
- `references/dobong_plan_sample.txt` — real `00_제안개요_및_배경.txt` + `01_제안사업_요약표.txt` excerpt
- `references/dobong_bank_ideas_sample.txt` — real `bank_ideas_draft.txt` excerpt
```

- [ ] **Step 2: Verify frontmatter is valid**

Run: `python -c "
import re
text = open('.claude/skills/institution-corpus-format/SKILL.md', encoding='utf-8').read()
m = re.match(r'^---\n(.*?)\n---\n', text, re.DOTALL)
assert m, 'no frontmatter found'
assert 'name: institution-corpus-format' in m.group(1)
assert 'description: Use when' in m.group(1)
print('frontmatter ok')
"`
Expected: `frontmatter ok`

- [ ] **Step 3: Manually verify the skill is usable** (retrieval/application scenario)

Confirm:
- The description alone (no workflow summary) correctly signals when to load this skill
- Following the tables in this skill, you could write a syntactically-correct `00_인덱스.txt` and `01_제안사업_요약표.txt` for a hypothetical new institution without opening any `dobong/` file directly (only this skill's reference excerpts)

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/institution-corpus-format/SKILL.md
git commit -m "docs: add institution-corpus-format SKILL.md"
```

---

## Verification (end-to-end, after all tasks)

1. Run the full rfp-locate test suite: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest .claude/skills/rfp-locate/scripts/ -v` — expect all tests passing.
2. Manually invoke the `rfp-locate` skill workflow end-to-end against `RFP/수원시 금고 지정 계획 공고문.pdf`: run `extract_text.py`, confirm `is_abnormal` is `false` (this PDF extracts cleanly), then manually structure the scoring table from the returned text and save it to `report_new/suwon/rfp_scoring.json` + `report_new/suwon/rfp_text.txt`, confirming the JSON matches the `references/scoring_schema.json` shape.
3. Confirm neither skill's `SKILL.md` description summarizes its workflow (re-read both against the writing-skills SDO checklist).
4. `git log --oneline -8` to confirm all 6 tasks produced separate commits.

## Follow-on Work (not in this plan)

Per the approved design direction, the `agent/` orchestration package (rfp_analysis / institution_match / content_writer / pptx_builder / verification pipeline, per `docs/superpowers/specs/2026-07-20-rfp-proposal-agent-design.md`) is a **separate follow-on plan** that calls these two skills rather than reimplementing PDF parsing or corpus formatting itself. Do not start that work as part of this plan.
