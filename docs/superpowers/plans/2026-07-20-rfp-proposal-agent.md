# RFP Proposal Agent (`agent/` package) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `agent/` Python package that turns a new RFP into a scored, verified PPTX proposal — reusing the already-built `rfp-locate` and `institution-corpus-format` Claude Code skills for PDF parsing and corpus formatting, per `docs/superpowers/specs/2026-07-20-rfp-proposal-agent-design.md`.

**Architecture:** A simple sequential pipeline (no LangGraph/supervisor) of 5 stages: `rfp_analysis` (thin adapter reading the `rfp-locate` skill's JSON output) → `institution_match` (classify institution type, match against `giganlist/` and `report_archive/`) → `content_writer` (write scoring-table-driven sections, LLM) → `pptx_builder` (render PPTX, splice in archive slides) → `verification` (coverage check, LLM, loops back to `content_writer` up to 3 times). Each stage is a plain function over a shared `ProposalState` dict; `pipeline.py` runs them in order.

**Tech Stack:** Python 3.12, `langchain_openai` (already installed, `get_llm()` pattern from `proj2/rfp_agent/llm.py`), `python-pptx` 1.0.2 (already installed), `pydantic` (for structured LLM output, already installed via langchain).

## Global Constraints

- Do not reimplement PDF parsing or scoring-table extraction — that's `rfp-locate` (`.claude/skills/rfp-locate/`). `rfp_analysis` only reads `report_new/{institution}/rfp_scoring.json` and `rfp_text.txt`.
- Do not encode `institution-corpus-format`'s file-naming/citation rules as a second source of truth — reference the skill in code comments and LLM prompts; `spec_loader.py` only does structural checks (file exists, has a citation-shaped string), not full rule enforcement.
- **Web search cannot be called from plain Python.** `WebSearch`/`WebFetch` are Claude Code harness tools with no Python API. Any step needing them (new-institution research) must be implemented as a function that returns a structured "research task" description for Claude/a subagent to execute — never as a function that itself performs HTTP calls to a search engine. Tests for this path use a pre-written fixture `.txt` set as if research had already happened; they do not perform real web calls.
- `giganlist/` does not exist yet. Task 1 of this plan creates it by moving the 5 existing district folders (`dobong/`, `nowon/`, `gwangjin/`, `dongdaemun/`, `dongjak/`) under it, and fixes `build_report.py`/`build_html_report.py`'s path references (see Task 1 for exact line numbers).
- `report_archive/` exists but is empty in this environment; design and test as if it will contain per-institution PPTX files named with the institution's name (exact naming confirmed against real files once any exist — until then, `archive_lookup` matches by substring of the institution name in the filename stem).
- API keys: reuse `proj2/rfp_agent/llm.py`'s `get_llm()` pattern verbatim (env var `OPENAI_API_KEY` first, `getpass` fallback) — copy, do not import cross-project.
- Python-pptx has no built-in cross-presentation slide-copy API. Use the `copy.deepcopy` shape-XML-append pattern (verified working, see Task 5) — copying each shape element from the source slide's shape tree onto a new blank-layout (`slide_layouts[6]`) slide in the destination presentation.
- Test strategy: core logic (matching, file I/O, PPTX assembly) is TDD'd with mocked/fixture data and runs in default `pytest`. Any test that would call a real LLM is marked `@pytest.mark.llm` and excluded by default (`pytest -m "not llm"` is the default local run; plain `pytest` also works if `OPENAI_API_KEY` is unset, since those tests are skipped, not just deselected — see Task 7's `conftest.py`).
- Sample RFP for integration testing: `RFP/수원시 금고 지정 계획 공고문.pdf`, whose scoring table is already extracted at `report_new/수원시/rfp_scoring.json` if the `rfp-locate` skill has been run against it during Task 3's manual verification step (if not present, Task 3 includes running it).

---

### Task 1: Move district folders under `giganlist/` and fix build script paths

**Files:**
- Move: `dobong/` → `giganlist/dobong/`
- Move: `nowon/` → `giganlist/nowon/`
- Move: `gwangjin/` → `giganlist/gwangjin/`
- Move: `dongdaemun/` → `giganlist/dongdaemun/`
- Move: `dongjak/` → `giganlist/dongjak/`
- Modify: `build_report.py:294-312` (district_dirs usage — check exact lines after move, see Step 3)
- Modify: `build_html_report.py:846`, `build_html_report.py:854`

**Interfaces:**
- Consumes: nothing (first task, pure filesystem + path-string change)
- Produces: `giganlist/{district}/spec/`, `giganlist/{district}/plan/`, `giganlist/{district}/bank_ideas_draft.txt` — the path all later tasks' `spec_loader.py` reads from.

- [ ] **Step 1: Move the 5 district folders**

```bash
cd "c:/claude_workspace/GGReportAgent"
mkdir -p giganlist
git mv dobong giganlist/dobong
git mv nowon giganlist/nowon
git mv gwangjin giganlist/gwangjin
git mv dongdaemun giganlist/dongdaemun
git mv dongjak giganlist/dongjak
```

- [ ] **Step 2: Verify the move preserved every file**

Run: `find giganlist -type f | wc -l` and compare against the pre-move count (run `git show HEAD --stat -- dobong nowon gwangjin dongdaemun dongjak | tail -5` to sanity-check nothing was dropped, or simply confirm each of the 5 folders still has its `spec/`, `plan/`, and `bank_ideas_draft.txt`):

```bash
for d in dobong nowon gwangjin dongdaemun dongjak; do
  echo "$d: $(ls giganlist/$d/spec | wc -l) spec files, $(ls giganlist/$d/plan | wc -l) plan files, $(test -f giganlist/$d/bank_ideas_draft.txt && echo has-bank-ideas)"
done
```
Expected: each district shows its original spec/plan file counts (dobong: 9 spec/6 plan; nowon: 10/6; gwangjin: 10/6; dongdaemun: 9/6; dongjak: 9/6 — per `구청_log.md`'s final verification) and `has-bank-ideas` for all 5.

- [ ] **Step 3: Fix `build_report.py`'s district path construction**

Read `build_report.py` around its `district_dirs` usage (currently near line 294-312) and find the string template that builds each district's file path (it currently reads from the old root-level `{district}/` location implicitly via relative path, or from the stale `C:\claude_workspace\기관\` path — check both `build_report.py` and `build_html_report.py` for any hardcoded `기관` references before editing, since `build_html_report.py:846` and `:854` are confirmed to have this literal). Change any `C:\claude_workspace\기관\{dirname}\...` or bare `{dirname}\...` path template to `giganlist/{dirname}/...` (relative to repo root, matching the new location).

For `build_html_report.py`, the two known occurrences:
```python
# before (line ~846):
fpath = fr"C:\claude_workspace\기관\{dirname}\plan\{fname}"
# after:
fpath = fr"giganlist\{dirname}\plan\{fname}"

# before (line ~854):
bank_path = fr"C:\claude_workspace\기관\{dirname}\{bfname}"
# after:
bank_path = fr"giganlist\{dirname}\{bfname}"
```

Apply the equivalent fix to whatever path template `build_report.py` uses for its district reads (inspect the file directly — do not assume it matches `build_html_report.py`'s exact variable names).

- [ ] **Step 4: Verify both build scripts still run**

Run: `cd "c:/claude_workspace/GGReportAgent" && python build_report.py` — expect it to complete without a `FileNotFoundError` and print a `Saved: ...` line (note: `DOC_PATH`/`OUT_PATH` still point at the old parent-directory location per CLAUDE.md's documented gotcha — that's out of scope for this task; only the district-folder *read* paths are being fixed here, not the output *write* path).

Run: `python build_html_report.py` — same expectation.

- [ ] **Step 5: Commit**

```bash
git add giganlist/ build_report.py build_html_report.py
git commit -m "refactor: move district folders under giganlist/, fix build script read paths"
```

---

### Task 2: `agent/state.py` and `agent/llm.py`

**Files:**
- Create: `agent/__init__.py` (empty)
- Create: `agent/state.py`
- Create: `agent/llm.py`
- Test: `agent/tests/__init__.py` (empty)
- Test: `agent/tests/test_llm.py`

**Interfaces:**
- Consumes: nothing (foundational task)
- Produces:
  - `ProposalState` — a `TypedDict` with all fields listed in the spec's "데이터 형태" section, used as the shared dict every later node function reads from and returns a partial update of.
  - `get_llm(temperature: float = 0.0) -> ChatOpenAI` — reused verbatim pattern from `proj2/rfp_agent/llm.py`.

- [ ] **Step 1: Write `agent/state.py`**

```python
from typing import TypedDict


class ProposalState(TypedDict, total=False):
    rfp_path: str
    rfp_text: str
    scoring_table: list[dict]       # [{category, item, score, description}, ...]
    requirements: list[dict]        # [{item, category, weight, risk_flag}, ...]
    institution_name: str
    institution_type: str           # "시"/"구"/"군"/"공공기관"
    matched_district: str | None    # giganlist/ folder name if a full match exists
    institution_spec_dir: str       # path to the spec/ dir to read (existing or newly built)
    archive_pptx_path: str | None   # report_archive/ path if a prior PPTX exists
    sections: list[dict]            # [{scoring_item, title, content, sources}, ...]
    pptx_path: str
    coverage_report: list[dict]     # [{scoring_item, covered: bool, gap_note}, ...]
    revision_count: int
```

- [ ] **Step 2: Write `agent/llm.py`**

```python
import os
from getpass import getpass

from langchain_openai import ChatOpenAI


def get_llm(temperature: float = 0.0) -> ChatOpenAI:
    if not os.environ.get("OPENAI_API_KEY"):
        os.environ["OPENAI_API_KEY"] = getpass("OpenAI API 키를 입력하세요: ")
    return ChatOpenAI(model="gpt-4o-mini", temperature=temperature)
```

- [ ] **Step 3: Write the failing test for `get_llm`**

Create `agent/tests/test_llm.py`:

```python
import os

from agent.llm import get_llm


def test_get_llm_uses_env_var_without_prompting(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    llm = get_llm()
    assert llm.model_name == "gpt-4o-mini"
    assert os.environ["OPENAI_API_KEY"] == "test-key-not-real"


def test_get_llm_respects_temperature(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    llm = get_llm(temperature=0.7)
    assert llm.temperature == 0.7
```

- [ ] **Step 4: Run test to verify it passes** (this test doesn't need Task 2 Step 2's file to not exist first — write both together since `llm.py` is trivial, then confirm)

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_llm.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add agent/__init__.py agent/state.py agent/llm.py agent/tests/__init__.py agent/tests/test_llm.py
git commit -m "feat: add agent package skeleton with ProposalState and get_llm"
```

---

### Task 3: `agent/nodes/rfp_analysis.py` — thin adapter over the rfp-locate skill's output

**Files:**
- Create: `agent/nodes/__init__.py` (empty)
- Create: `agent/nodes/rfp_analysis.py`
- Test: `agent/tests/test_rfp_analysis.py`
- Test fixture: `agent/tests/fixtures/sample_rfp_scoring.json`

**Interfaces:**
- Consumes: a `report_new/{institution}/rfp_scoring.json` file already produced by the `rfp-locate` skill (per that skill's `references/scoring_schema.json` shape: `{institution, rfp_title, total_score, criteria: [{category, item, score, description}]}`).
- Produces: `rfp_analysis_node(state: ProposalState) -> dict` returning `{"institution_name": str, "scoring_table": list[dict], "rfp_text": str}`.

- [ ] **Step 1: Create the test fixture**

Create `agent/tests/fixtures/sample_rfp_scoring.json` (mirrors the real `.claude/skills/rfp-locate/references/scoring_schema.json` shape, using a shortened 2-item version for fast test fixtures):

```json
{
  "institution": "수원시",
  "rfp_title": "수원시 금고 지정 계획 공고문",
  "total_score": 100,
  "criteria": [
    {"category": "금융기관의 대내외적 신용도 및 재무구조의 안정성", "item": "외부기관의 신용조사 상태평가", "score": 8, "description": "국외평가기관(4점) + 국내평가기관(4점)"},
    {"category": "시에 대한 대출 및 예금금리", "item": "정기예금 예치금리 등", "score": 21, "description": null}
  ]
}
```

Also create `agent/tests/fixtures/sample_rfp_text.txt` with any short placeholder text, e.g. `수원시 공고 제2026-1528호 수원시 금고 지정 계획 공고`.

- [ ] **Step 2: Write the failing tests**

Create `agent/tests/test_rfp_analysis.py`:

```python
import json
import os

from agent.nodes.rfp_analysis import rfp_analysis_node

FIXTURES = os.path.join(os.path.dirname(__file__), "fixtures")


def test_rfp_analysis_node_reads_scoring_json(tmp_path):
    report_dir = tmp_path / "report_new" / "수원시"
    report_dir.mkdir(parents=True)
    scoring_src = os.path.join(FIXTURES, "sample_rfp_scoring.json")
    with open(scoring_src, encoding="utf-8") as f:
        scoring_data = json.load(f)
    (report_dir / "rfp_scoring.json").write_text(
        json.dumps(scoring_data, ensure_ascii=False), encoding="utf-8"
    )
    (report_dir / "rfp_text.txt").write_text(
        "수원시 공고 제2026-1528호", encoding="utf-8"
    )

    state = {"institution_name": "수원시", "report_new_dir": str(tmp_path / "report_new")}
    result = rfp_analysis_node(state)

    assert result["institution_name"] == "수원시"
    assert len(result["scoring_table"]) == 2
    assert result["scoring_table"][0]["item"] == "외부기관의 신용조사 상태평가"
    assert "수원시 공고" in result["rfp_text"]


def test_rfp_analysis_node_raises_if_scoring_json_missing(tmp_path):
    state = {"institution_name": "존재안함기관", "report_new_dir": str(tmp_path / "report_new")}
    try:
        rfp_analysis_node(state)
        assert False, "expected FileNotFoundError"
    except FileNotFoundError:
        pass
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_rfp_analysis.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.rfp_analysis'`

- [ ] **Step 4: Write minimal implementation**

Create `agent/nodes/rfp_analysis.py`:

```python
import json
import os


def rfp_analysis_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    report_new_dir = state.get("report_new_dir", "report_new")
    institution_dir = os.path.join(report_new_dir, institution_name)

    scoring_path = os.path.join(institution_dir, "rfp_scoring.json")
    text_path = os.path.join(institution_dir, "rfp_text.txt")

    with open(scoring_path, encoding="utf-8") as f:
        scoring_data = json.load(f)
    with open(text_path, encoding="utf-8") as f:
        rfp_text = f.read()

    return {
        "institution_name": scoring_data["institution"],
        "scoring_table": scoring_data["criteria"],
        "rfp_text": rfp_text,
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_rfp_analysis.py -v`
Expected: 2 passed

- [ ] **Step 6: Manually verify against the real `rfp-locate` skill output**

If `report_new/수원시/rfp_scoring.json` does not already exist, invoke the `rfp-locate` skill (via Claude, not this plan's code) against `RFP/수원시 금고 지정 계획 공고문.pdf` to produce it. Then run:

```bash
python -c "
from agent.nodes.rfp_analysis import rfp_analysis_node
result = rfp_analysis_node({'institution_name': '수원시', 'report_new_dir': 'report_new'})
print(result['institution_name'], len(result['scoring_table']), 'criteria')
"
```
Expected: prints `수원시 6 criteria` (the real scoring table has 6 top-level categories per the worked example in `references/scoring_schema.json`).

- [ ] **Step 7: Commit**

```bash
git add agent/nodes/__init__.py agent/nodes/rfp_analysis.py agent/tests/test_rfp_analysis.py agent/tests/fixtures/sample_rfp_scoring.json agent/tests/fixtures/sample_rfp_text.txt
git commit -m "feat: add rfp_analysis node reading rfp-locate skill output"
```

---

### Task 4: `agent/tools/spec_loader.py` and `agent/nodes/institution_match.py`

**Files:**
- Create: `agent/tools/__init__.py` (empty)
- Create: `agent/tools/spec_loader.py`
- Create: `agent/nodes/institution_match.py`
- Test: `agent/tests/test_spec_loader.py`
- Test: `agent/tests/test_institution_match.py`

**Interfaces:**
- Consumes: `giganlist/{district}/spec,plan/` (from Task 1), institution type classification via `get_llm()` (Task 2).
- Produces:
  - `spec_loader.load_institution_files(giganlist_dir: str, institution_folder: str) -> dict` — returns `{"spec_files": {filename: content}, "plan_files": {filename: content}, "bank_ideas": str | None}`.
  - `spec_loader.list_known_institutions(giganlist_dir: str) -> list[str]` — returns folder names currently under `giganlist/`.
  - `spec_loader.find_archive_pptx(archive_dir: str, institution_name: str) -> str | None` — returns a path if a filename in `archive_dir` contains `institution_name` as a substring, else `None`.
  - `institution_match_node(state: dict) -> dict` — returns `{"institution_type": str, "matched_district": str | None, "institution_spec_dir": str | None, "archive_pptx_path": str | None}`. `institution_spec_dir` is `None` when no match is found (signals the pipeline that new-institution research is needed — see Task 6).

- [ ] **Step 1: Write the failing tests for `spec_loader`**

Create `agent/tests/test_spec_loader.py`:

```python
import os

from agent.tools.spec_loader import find_archive_pptx, list_known_institutions, load_institution_files


def _make_giganlist(tmp_path):
    d = tmp_path / "giganlist" / "dobong"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    (d / "spec" / "00_인덱스.txt").write_text("인덱스 내용", encoding="utf-8")
    (d / "plan" / "00_제안개요_및_배경.txt").write_text("개요 내용", encoding="utf-8")
    (d / "bank_ideas_draft.txt").write_text("은행 아이디어", encoding="utf-8")
    return str(tmp_path / "giganlist")


def test_list_known_institutions(tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    assert list_known_institutions(giganlist_dir) == ["dobong"]


def test_load_institution_files_reads_spec_plan_and_bank_ideas(tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    result = load_institution_files(giganlist_dir, "dobong")
    assert result["spec_files"]["00_인덱스.txt"] == "인덱스 내용"
    assert result["plan_files"]["00_제안개요_및_배경.txt"] == "개요 내용"
    assert result["bank_ideas"] == "은행 아이디어"


def test_load_institution_files_bank_ideas_none_if_missing(tmp_path):
    d = tmp_path / "giganlist" / "nowon"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    result = load_institution_files(str(tmp_path / "giganlist"), "nowon")
    assert result["bank_ideas"] is None


def test_find_archive_pptx_matches_by_substring(tmp_path):
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "수원시_금고제안서_2026.pptx").write_bytes(b"fake pptx bytes")
    found = find_archive_pptx(str(archive_dir), "수원시")
    assert found is not None
    assert found.endswith("수원시_금고제안서_2026.pptx")


def test_find_archive_pptx_returns_none_when_no_match(tmp_path):
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "안양시_제안서.pptx").write_bytes(b"fake pptx bytes")
    assert find_archive_pptx(str(archive_dir), "수원시") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_spec_loader.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.tools.spec_loader'`

- [ ] **Step 3: Write minimal `spec_loader.py`**

```python
import os


def list_known_institutions(giganlist_dir: str) -> list[str]:
    if not os.path.isdir(giganlist_dir):
        return []
    return sorted(
        name for name in os.listdir(giganlist_dir)
        if os.path.isdir(os.path.join(giganlist_dir, name))
    )


def load_institution_files(giganlist_dir: str, institution_folder: str) -> dict:
    base = os.path.join(giganlist_dir, institution_folder)
    spec_dir = os.path.join(base, "spec")
    plan_dir = os.path.join(base, "plan")

    def _read_all(d):
        if not os.path.isdir(d):
            return {}
        return {
            fname: open(os.path.join(d, fname), encoding="utf-8").read()
            for fname in sorted(os.listdir(d))
            if fname.endswith(".txt")
        }

    bank_ideas_path = os.path.join(base, "bank_ideas_draft.txt")
    bank_ideas = None
    if os.path.isfile(bank_ideas_path):
        bank_ideas = open(bank_ideas_path, encoding="utf-8").read()

    return {
        "spec_files": _read_all(spec_dir),
        "plan_files": _read_all(plan_dir),
        "bank_ideas": bank_ideas,
    }


def find_archive_pptx(archive_dir: str, institution_name: str) -> str | None:
    if not os.path.isdir(archive_dir):
        return None
    for fname in sorted(os.listdir(archive_dir)):
        if fname.endswith(".pptx") and institution_name in fname:
            return os.path.join(archive_dir, fname)
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_spec_loader.py -v`
Expected: 5 passed

- [ ] **Step 5: Write the failing tests for `institution_match_node`**

Create `agent/tests/test_institution_match.py`. This node's institution-type classification calls an LLM, so this test mocks `get_llm` to avoid a real API call:

```python
from unittest.mock import MagicMock, patch

from agent.nodes.institution_match import institution_match_node


def _make_giganlist(tmp_path):
    d = tmp_path / "giganlist" / "dobong"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    return str(tmp_path / "giganlist")


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_exact_match_reuses_existing(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "구"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "dobong",
        "rfp_text": "도봉구청 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(tmp_path / "report_archive"),
    }
    result = institution_match_node(state)

    assert result["institution_type"] == "구"
    assert result["matched_district"] == "dobong"
    assert result["institution_spec_dir"] == giganlist_dir + "/dobong/spec"


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_no_match_returns_none_spec_dir(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "시"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "suwon",
        "rfp_text": "수원시 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(tmp_path / "report_archive"),
    }
    result = institution_match_node(state)

    assert result["institution_type"] == "시"
    assert result["matched_district"] is None
    assert result["institution_spec_dir"] is None


@patch("agent.nodes.institution_match.get_llm")
def test_institution_match_finds_archive_pptx(mock_get_llm, tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "suwon_이전제안서.pptx").write_bytes(b"fake")

    mock_llm = MagicMock()
    mock_llm.invoke.return_value.content = "시"
    mock_get_llm.return_value = mock_llm

    state = {
        "institution_name": "suwon",
        "rfp_text": "수원시 공고",
        "giganlist_dir": giganlist_dir,
        "archive_dir": str(archive_dir),
    }
    result = institution_match_node(state)

    assert result["archive_pptx_path"] is not None
    assert "suwon_이전제안서.pptx" in result["archive_pptx_path"]
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_institution_match.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.institution_match'`

- [ ] **Step 7: Write minimal `institution_match.py`**

The institution-type classification is deliberately simple (LLM call returning one of `시`/`구`/`군`/`공공기관`) because exact matching against `giganlist/` uses the folder name directly (romanized institution name), not fuzzy type-based matching — per the spec's matching rule §2 ("완전 동일 기관인지 확인"). The LLM call exists only to populate `institution_type` for the state and for the ambiguous-case fallback described in the spec's error handling section.

```python
from agent.llm import get_llm
from agent.tools.spec_loader import find_archive_pptx, list_known_institutions


TYPE_PROMPT = """다음 텍스트에 등장하는 발주 기관의 유형을 판단하세요.
"시", "구", "군", "공공기관" 중 하나로만 답하세요.

텍스트:
{rfp_text}
"""


def institution_match_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    rfp_text = state.get("rfp_text", "")
    giganlist_dir = state["giganlist_dir"]
    archive_dir = state.get("archive_dir", "report_archive")

    llm = get_llm()
    response = llm.invoke(TYPE_PROMPT.format(rfp_text=rfp_text))
    institution_type = response.content.strip()

    known = list_known_institutions(giganlist_dir)
    matched_district = institution_name if institution_name in known else None
    institution_spec_dir = (
        f"{giganlist_dir}/{matched_district}/spec" if matched_district else None
    )

    archive_pptx_path = find_archive_pptx(archive_dir, institution_name)

    return {
        "institution_type": institution_type,
        "matched_district": matched_district,
        "institution_spec_dir": institution_spec_dir,
        "archive_pptx_path": archive_pptx_path,
    }
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_institution_match.py -v`
Expected: 3 passed

- [ ] **Step 9: Commit**

```bash
git add agent/tools/__init__.py agent/tools/spec_loader.py agent/nodes/institution_match.py agent/tests/test_spec_loader.py agent/tests/test_institution_match.py
git commit -m "feat: add spec_loader tool and institution_match node"
```

---

### Task 5: `agent/nodes/pptx_builder.py` — including archive-slide splicing

**Files:**
- Create: `agent/nodes/pptx_builder.py`
- Test: `agent/tests/test_pptx_builder.py`

**Interfaces:**
- Consumes: `state["sections"]` (list of `{scoring_item, title, content, sources}`), `state["scoring_table"]`, `state["archive_pptx_path"]` (optional), `state["institution_name"]`.
- Produces: `pptx_builder_node(state: dict) -> dict` returning `{"pptx_path": str}`. Also exposes `build_pptx(sections, scoring_table, output_path, archive_pptx_path=None) -> None` as the testable core function.

- [ ] **Step 1: Write the failing tests**

Create `agent/tests/test_pptx_builder.py`:

```python
import os

from pptx import Presentation

from agent.nodes.pptx_builder import build_pptx


def test_build_pptx_creates_title_and_section_slides(tmp_path):
    sections = [
        {"scoring_item": "신용도", "title": "1. 신용도 및 재무구조", "content": "본문 내용 1", "sources": ["spec/01"]},
        {"scoring_item": "예금금리", "title": "2. 예금 및 대출금리", "content": "본문 내용 2", "sources": ["spec/02"]},
    ]
    scoring_table = [
        {"category": "신용도", "item": "외부평가", "score": 8, "description": None},
        {"category": "예금금리", "item": "정기예금금리", "score": 21, "description": None},
    ]
    out_path = str(tmp_path / "test.pptx")

    build_pptx(sections, scoring_table, out_path)

    assert os.path.isfile(out_path)
    prs = Presentation(out_path)
    # title slide + scoring table slide + 2 section slides = 4 minimum
    assert len(prs.slides) >= 4
    all_text = "\n".join(
        shape.text_frame.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )
    assert "신용도 및 재무구조" in all_text
    assert "본문 내용 1" in all_text


def test_build_pptx_splices_archive_slides_as_separate_section(tmp_path):
    # Build a fake archive PPTX with one distinguishable slide
    archive_path = str(tmp_path / "archive.pptx")
    archive_prs = Presentation()
    slide = archive_prs.slides.add_slide(archive_prs.slide_layouts[1])
    slide.shapes.title.text = "과거 제안 슬라이드 마커"
    archive_prs.save(archive_path)

    sections = [{"scoring_item": "신용도", "title": "1. 신용도", "content": "내용", "sources": ["spec/01"]}]
    scoring_table = [{"category": "신용도", "item": "평가", "score": 10, "description": None}]
    out_path = str(tmp_path / "test.pptx")

    build_pptx(sections, scoring_table, out_path, archive_pptx_path=archive_path)

    prs = Presentation(out_path)
    all_text = "\n".join(
        shape.text_frame.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )
    assert "과거 유사제안 참고" in all_text  # section divider slide
    assert "과거 제안 슬라이드 마커" in all_text  # copied original content


def test_build_pptx_without_archive_has_no_reference_section(tmp_path):
    sections = [{"scoring_item": "신용도", "title": "1. 신용도", "content": "내용", "sources": ["spec/01"]}]
    scoring_table = [{"category": "신용도", "item": "평가", "score": 10, "description": None}]
    out_path = str(tmp_path / "test.pptx")

    build_pptx(sections, scoring_table, out_path, archive_pptx_path=None)

    prs = Presentation(out_path)
    all_text = "\n".join(
        shape.text_frame.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )
    assert "과거 유사제안 참고" not in all_text
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_pptx_builder.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.pptx_builder'`

- [ ] **Step 3: Write minimal implementation**

```python
import copy

from pptx import Presentation


def _add_title_slide(prs, institution_name):
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = f"{institution_name} 제안서"


def _add_scoring_table_slide(prs, scoring_table):
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = "평가 배점표"
    body = slide.placeholders[1].text_frame
    body.text = f"{scoring_table[0]['category']}: {scoring_table[0]['item']} ({scoring_table[0]['score']}점)"
    for item in scoring_table[1:]:
        p = body.add_paragraph()
        p.text = f"{item['category']}: {item['item']} ({item['score']}점)"


def _add_section_slide(prs, section):
    slide = prs.slides.add_slide(prs.slide_layouts[1])
    slide.shapes.title.text = section["title"]
    body = slide.placeholders[1].text_frame
    body.text = section["content"]
    if section.get("sources"):
        p = body.add_paragraph()
        p.text = f"근거자료: {', '.join(section['sources'])}"
        p.level = 1


def _add_archive_reference_section(prs, archive_pptx_path):
    divider = prs.slides.add_slide(prs.slide_layouts[2])
    divider.shapes.title.text = "과거 유사제안 참고"

    archive_prs = Presentation(archive_pptx_path)
    blank_layout = prs.slide_layouts[6]
    for archive_slide in archive_prs.slides:
        new_slide = prs.slides.add_slide(blank_layout)
        for shape in archive_slide.shapes:
            new_slide.shapes._spTree.append(copy.deepcopy(shape._element))


def build_pptx(sections, scoring_table, output_path, archive_pptx_path=None, institution_name="기관"):
    prs = Presentation()
    _add_title_slide(prs, institution_name)
    _add_scoring_table_slide(prs, scoring_table)
    for section in sections:
        _add_section_slide(prs, section)
    if archive_pptx_path:
        _add_archive_reference_section(prs, archive_pptx_path)
    prs.save(output_path)


def pptx_builder_node(state: dict) -> dict:
    institution_name = state.get("institution_name", "기관")
    output_path = f"report_new/{institution_name}/{institution_name}_제안서.pptx"
    build_pptx(
        state["sections"],
        state["scoring_table"],
        output_path,
        archive_pptx_path=state.get("archive_pptx_path"),
        institution_name=institution_name,
    )
    return {"pptx_path": output_path}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_pptx_builder.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/pptx_builder.py agent/tests/test_pptx_builder.py
git commit -m "feat: add pptx_builder node with archive-slide splicing"
```

---

### Task 6: `agent/nodes/content_writer.py`

**Files:**
- Create: `agent/nodes/content_writer.py`
- Test: `agent/tests/test_content_writer.py`

**Interfaces:**
- Consumes: `state["scoring_table"]`, `state["institution_spec_dir"]` (or `None` for a new institution — see note below), `state.get("coverage_report")` (present only on a revision loop re-entry from `verification`).
- Produces: `content_writer_node(state: dict) -> dict` returning `{"sections": list[dict], "revision_count": int}`.

- [ ] **Step 1: Write the failing tests**

Create `agent/tests/test_content_writer.py`. Mocks `get_llm` since section-writing is inherently an LLM call:

```python
from unittest.mock import MagicMock, patch

from agent.nodes.content_writer import content_writer_node


@patch("agent.nodes.content_writer.get_llm")
def test_content_writer_produces_one_section_per_scoring_item(mock_get_llm, tmp_path):
    spec_dir = tmp_path / "spec"
    spec_dir.mkdir()
    (spec_dir / "01_개요.txt").write_text("기관 개요 내용", encoding="utf-8")

    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 신용도 및 재무구조"
    mock_result.content = "본문 내용"
    mock_result.sources = ["spec/01"]
    mock_llm.with_structured_output.return_value.invoke.return_value = mock_result
    mock_get_llm.return_value = mock_llm

    state = {
        "scoring_table": [
            {"category": "신용도", "item": "외부평가", "score": 8, "description": None},
        ],
        "institution_spec_dir": str(spec_dir),
        "institution_name": "수원시",
    }
    result = content_writer_node(state)

    assert len(result["sections"]) == 1
    assert result["sections"][0]["scoring_item"] == "외부평가"
    assert result["sections"][0]["content"] == "본문 내용"
    assert result["revision_count"] == 0


@patch("agent.nodes.content_writer.get_llm")
def test_content_writer_increments_revision_count_on_reentry(mock_get_llm, tmp_path):
    spec_dir = tmp_path / "spec"
    spec_dir.mkdir()

    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 신용도"
    mock_result.content = "수정된 내용"
    mock_result.sources = ["spec/01"]
    mock_llm.with_structured_output.return_value.invoke.return_value = mock_result
    mock_get_llm.return_value = mock_llm

    state = {
        "scoring_table": [{"category": "신용도", "item": "외부평가", "score": 8, "description": None}],
        "institution_spec_dir": str(spec_dir),
        "institution_name": "수원시",
        "revision_count": 1,
        "coverage_report": [{"scoring_item": "외부평가", "covered": False, "gap_note": "근거 누락"}],
    }
    result = content_writer_node(state)

    assert result["revision_count"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_content_writer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.content_writer'`

- [ ] **Step 3: Write minimal implementation**

```python
import os

from pydantic import BaseModel

from agent.llm import get_llm


class SectionResult(BaseModel):
    title: str
    content: str
    sources: list[str]


SECTION_PROMPT = """다음 배점표 항목에 대한 제안서 섹션을 작성하세요.

배점 항목: {category} - {item} ({score}점)
설명: {description}

기관 spec 자료:
{spec_content}

{gap_context}

institution-corpus-format Skill의 포맷 규칙을 따르세요: 번호 섹션, "근거자료: spec/NN" 형태의
출처 인용을 본문에 포함하고, sources 필드에도 인용한 파일명을 나열하세요.
"""


def _load_spec_content(institution_spec_dir: str | None) -> str:
    if not institution_spec_dir or not os.path.isdir(institution_spec_dir):
        return "(spec 자료 없음 — 신규 기관, 조사 결과 미제공)"
    parts = []
    for fname in sorted(os.listdir(institution_spec_dir)):
        if fname.endswith(".txt"):
            with open(os.path.join(institution_spec_dir, fname), encoding="utf-8") as f:
                parts.append(f"[{fname}]\n{f.read()}")
    return "\n\n".join(parts)


def content_writer_node(state: dict) -> dict:
    scoring_table = state["scoring_table"]
    spec_content = _load_spec_content(state.get("institution_spec_dir"))
    coverage_report = state.get("coverage_report", [])
    gap_by_item = {c["scoring_item"]: c["gap_note"] for c in coverage_report if not c["covered"]}

    llm = get_llm().with_structured_output(SectionResult)
    sections = []
    for entry in scoring_table:
        gap_context = ""
        if entry["item"] in gap_by_item:
            gap_context = f"이전 시도에서 누락된 점: {gap_by_item[entry['item']]}"

        result: SectionResult = llm.invoke(
            SECTION_PROMPT.format(
                category=entry["category"],
                item=entry["item"],
                score=entry["score"],
                description=entry.get("description") or "(설명 없음)",
                spec_content=spec_content,
                gap_context=gap_context,
            )
        )
        sections.append({
            "scoring_item": entry["item"],
            "title": result.title,
            "content": result.content,
            "sources": result.sources,
        })

    return {
        "sections": sections,
        "revision_count": state.get("revision_count", 0) + (1 if coverage_report else 0),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_content_writer.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/content_writer.py agent/tests/test_content_writer.py
git commit -m "feat: add content_writer node with revision-loop support"
```

---

### Task 7: `agent/nodes/verification.py` and `conftest.py` for LLM test marking

**Files:**
- Create: `agent/nodes/verification.py`
- Create: `agent/tests/conftest.py`
- Test: `agent/tests/test_verification.py`
- Modify: `agent/tests/test_content_writer.py` (no changes needed — already fully mocked; this task only adds the marker infrastructure other future real-LLM tests would use)

**Interfaces:**
- Consumes: `state["sections"]`, `state["scoring_table"]`.
- Produces: `verification_node(state: dict) -> dict` returning `{"coverage_report": list[dict]}`.

- [ ] **Step 1: Write `agent/tests/conftest.py`** (registers the `llm` marker so `@pytest.mark.llm` tests can be excluded by default; no such tests exist yet in this plan, but this is the hook point for any future real-API test)

```python
def pytest_configure(config):
    config.addinivalue_line("markers", "llm: marks tests that call a real LLM API (deselect with '-m \"not llm\"')")
```

- [ ] **Step 2: Write the failing tests for `verification_node`**

Create `agent/tests/test_verification.py`:

```python
from unittest.mock import MagicMock, patch

from agent.nodes.verification import verification_node


@patch("agent.nodes.verification.get_llm")
def test_verification_flags_covered_and_uncovered_items(mock_get_llm):
    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.covered = True
    mock_result.gap_note = None
    mock_llm.with_structured_output.return_value.invoke.return_value = mock_result
    mock_get_llm.return_value = mock_llm

    state = {
        "scoring_table": [
            {"category": "신용도", "item": "외부평가", "score": 8, "description": None},
        ],
        "sections": [
            {"scoring_item": "외부평가", "title": "1. 신용도", "content": "외부평가 관련 내용", "sources": ["spec/01"]},
        ],
    }
    result = verification_node(state)

    assert len(result["coverage_report"]) == 1
    assert result["coverage_report"][0]["scoring_item"] == "외부평가"
    assert result["coverage_report"][0]["covered"] is True


@patch("agent.nodes.verification.get_llm")
def test_verification_flags_missing_section_without_llm_call(mock_get_llm):
    mock_get_llm.return_value = MagicMock()

    state = {
        "scoring_table": [
            {"category": "신용도", "item": "외부평가", "score": 8, "description": None},
            {"category": "예금금리", "item": "정기예금금리", "score": 21, "description": None},
        ],
        "sections": [
            {"scoring_item": "외부평가", "title": "1. 신용도", "content": "내용", "sources": ["spec/01"]},
        ],
    }
    result = verification_node(state)

    missing = [c for c in result["coverage_report"] if not c["covered"]]
    assert len(missing) == 1
    assert missing[0]["scoring_item"] == "정기예금금리"
    assert "누락" in missing[0]["gap_note"] or "없음" in missing[0]["gap_note"]
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_verification.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.verification'`

- [ ] **Step 4: Write minimal implementation**

A scoring item with no matching section is flagged as missing without an LLM call (cheap, deterministic check first); only items that *have* a section get an LLM judgment call on whether the content actually addresses that item.

```python
from pydantic import BaseModel

from agent.llm import get_llm


class CoverageResult(BaseModel):
    covered: bool
    gap_note: str | None = None


COVERAGE_PROMPT = """다음 배점 항목이 아래 섹션 내용으로 충분히 다뤄졌는지 판단하세요.

배점 항목: {category} - {item}
섹션 제목: {title}
섹션 내용: {content}

충분히 다뤄지지 않았다면 covered=false와 구체적인 gap_note를 반환하세요.
"""


def verification_node(state: dict) -> dict:
    scoring_table = state["scoring_table"]
    sections_by_item = {s["scoring_item"]: s for s in state["sections"]}

    coverage_report = []
    for entry in scoring_table:
        item = entry["item"]
        section = sections_by_item.get(item)

        if section is None:
            coverage_report.append({
                "scoring_item": item,
                "covered": False,
                "gap_note": f"'{item}' 항목에 대한 섹션이 누락됨",
            })
            continue

        llm = get_llm().with_structured_output(CoverageResult)
        result: CoverageResult = llm.invoke(
            COVERAGE_PROMPT.format(
                category=entry["category"],
                item=item,
                title=section["title"],
                content=section["content"],
            )
        )
        coverage_report.append({
            "scoring_item": item,
            "covered": result.covered,
            "gap_note": result.gap_note,
        })

    return {"coverage_report": coverage_report}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_verification.py -v`
Expected: 2 passed

- [ ] **Step 6: Commit**

```bash
git add agent/nodes/verification.py agent/tests/conftest.py agent/tests/test_verification.py
git commit -m "feat: add verification node with deterministic missing-section check"
```

---

### Task 8: `agent/pipeline.py` — wire the 5 stages with the revision loop

**Files:**
- Create: `agent/pipeline.py`
- Test: `agent/tests/test_pipeline.py`

**Interfaces:**
- Consumes: all 5 node functions from Tasks 3, 4, 5, 6, 7.
- Produces: `run_pipeline(institution_name: str, giganlist_dir: str = "giganlist", archive_dir: str = "report_archive", report_new_dir: str = "report_new", max_revisions: int = 3) -> dict` — returns the final `ProposalState` dict, including `pptx_path` and the last `coverage_report`.

- [ ] **Step 1: Write the failing test**

Create `agent/tests/test_pipeline.py`. This test mocks every node function (unit-level orchestration test, not an end-to-end LLM test) to verify the revision loop wiring:

```python
from unittest.mock import patch

from agent.pipeline import run_pipeline


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_stops_when_fully_covered(
    mock_rfp, mock_match, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "giganlist/dobong/spec", "archive_pptx_path": None}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}], "revision_count": 0}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong")

    assert mock_write.call_count == 1
    assert mock_verify.call_count == 1
    assert result["pptx_path"] == "report_new/dobong/dobong_제안서.pptx"


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_retries_up_to_max_then_stops(
    mock_rfp, mock_match, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "giganlist/dobong/spec", "archive_pptx_path": None}
    mock_write.side_effect = [
        {"sections": [{"scoring_item": "a"}], "revision_count": i} for i in range(4)
    ]
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": False, "gap_note": "부족"}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong", max_revisions=3)

    # initial write + up to 3 retries = 4 calls to content_writer
    assert mock_write.call_count == 4
    assert mock_verify.call_count == 4
    assert result["coverage_report"][0]["covered"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_pipeline.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.pipeline'`

- [ ] **Step 3: Write minimal implementation**

```python
from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.verification import verification_node


def run_pipeline(
    institution_name: str,
    giganlist_dir: str = "giganlist",
    archive_dir: str = "report_archive",
    report_new_dir: str = "report_new",
    max_revisions: int = 3,
) -> dict:
    state = {
        "institution_name": institution_name,
        "giganlist_dir": giganlist_dir,
        "archive_dir": archive_dir,
        "report_new_dir": report_new_dir,
    }

    state.update(rfp_analysis_node(state))
    state.update(institution_match_node(state))

    attempt = 0
    while True:
        state.update(content_writer_node(state))
        state.update(verification_node(state))
        attempt += 1

        all_covered = all(c["covered"] for c in state["coverage_report"])
        if all_covered or attempt > max_revisions:
            break

    state.update(pptx_builder_node(state))
    return state
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/tests/test_pipeline.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add agent/pipeline.py agent/tests/test_pipeline.py
git commit -m "feat: add pipeline.py wiring all 5 nodes with revision loop"
```

---

## Verification (end-to-end, after all tasks)

1. Run the full test suite excluding any real-LLM-marked tests (none exist yet, but this is the standing command): `cd "c:/claude_workspace/GGReportAgent" && python -m pytest agent/ -m "not llm" -v` — expect all tests passing (approx. 20 tests across Tasks 2-8).
2. Confirm `giganlist/` now holds all 5 districts and `build_report.py`/`build_html_report.py` still run cleanly (re-run Task 1 Step 4's commands).
3. Manual smoke test with real LLM calls (requires `OPENAI_API_KEY`): ensure `report_new/수원시/rfp_scoring.json` exists (via the `rfp-locate` skill, run manually beforehand if needed), then run:
   ```bash
   python -c "
   from agent.pipeline import run_pipeline
   result = run_pipeline('수원시')
   print('pptx:', result['pptx_path'])
   print('covered:', all(c['covered'] for c in result['coverage_report']))
   "
   ```
   Open the resulting PPTX and confirm it has a title slide, a scoring-table slide, one section slide per scoring item, and — if `report_archive/` contains a `수원시`-named PPTX by then — a "과거 유사제안 참고" section with the original slides copied in.
4. `git log --oneline -10` to confirm each of the 8 tasks produced its own commit(s).

## Follow-on Work (not in this plan)

- The spec's "미해결 세부사항" items (배점표 항목 ↔ 섹션 유사도 매칭 refinement, `00_인덱스.txt` auto-generation for newly-researched institutions) are deferred; this plan's `institution_match_node` returns `institution_spec_dir: None` for new institutions and leaves the actual web-research + file-writing to a future task where Claude (not this plan's Python code) performs the research per the constraints section above.
- `report_archive/`'s exact filename convention should be confirmed against real files once any exist, and `find_archive_pptx`'s substring-match heuristic revisited if it proves too loose/strict in practice.
