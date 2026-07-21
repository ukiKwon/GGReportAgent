# RFP 제안서 에이전트 팀 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `agent/` 파이프라인 앞뒤에 3개 노드(`rfp_locate_node`, `spec_research_node`, `plan_writer_node`)를 추가해, 기관명 하나만 입력하면 RFP 탐색 → (신규 기관이면) spec/plan/bank_ideas_draft 생성 → 기존 4개 노드(재사용) → 최종 PPT까지 자동으로 도는 CLI 파이프라인(`python -m agent.main "<기관명>"`)을 만든다.

**Architecture:** 기존 `agent/pipeline.py`의 순차 노드 실행 구조를 그대로 따른다. 새 노드 3개는 각각 `claude_agent_sdk`로 서브에이전트를 호출해, rfp-locate/institution-corpus-format 스킬의 지침을 프롬프트로 그대로 주입하고 파일시스템에 산출물을 쓰게 한 뒤, 그 결과를 `ProposalState`(TypedDict)에 반영해 반환한다. `institution_match_node`가 채우는 `matched_district`/`institution_spec_dir` 필드 유무로 `spec_research_node` 실행 여부를 파이프라인이 스스로 분기한다(신규 분기 코드 없이 상태 기반 분기).

**Tech Stack:** Python 3.11+, `claude-agent-sdk` (신규 의존성, PyPI 최신 `0.2.124`), 기존 `langchain-openai` 1.3.5 / `pydantic` 2.13.4, `pytest` + `unittest.mock`.

## Global Constraints

- 기존 노드(`institution_match_node`, `content_writer_node`, `verification_node`, `pptx_builder_node`)의 코드는 **변경하지 않는다** — 스펙(`agent/docs/superpowers/specs/2026-07-21-rfp-agent-team-design.md`)의 핵심 결정 사항.
- 산출물 포맷은 `institution-corpus-format` 스킬 규격을 그대로 따른다: `spec/` 파일(`00_인덱스.txt` 포함), `plan/` 파일(`00~05`), `bank_ideas_draft.txt`(**복수형**, 오탈자 아님 — 과거 세션에서 단수형 오기 사례가 있었으니 반드시 복수형으로 생성).
- rfp-locate 산출물 경로는 스킬 규격 그대로: `report_new/{institution}/rfp_scoring.json`, `report_new/{institution}/rfp_text.txt` — `rfp_analysis_node`(기존 코드, 변경 없음)가 이 경로를 그대로 읽으므로 경로를 바꾸면 안 됨.
- 신규 기관 spec 디렉터리는 `giganlist/{영문슬러그}/spec/`에 생성 — 슬러그는 LLM이 기관명을 보고 기존 25개구 관례(로마자 표기, 예: 서초→`seocho`)에 맞춰 결정한다.
- 테스트는 모두 `claude_agent_sdk` 호출부를 mock으로 대체해 실행한다(실제 API 비용 없이 `pytest -m "not llm"`으로 전부 통과해야 함) — 기존 `agent/tests/`가 `unittest.mock.patch`로 `get_llm`을 mock하는 것과 동일한 패턴.
- 사용자 검토 체크포인트는 spec 생성 직후 1곳뿐 — `agent/main.py`가 `spec_research_node` 실행 후 CLI에서 계속 진행할지 사용자에게 confirm을 받고, 이후 단계(plan→보고서→PPT)는 자동 진행.
- 나라장터 등 상시 크롤링/모니터링은 이번 계획의 범위 밖(스펙에서 명시적으로 제외).

---

## File Structure

- **Create** `agent/nodes/rfp_locate.py` — `rfp_locate_node(state)`: institution_name으로 서브에이전트를 호출해 rfp-locate 스킬 절차(PDF 탐색→텍스트 추출→배점표 구조화)를 수행시키고, `report_new/{institution}/{rfp_scoring.json, rfp_text.txt}`가 실제로 생성됐는지 검증 후 그 경로를 state에 반환.
- **Create** `agent/nodes/spec_research.py` — `spec_research_node(state)`: `matched_district`가 없을 때만 호출되는 노드. 서브에이전트에게 institution-corpus-format 스킬 규격 + WebSearch/WebFetch 도구를 주고 `giganlist/{slug}/spec/`을 생성시킨 뒤, 필수 파일(`00_인덱스.txt` 등)이 실제로 생성됐는지 검증.
- **Create** `agent/nodes/plan_writer.py` — `plan_writer_node(state)`: `giganlist/{slug}/spec/`을 읽어 서브에이전트에게 institution-corpus-format 규격으로 `plan/00~05`+`bank_ideas_draft.txt`를 작성시키고, 산출물 존재를 검증.
- **Create** `agent/tools/subagent_runner.py` — `run_subagent(prompt: str, allowed_tools: list[str], cwd: str) -> str`: `claude_agent_sdk`를 감싸는 얇은 헬퍼. 세 노드가 공통으로 쓰는 "프롬프트 실행하고 최종 텍스트 응답 받기" 로직을 한 곳에 모은다(중복 제거, 각 노드 테스트에서 이 함수 하나만 mock하면 됨).
- **Create** `agent/checkpoint.py` — `confirm_spec_review(institution_spec_dir: str) -> bool`: CLI에서 사용자에게 spec 검토 결과를 묻는 순수 input 래퍼(테스트에서 mock 가능하도록 분리).
- **Create** `agent/main.py` — CLI 진입점. `python -m agent.main "<기관명>"`. 노드 순서: `rfp_locate_node` → `rfp_analysis_node`(기존) → `institution_match_node`(기존) → [`matched_district`가 없으면 `spec_research_node` → `confirm_spec_review` 체크포인트 → `plan_writer_node`] → `content_writer_node`/`verification_node` 반복(기존) → `pptx_builder_node`(기존).
- **Modify** `agent/state.py` — `ProposalState`에 신규 필드 추가: `rfp_scoring_path: str`, `rfp_text_path: str`, `institution_slug: str | None`.
- **Test** `agent/tests/test_subagent_runner.py`, `agent/tests/test_rfp_locate.py`, `agent/tests/test_spec_research.py`, `agent/tests/test_plan_writer.py`, `agent/tests/test_checkpoint.py`, `agent/tests/test_main.py`.

## Interfaces Summary (across tasks)

- `run_subagent(prompt: str, allowed_tools: list[str], cwd: str = ".") -> str` — Task 1이 정의, Task 2/3/4가 소비.
- `rfp_locate_node(state: dict) -> dict` — 반환 키: `rfp_scoring_path`, `rfp_text_path`.
- `spec_research_node(state: dict) -> dict` — 반환 키: `institution_slug`, `institution_spec_dir`.
- `plan_writer_node(state: dict) -> dict` — 반환 키: `institution_plan_dir`, `bank_ideas_draft_path`.
- `confirm_spec_review(institution_spec_dir: str) -> bool` — Task 5가 정의, Task 6(`main.py`)이 소비.

---

### Task 1: `run_subagent` 공통 헬퍼

**Files:**
- Create: `agent/tools/subagent_runner.py`
- Test: `agent/tests/test_subagent_runner.py`

**Interfaces:**
- Produces: `run_subagent(prompt: str, allowed_tools: list[str], cwd: str = ".") -> str` — 세 노드가 전부 이 함수를 통해서만 `claude_agent_sdk`를 사용한다.

- [ ] **Step 1: `claude-agent-sdk` 의존성 확인 및 requirements 반영**

`agent/` 하위에 별도 `requirements.txt`가 없으므로, 리포 루트에 있는지 확인한다.

Run: `find . -maxdepth 1 -iname "requirements*.txt"`

없으면 `agent/requirements.txt`를 새로 만든다:

```
claude-agent-sdk>=0.2.124
langchain-openai>=1.3.5
pydantic>=2.13.4
python-pptx
pypdf
```

- [ ] **Step 2: 패키지 설치**

Run: `pip install claude-agent-sdk`
Expected: `Successfully installed claude-agent-sdk-0.2.124` (또는 이미 설치돼 있다는 메시지)

- [ ] **Step 3: 실패하는 테스트 작성**

`claude_agent_sdk`의 실제 API 형태를 모른 채 만들 수는 없으므로, 먼저 SDK의 동기 실행 진입점을 확인한다:

Run: `python -c "import claude_agent_sdk; print([n for n in dir(claude_agent_sdk) if not n.startswith('_')])"`

이 출력에서 동기적으로 프롬프트를 실행하고 최종 텍스트를 반환하는 함수/클래스(예: `query`, `ClaudeSDKClient` 등)를 확인한 뒤, 아래 테스트의 patch 대상 경로(`agent.tools.subagent_runner.<실제 심볼명>`)를 그 이름으로 맞춰 작성한다. SDK가 비동기(`async def query(...)`)라면 `run_subagent` 내부에서 `asyncio.run(...)`으로 감싼다.

```python
# agent/tests/test_subagent_runner.py
from unittest.mock import patch, MagicMock

from agent.tools.subagent_runner import run_subagent


@patch("agent.tools.subagent_runner._invoke_sdk")
def test_run_subagent_returns_final_text(mock_invoke):
    mock_invoke.return_value = "완료: report_new/suwon/rfp_scoring.json 생성함"

    result = run_subagent(
        prompt="RFP를 찾아 배점표를 구조화하세요.",
        allowed_tools=["Bash", "WebSearch", "WebFetch", "Read", "Write"],
        cwd=".",
    )

    assert result == "완료: report_new/suwon/rfp_scoring.json 생성함"
    mock_invoke.assert_called_once()
    _, kwargs = mock_invoke.call_args
    assert kwargs["prompt"] == "RFP를 찾아 배점표를 구조화하세요."
    assert kwargs["allowed_tools"] == ["Bash", "WebSearch", "WebFetch", "Read", "Write"]
    assert kwargs["cwd"] == "."


@patch("agent.tools.subagent_runner._invoke_sdk")
def test_run_subagent_defaults_cwd_to_dot(mock_invoke):
    mock_invoke.return_value = "ok"

    run_subagent(prompt="테스트", allowed_tools=["Read"])

    _, kwargs = mock_invoke.call_args
    assert kwargs["cwd"] == "."
```

- [ ] **Step 4: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_subagent_runner.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.tools.subagent_runner'`

- [ ] **Step 5: 최소 구현 작성**

Step 3에서 확인한 실제 SDK 심볼명으로 `_invoke_sdk`의 내부 구현을 채운다(아래는 SDK가 `claude_agent_sdk.query(prompt=..., options=...)` 형태의 비동기 제너레이터를 제공하는 일반적인 형태를 가정한 뼈대 — Step 3 확인 결과에 맞게 조정):

```python
# agent/tools/subagent_runner.py
import asyncio

from claude_agent_sdk import ClaudeAgentOptions, query


def _invoke_sdk(prompt: str, allowed_tools: list[str], cwd: str) -> str:
    async def _run() -> str:
        options = ClaudeAgentOptions(allowed_tools=allowed_tools, cwd=cwd)
        chunks = []
        async for message in query(prompt=prompt, options=options):
            text = getattr(message, "result", None) or getattr(message, "text", None)
            if text:
                chunks.append(text)
        return "\n".join(chunks)

    return asyncio.run(_run())


def run_subagent(prompt: str, allowed_tools: list[str], cwd: str = ".") -> str:
    return _invoke_sdk(prompt=prompt, allowed_tools=allowed_tools, cwd=cwd)
```

- [ ] **Step 6: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_subagent_runner.py -v`
Expected: PASS (2 passed)

- [ ] **Step 7: Commit**

```bash
git add agent/requirements.txt agent/tools/subagent_runner.py agent/tests/test_subagent_runner.py
git commit -m "feat: add run_subagent helper wrapping claude-agent-sdk"
```

---

### Task 2: `rfp_locate_node`

**Files:**
- Create: `agent/nodes/rfp_locate.py`
- Modify: `agent/state.py` (add `rfp_scoring_path`, `rfp_text_path` fields)
- Test: `agent/tests/test_rfp_locate.py`

**Interfaces:**
- Consumes: `run_subagent(prompt: str, allowed_tools: list[str], cwd: str = ".") -> str` (Task 1)
- Produces: `rfp_locate_node(state: dict) -> dict` returning `{"rfp_scoring_path": str, "rfp_text_path": str}` — Task 6(`main.py`)과 기존 `rfp_analysis_node`가 `report_new_dir`/`institution_name` 조합으로 이 경로를 그대로 읽는다(파일 자체는 서브에이전트가 씀).

- [ ] **Step 1: `ProposalState`에 필드 추가**

```python
# agent/state.py — 기존 필드 목록에 추가
    rfp_scoring_path: str
    rfp_text_path: str
    institution_slug: str | None
```

(`institution_slug`는 Task 3에서 `spec_research_node`가 채우는 필드지만, `ProposalState`
정의는 한 곳에 모아두는 게 맞으므로 이 Task에서 함께 추가한다.)

- [ ] **Step 2: 실패하는 테스트 작성**

`rfp_locate_node`는 서브에이전트가 실제로 파일을 썼는지 **검증**해야 한다(스킬 자체가 "파일을 못 찾으면 사용자에게 확인"이라 명시하므로, 노드도 결과 파일 부재 시 명확히 실패해야 한다).

```python
# agent/tests/test_rfp_locate.py
import os
from unittest.mock import patch

import pytest

from agent.nodes.rfp_locate import rfp_locate_node


@patch("agent.nodes.rfp_locate.run_subagent")
def test_rfp_locate_returns_paths_when_files_created(mock_run, tmp_path):
    institution_name = "suwon"
    report_new_dir = tmp_path / "report_new"
    inst_dir = report_new_dir / institution_name
    inst_dir.mkdir(parents=True)
    (inst_dir / "rfp_scoring.json").write_text("{}", encoding="utf-8")
    (inst_dir / "rfp_text.txt").write_text("공고문 텍스트", encoding="utf-8")

    mock_run.return_value = "완료"

    state = {"institution_name": institution_name, "report_new_dir": str(report_new_dir)}
    result = rfp_locate_node(state)

    assert result["rfp_scoring_path"] == str(inst_dir / "rfp_scoring.json")
    assert result["rfp_text_path"] == str(inst_dir / "rfp_text.txt")
    mock_run.assert_called_once()


@patch("agent.nodes.rfp_locate.run_subagent")
def test_rfp_locate_raises_when_files_missing(mock_run, tmp_path):
    mock_run.return_value = "찾지 못함"

    state = {
        "institution_name": "unknown_inst",
        "report_new_dir": str(tmp_path / "report_new"),
    }

    with pytest.raises(FileNotFoundError):
        rfp_locate_node(state)
```

- [ ] **Step 3: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_rfp_locate.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.rfp_locate'`

- [ ] **Step 4: 최소 구현 작성**

```python
# agent/nodes/rfp_locate.py
import os

from agent.tools.subagent_runner import run_subagent


RFP_LOCATE_PROMPT = """다음 기관의 RFP(공고문) PDF를 찾아 텍스트를 추출하고 배점표를
구조화하세요. rfp-locate 스킬(.claude/skills/rfp-locate/SKILL.md)의 절차를 그대로
따르세요:

1. RFP/ 폴더에서 PDF를 찾습니다. 없으면 웹에서 "{institution_name}" 공식 공고문을
   검색해 다운로드하세요.
2. scripts/extract_text.py로 텍스트를 추출합니다. is_abnormal이 true면
   scripts/render_pages.py로 페이지를 이미지로 렌더링해 비전으로 판독하세요.
3. references/scoring_schema.json 형식에 맞춰 배점표를 구조화하세요.
4. 다음 경로에 결과를 저장하세요:
   - {report_new_dir}/{institution_name}/rfp_scoring.json
   - {report_new_dir}/{institution_name}/rfp_text.txt

기관명: {institution_name}
"""


def rfp_locate_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    report_new_dir = state.get("report_new_dir", "report_new")

    run_subagent(
        prompt=RFP_LOCATE_PROMPT.format(
            institution_name=institution_name,
            report_new_dir=report_new_dir,
        ),
        allowed_tools=["Bash", "Read", "Write", "WebSearch", "WebFetch"],
    )

    inst_dir = os.path.join(report_new_dir, institution_name)
    scoring_path = os.path.join(inst_dir, "rfp_scoring.json")
    text_path = os.path.join(inst_dir, "rfp_text.txt")

    if not os.path.isfile(scoring_path) or not os.path.isfile(text_path):
        raise FileNotFoundError(
            f"rfp-locate 서브에이전트가 {inst_dir}에 필요한 파일을 생성하지 않았습니다."
        )

    return {"rfp_scoring_path": scoring_path, "rfp_text_path": text_path}
```

- [ ] **Step 5: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_rfp_locate.py -v`
Expected: PASS (2 passed)

- [ ] **Step 6: Commit**

```bash
git add agent/nodes/rfp_locate.py agent/state.py agent/tests/test_rfp_locate.py
git commit -m "feat: add rfp_locate_node driving rfp-locate skill via subagent"
```

---

### Task 3: `spec_research_node`

**Files:**
- Create: `agent/nodes/spec_research.py`
- Test: `agent/tests/test_spec_research.py`

**Interfaces:**
- Consumes: `run_subagent(...)` (Task 1)
- Produces: `spec_research_node(state: dict) -> dict` returning `{"institution_slug": str, "institution_spec_dir": str}` — Task 4(`plan_writer_node`)와 Task 6(`main.py`)이 이 두 필드를 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
# agent/tests/test_spec_research.py
import os
from unittest.mock import patch

import pytest

from agent.nodes.spec_research import spec_research_node


@patch("agent.nodes.spec_research.run_subagent")
def test_spec_research_creates_spec_dir(mock_run, tmp_path):
    giganlist_dir = tmp_path / "giganlist"
    spec_dir = giganlist_dir / "seocho" / "spec"

    def _fake_run(prompt, allowed_tools, cwd="."):
        spec_dir.mkdir(parents=True)
        (spec_dir / "00_인덱스.txt").write_text("인덱스", encoding="utf-8")
        return "seocho로 생성 완료"

    mock_run.side_effect = _fake_run

    state = {
        "institution_name": "서초구",
        "institution_type": "구",
        "giganlist_dir": str(giganlist_dir),
    }
    result = spec_research_node(state)

    assert result["institution_slug"] == "seocho"
    assert result["institution_spec_dir"] == str(spec_dir)
    assert os.path.isfile(spec_dir / "00_인덱스.txt")


@patch("agent.nodes.spec_research.run_subagent")
def test_spec_research_raises_when_index_missing(mock_run, tmp_path):
    mock_run.return_value = "실패"

    state = {
        "institution_name": "서초구",
        "institution_type": "구",
        "giganlist_dir": str(tmp_path / "giganlist"),
    }

    with pytest.raises(FileNotFoundError):
        spec_research_node(state)
```

`institution_slug`를 서브에이전트의 자연어 응답에서 파싱해야 하므로, 노드는 응답 문자열에서 `giganlist_dir` 아래 새로 생긴 디렉터리를 스캔해서 찾는다(자연어 파싱보다 견고함) — Step 2 구현에서 이 방식을 사용한다.

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_spec_research.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.spec_research'`

- [ ] **Step 3: 최소 구현 작성**

```python
# agent/nodes/spec_research.py
import os

from agent.tools.subagent_runner import run_subagent
from agent.tools.spec_loader import list_known_institutions


SPEC_RESEARCH_PROMPT = """"{institution_name}"({institution_type})에 대한 리서치를
수행해 spec 자료를 만드세요. institution-corpus-format 스킬
(.claude/skills/institution-corpus-format/SKILL.md)의 규격을 그대로 따르세요.

1. 기관명을 기존 25개구 관례(로마자 표기 영문 슬러그, 예: 서초구→seocho)에 맞춰
   영문 슬러그로 변환하세요.
2. WebSearch/WebFetch로 해당 기관의 예산서, 사업목록, 홈페이지, 민원게시판 정보를
   수집하세요. 사실을 날조하지 말고, 확인 안 된 정보는 "확인안됨"으로 명시하세요.
3. giganlist/{{slug}}/spec/ 아래에 00_인덱스.txt를 포함한 spec 파일들을
   institution-corpus-format 규격 그대로 작성하세요.
4. 최종적으로 어떤 slug를 사용했는지 명확히 답변하세요.

giganlist_dir: {giganlist_dir}
"""


def spec_research_node(state: dict) -> dict:
    institution_name = state["institution_name"]
    institution_type = state.get("institution_type", "구")
    giganlist_dir = state["giganlist_dir"]

    known_before = set(list_known_institutions(giganlist_dir))

    run_subagent(
        prompt=SPEC_RESEARCH_PROMPT.format(
            institution_name=institution_name,
            institution_type=institution_type,
            giganlist_dir=giganlist_dir,
        ),
        allowed_tools=["Bash", "Read", "Write", "WebSearch", "WebFetch"],
    )

    known_after = set(list_known_institutions(giganlist_dir))
    new_slugs = known_after - known_before

    if len(new_slugs) != 1:
        raise FileNotFoundError(
            f"spec_research 서브에이전트가 giganlist_dir에 정확히 1개의 신규 기관 "
            f"폴더를 생성하지 않았습니다 (발견: {sorted(new_slugs)})."
        )

    slug = new_slugs.pop()
    spec_dir = os.path.join(giganlist_dir, slug, "spec")
    index_path = os.path.join(spec_dir, "00_인덱스.txt")

    if not os.path.isfile(index_path):
        raise FileNotFoundError(f"{index_path}가 생성되지 않았습니다.")

    return {"institution_slug": slug, "institution_spec_dir": spec_dir}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_spec_research.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/spec_research.py agent/tests/test_spec_research.py
git commit -m "feat: add spec_research_node for new-institution spec generation"
```

---

### Task 4: `plan_writer_node`

**Files:**
- Create: `agent/nodes/plan_writer.py`
- Test: `agent/tests/test_plan_writer.py`

**Interfaces:**
- Consumes: `run_subagent(...)` (Task 1); reads `state["institution_slug"]`, `state["institution_spec_dir"]`, `state["giganlist_dir"]` (Task 3의 출력)
- Produces: `plan_writer_node(state: dict) -> dict` returning `{"institution_plan_dir": str, "bank_ideas_draft_path": str}`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
# agent/tests/test_plan_writer.py
import os
from unittest.mock import patch

import pytest

from agent.nodes.plan_writer import plan_writer_node


@patch("agent.nodes.plan_writer.run_subagent")
def test_plan_writer_creates_plan_and_bank_ideas(mock_run, tmp_path):
    giganlist_dir = tmp_path / "giganlist"
    base = giganlist_dir / "seocho"
    plan_dir = base / "plan"

    def _fake_run(prompt, allowed_tools, cwd="."):
        plan_dir.mkdir(parents=True)
        for name in [
            "00_제안개요_및_배경.txt", "01_제안사업_요약표.txt",
            "02_IT디지털기획_사업제안.txt", "03_금전적지원_사업제안.txt",
            "04_실행로드맵_및_기대효과.txt", "05_검증결과.txt",
        ]:
            (plan_dir / name).write_text("내용", encoding="utf-8")
        (base / "bank_ideas_draft.txt").write_text("초안", encoding="utf-8")
        return "완료"

    mock_run.side_effect = _fake_run

    state = {
        "institution_slug": "seocho",
        "institution_spec_dir": str(base / "spec"),
        "giganlist_dir": str(giganlist_dir),
        "scoring_table": [{"category": "시민이용 편의성", "item": "x", "score": 10}],
    }
    result = plan_writer_node(state)

    assert result["institution_plan_dir"] == str(plan_dir)
    assert result["bank_ideas_draft_path"] == str(base / "bank_ideas_draft.txt")


@patch("agent.nodes.plan_writer.run_subagent")
def test_plan_writer_raises_when_bank_ideas_missing(mock_run, tmp_path):
    giganlist_dir = tmp_path / "giganlist"
    base = giganlist_dir / "seocho"
    plan_dir = base / "plan"

    def _fake_run(prompt, allowed_tools, cwd="."):
        plan_dir.mkdir(parents=True)
        (plan_dir / "00_제안개요_및_배경.txt").write_text("내용", encoding="utf-8")
        return "완료"

    mock_run.side_effect = _fake_run

    state = {
        "institution_slug": "seocho",
        "institution_spec_dir": str(base / "spec"),
        "giganlist_dir": str(giganlist_dir),
    }

    with pytest.raises(FileNotFoundError):
        plan_writer_node(state)
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_plan_writer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.nodes.plan_writer'`

- [ ] **Step 3: 최소 구현 작성**

```python
# agent/nodes/plan_writer.py
import os

from agent.tools.subagent_runner import run_subagent


PLAN_WRITER_PROMPT = """giganlist/{slug}/spec/ 아래의 리서치 자료를 바탕으로
institution-corpus-format 스킬(.claude/skills/institution-corpus-format/SKILL.md)의
규격 그대로 plan/ 문서와 bank_ideas_draft.txt를 작성하세요.

1. giganlist/{slug}/plan/ 아래에 00_제안개요_및_배경.txt부터 05_검증결과.txt까지
   작성하세요. 모든 사실/수치 주장은 spec/NN 형태로 출처를 인용하세요.
2. 02/03 카테고리(사업제안 분야)는 아래 RFP 배점표의 category 값을 그대로 따르세요
   (도봉구의 "IT디지털기획/금전적지원" 2분류는 고정 스키마가 아니라 하나의 예시입니다):
   {scoring_categories}
3. giganlist/{slug}/bank_ideas_draft.txt를 복수형 파일명 그대로 작성하세요
   (bank_idea_draft.txt 단수형 아님 — 반드시 확인).
4. 05_검증결과.txt에서 인용 정확성을 spec 원문과 교차 검증하고, 신뢰도 점수(/100)를
   매기세요.

spec 디렉토리: {institution_spec_dir}
"""


def plan_writer_node(state: dict) -> dict:
    slug = state["institution_slug"]
    giganlist_dir = state["giganlist_dir"]
    institution_spec_dir = state["institution_spec_dir"]
    scoring_table = state.get("scoring_table", [])
    scoring_categories = ", ".join(sorted({c["category"] for c in scoring_table})) or "(배점표 없음 — 일반 카테고리로 구성)"

    run_subagent(
        prompt=PLAN_WRITER_PROMPT.format(
            slug=slug,
            institution_spec_dir=institution_spec_dir,
            scoring_categories=scoring_categories,
        ),
        allowed_tools=["Bash", "Read", "Write"],
    )

    base = os.path.join(giganlist_dir, slug)
    plan_dir = os.path.join(base, "plan")
    bank_ideas_path = os.path.join(base, "bank_ideas_draft.txt")

    if not os.path.isdir(plan_dir) or not os.listdir(plan_dir):
        raise FileNotFoundError(f"{plan_dir}가 생성되지 않았습니다.")
    if not os.path.isfile(bank_ideas_path):
        raise FileNotFoundError(f"{bank_ideas_path}가 생성되지 않았습니다.")

    return {"institution_plan_dir": plan_dir, "bank_ideas_draft_path": bank_ideas_path}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_plan_writer.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/plan_writer.py agent/tests/test_plan_writer.py
git commit -m "feat: add plan_writer_node for new-institution plan/bank_ideas generation"
```

---

### Task 5: 사용자 검토 체크포인트

**Files:**
- Create: `agent/checkpoint.py`
- Test: `agent/tests/test_checkpoint.py`

**Interfaces:**
- Produces: `confirm_spec_review(institution_spec_dir: str) -> bool` — Task 6(`main.py`)이 소비.

- [ ] **Step 1: 실패하는 테스트 작성**

```python
# agent/tests/test_checkpoint.py
from unittest.mock import patch

from agent.checkpoint import confirm_spec_review


@patch("builtins.input", return_value="y")
def test_confirm_spec_review_returns_true_on_yes(mock_input):
    assert confirm_spec_review("giganlist/seocho/spec") is True


@patch("builtins.input", return_value="n")
def test_confirm_spec_review_returns_false_on_no(mock_input):
    assert confirm_spec_review("giganlist/seocho/spec") is False


@patch("builtins.input", return_value="")
def test_confirm_spec_review_defaults_to_false_on_empty(mock_input):
    assert confirm_spec_review("giganlist/seocho/spec") is False
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_checkpoint.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.checkpoint'`

- [ ] **Step 3: 최소 구현 작성**

```python
# agent/checkpoint.py
def confirm_spec_review(institution_spec_dir: str) -> bool:
    print(f"\n신규 기관 spec 자료가 생성되었습니다: {institution_spec_dir}")
    print("내용을 검토한 뒤, 계속 진행할지 확인해주세요.")
    answer = input("plan/보고서/PPT 생성으로 계속 진행할까요? (y/n): ").strip().lower()
    return answer == "y"
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_checkpoint.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add agent/checkpoint.py agent/tests/test_checkpoint.py
git commit -m "feat: add CLI checkpoint for spec review confirmation"
```

---

### Task 6: `agent/main.py` — 전체 파이프라인 CLI

**Files:**
- Create: `agent/main.py`
- Test: `agent/tests/test_main.py`

**Interfaces:**
- Consumes: 기존 `rfp_analysis_node`, `institution_match_node`, `content_writer_node`, `verification_node`, `pptx_builder_node`(변경 없음); Task 2~5의 `rfp_locate_node`, `spec_research_node`, `plan_writer_node`, `confirm_spec_review`.
- Produces: `run_full_pipeline(institution_name: str, **kwargs) -> dict` — 최종 state 반환. `if __name__ == "__main__":` 블록에서 `sys.argv[1]`을 받아 호출.

- [ ] **Step 1: 실패하는 테스트 작성 — 기존 구(giganlist 매칭) 경로는 spec_research 스킵**

```python
# agent/tests/test_main.py
from unittest.mock import MagicMock, patch

from agent.main import run_full_pipeline


@patch("agent.main.pptx_builder_node")
@patch("agent.main.verification_node")
@patch("agent.main.content_writer_node")
@patch("agent.main.plan_writer_node")
@patch("agent.main.confirm_spec_review")
@patch("agent.main.spec_research_node")
@patch("agent.main.institution_match_node")
@patch("agent.main.rfp_analysis_node")
@patch("agent.main.rfp_locate_node")
def test_existing_district_skips_spec_research(
    mock_rfp_locate, mock_rfp_analysis, mock_match, mock_spec_research,
    mock_confirm, mock_plan_writer, mock_content_writer, mock_verification,
    mock_pptx,
):
    mock_rfp_locate.return_value = {"rfp_scoring_path": "x", "rfp_text_path": "y"}
    mock_rfp_analysis.return_value = {
        "institution_name": "dobong", "scoring_table": [], "rfp_text": "",
    }
    mock_match.return_value = {
        "institution_type": "구",
        "matched_district": "dobong",
        "institution_spec_dir": "giganlist/dobong/spec",
        "archive_pptx_path": None,
    }
    mock_content_writer.return_value = {"sections": [], "revision_count": 0}
    mock_verification.return_value = {"coverage_report": []}
    mock_pptx.return_value = {"pptx_path": "out.pptx"}

    result = run_full_pipeline("dobong")

    mock_spec_research.assert_not_called()
    mock_confirm.assert_not_called()
    mock_plan_writer.assert_not_called()
    assert result["pptx_path"] == "out.pptx"


@patch("agent.main.pptx_builder_node")
@patch("agent.main.verification_node")
@patch("agent.main.content_writer_node")
@patch("agent.main.plan_writer_node")
@patch("agent.main.confirm_spec_review")
@patch("agent.main.spec_research_node")
@patch("agent.main.institution_match_node")
@patch("agent.main.rfp_analysis_node")
@patch("agent.main.rfp_locate_node")
def test_new_institution_runs_spec_research_then_confirms(
    mock_rfp_locate, mock_rfp_analysis, mock_match, mock_spec_research,
    mock_confirm, mock_plan_writer, mock_content_writer, mock_verification,
    mock_pptx,
):
    mock_rfp_locate.return_value = {"rfp_scoring_path": "x", "rfp_text_path": "y"}
    mock_rfp_analysis.return_value = {
        "institution_name": "seocho", "scoring_table": [], "rfp_text": "",
    }
    mock_match.return_value = {
        "institution_type": "구",
        "matched_district": None,
        "institution_spec_dir": None,
        "archive_pptx_path": None,
    }
    mock_spec_research.return_value = {
        "institution_slug": "seocho", "institution_spec_dir": "giganlist/seocho/spec",
    }
    mock_confirm.return_value = True
    mock_plan_writer.return_value = {
        "institution_plan_dir": "giganlist/seocho/plan",
        "bank_ideas_draft_path": "giganlist/seocho/bank_ideas_draft.txt",
    }
    mock_content_writer.return_value = {"sections": [], "revision_count": 0}
    mock_verification.return_value = {"coverage_report": []}
    mock_pptx.return_value = {"pptx_path": "out.pptx"}

    result = run_full_pipeline("seocho")

    mock_spec_research.assert_called_once()
    mock_confirm.assert_called_once_with("giganlist/seocho/spec")
    mock_plan_writer.assert_called_once()
    assert result["pptx_path"] == "out.pptx"


@patch("agent.main.confirm_spec_review")
@patch("agent.main.spec_research_node")
@patch("agent.main.institution_match_node")
@patch("agent.main.rfp_analysis_node")
@patch("agent.main.rfp_locate_node")
def test_new_institution_stops_when_user_declines(
    mock_rfp_locate, mock_rfp_analysis, mock_match, mock_spec_research, mock_confirm,
):
    mock_rfp_locate.return_value = {"rfp_scoring_path": "x", "rfp_text_path": "y"}
    mock_rfp_analysis.return_value = {
        "institution_name": "seocho", "scoring_table": [], "rfp_text": "",
    }
    mock_match.return_value = {
        "institution_type": "구",
        "matched_district": None,
        "institution_spec_dir": None,
        "archive_pptx_path": None,
    }
    mock_spec_research.return_value = {
        "institution_slug": "seocho", "institution_spec_dir": "giganlist/seocho/spec",
    }
    mock_confirm.return_value = False

    result = run_full_pipeline("seocho")

    assert result.get("stopped_after_spec_review") is True
    assert "pptx_path" not in result
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `python -m pytest agent/tests/test_main.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'agent.main'`

- [ ] **Step 3: 최소 구현 작성**

```python
# agent/main.py
import sys

from agent.checkpoint import confirm_spec_review
from agent.nodes.content_writer import content_writer_node
from agent.nodes.institution_match import institution_match_node
from agent.nodes.plan_writer import plan_writer_node
from agent.nodes.pptx_builder import pptx_builder_node
from agent.nodes.rfp_analysis import rfp_analysis_node
from agent.nodes.rfp_locate import rfp_locate_node
from agent.nodes.spec_research import spec_research_node
from agent.nodes.verification import verification_node


def run_full_pipeline(
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

    state.update(rfp_locate_node(state))
    state.update(rfp_analysis_node(state))
    state.update(institution_match_node(state))

    if not state.get("matched_district"):
        state.update(spec_research_node(state))
        if not confirm_spec_review(state["institution_spec_dir"]):
            state["stopped_after_spec_review"] = True
            return state
        state.update(plan_writer_node(state))

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


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("사용법: python -m agent.main \"<기관명>\"")
        sys.exit(1)

    final_state = run_full_pipeline(sys.argv[1])

    if final_state.get("stopped_after_spec_review"):
        print("spec 검토 단계에서 중단되었습니다.")
    else:
        print(f"완료: {final_state.get('pptx_path')}")
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `python -m pytest agent/tests/test_main.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add agent/main.py agent/tests/test_main.py
git commit -m "feat: add agent.main CLI wiring full extended pipeline"
```

---

### Task 7: End-to-End 검증 (자동화 테스트 전체 + 수동 스모크 테스트)

**Files:** (변경 없음 — 검증만)

- [ ] **Step 1: 전체 자동화 테스트 실행**

Run: `python -m pytest agent/ -m "not llm" -v`
Expected: 기존 24개 + 이번에 추가된 테스트(약 15개) 전부 PASS, 실패 0건.

- [ ] **Step 2: 수동 스모크 테스트 여부 확인**

`run_full_pipeline("수원시")`를 실제 `OPENAI_API_KEY`+Claude Agent SDK 인증으로 실행해보는 것은 실제 API 비용이 발생하는 수동 단계다. 자동화 테스트만으로 이번 계획을 완료 처리할지, 실제 스모크 테스트까지 실행할지 사용자에게 물어본다(기존 Task 8 완료 시 동일하게 물어봤던 선례를 따름).

- [ ] **Step 3: (사용자가 스모크 테스트를 원할 경우) 실행**

Run: `python -m agent.main "수원시"`
Expected: `RFP/수원시 금고 지정 계획 공고문.pdf`를 이용해 rfp_locate_node가 기존 파일을 그대로 활용하거나 재확인하고, `institution_match_node`가 `matched_district=None`(수원시는 giganlist에 없음)으로 판정해 spec_research 체크포인트에서 사용자 확인을 요청함을 확인.

- [ ] **Step 4: 최종 커밋 (문서화만 필요한 경우)**

계획 완료 후 후속 조치(체크박스 갱신 등)가 필요하면 별도로 커밋한다. 코드 변경이 없으므로 새 커밋은 검증 단계 자체에서는 발생하지 않을 수 있다.
