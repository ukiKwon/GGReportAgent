# 6단계 3팀 분화 (role_router + content_writer 역할 분화) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 배점표 항목을 영업/전산/예산 3팀에 규칙기반으로 라우팅하고, `content_writer_node`를 역할별 코퍼스로 3벌 실행해 병합하는 6단계(세부기획)를 파이프라인에 배선한다.

**Architecture:** 상위 E2E 스펙(`docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md`) §⑤. 신규 `role_router_node`가 `scoring_table` 각 항목을 키워드 규칙으로 3팀에 배정(양쪽 키워드가 동시에 걸리는 애매한 항목만 LLM 분류 폴백), `content_writer_node`는 `role` 파라미터를 받아 자기 팀 항목만 역할별 코퍼스로 작성, 파이프라인이 3팀 결과를 배점표 원순서로 병합한 뒤 `verification_node`를 병합본에 1회 실행한다.

**스펙과의 의도적 편차 (Task 4에서 스펙에 기록):** 스펙 §⑤의 "LangGraph 병렬 분기 + `Annotated[list[dict], operator.add]` reducer" 대신 **순수 Python 순차 실행 + 리스트 병합**으로 구현한다. 이유: ① 현재 `agent/pipeline.py`는 LangGraph 없이 구현된 순차 함수이고 `requirements.txt`에도 langgraph가 없다(폐쇄망 의존성 최소화) ② 병렬화의 실익이 없다 — LLM 엔드포인트가 단일 GPU 로컬 서빙이라 동시 호출이 직렬화된다. 스펙이 reducer로 얻으려던 목표 동작("병렬 결과 자동 병합, 별도 merge 노드 불필요, verification은 병합본에 1회")은 동일하게 달성된다.

**Tech Stack:** Python 3.14, pydantic, langchain_openai(`agent/llm.py` 어댑터 경유만), pytest(`unittest.mock`).

## Global Constraints

- **새 의존성 금지** — `requirements.txt` 변경 없음(langgraph 추가하지 않는다).
- **LLM 접근은 `agent/llm.py`의 `get_llm`/`structured_llm`만** — 상용 API·모델명 하드코딩 금지(스펙 §⑥).
- **콘텐츠 생성 원칙(스펙 §⑤)**: 본문/근거는 코퍼스에서 조립, LLM은 다듬기와 저위험 분류만. 라우팅의 기본은 규칙이고 LLM은 애매한 항목의 분류 폴백뿐이다.
- 역할별 코퍼스(스펙 §⑤ 표 그대로): 영업=`spec/` 전체+`bank_ideas_draft.txt`, 전산=`plan/02_IT디지털기획_사업제안.txt`, 예산=`plan/03_금전적지원_사업제안.txt`. 실제 파일명은 `corpus/institutions/dobong/`에서 확인된 위 이름 그대로다.
- 6단계에 사람 체크포인트를 추가하지 않는다(스펙 §⑤ 마지막 문단).
- 주석·프롬프트·커밋 메시지는 기존 파일들과 같은 한국어 스타일, 파일은 UTF-8.
- 전체 테스트 `py -3 -m pytest agent backend collector dashboard -q`가 기존 기준선 그대로 통과해야 한다(작업 시작 시 기준선 수를 먼저 실측·기록할 것).

---

### Task 1: `role_router_node` — 규칙기반 라우팅 + LLM 폴백

**Files:**
- Create: `agent/nodes/role_router.py`
- Test: `agent/tests/test_role_router.py`
- Modify: `agent/state.py` (필드 1개 추가)

**Interfaces:**
- Consumes: `state["scoring_table"]: list[dict]` — `[{category, item, score, description}, ...]` (`rfp_analysis_node`/`rfp_extract_node` 산출, 기존 그대로).
- Produces: `role_router_node(state: dict) -> dict` — `{"role_assignments": [{"scoring_item": <item 문자열>, "role": "영업"|"전산"|"예산"}, ...]}` (scoring_table과 같은 순서, 항목당 1건). 상수 `ROLES: tuple[str, str, str] = ("영업", "전산", "예산")` 도 export — Task 2·3이 임포트한다.

- [ ] **Step 1: Write the failing tests**

`agent/tests/test_role_router.py`:

```python
from unittest.mock import MagicMock, patch

from agent.nodes.role_router import role_router_node


def _table(*entries):
    return [
        {"category": c, "item": i, "score": 10, "description": d}
        for (c, i, d) in entries
    ]


def test_budget_keyword_routes_to_budget_team():
    state = {"scoring_table": _table(("가격", "대행 수수료 및 비용", None))}
    result = role_router_node(state)
    assert result["role_assignments"] == [
        {"scoring_item": "대행 수수료 및 비용", "role": "예산"}
    ]


def test_it_keyword_routes_to_it_team():
    state = {"scoring_table": _table(("사업이해도", "전산 시스템 구축 방안", None))}
    result = role_router_node(state)
    assert result["role_assignments"][0]["role"] == "전산"


def test_no_keyword_defaults_to_sales_team():
    state = {"scoring_table": _table(("신용도", "외부기관의 신용평가", "AAA 등급 여부"))}
    result = role_router_node(state)
    assert result["role_assignments"][0]["role"] == "영업"


def test_description_keyword_also_counts():
    """키워드 매칭은 category·item·description 세 필드를 다 본다."""
    state = {"scoring_table": _table(("사업계획", "운영 방안", "플랫폼 고도화 계획"))}
    result = role_router_node(state)
    assert result["role_assignments"][0]["role"] == "전산"


@patch("agent.nodes.role_router.structured_llm")
def test_both_keyword_families_fall_back_to_llm(mock_structured):
    """예산·전산 키워드가 동시에 걸리는 애매한 항목만 LLM 분류로 폴백한다."""
    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.role = "예산"
    mock_llm.invoke.return_value = mock_result
    mock_structured.return_value = mock_llm

    state = {"scoring_table": _table(("사업계획", "전산 시스템 구축 예산의 적정성", None))}
    result = role_router_node(state)

    assert result["role_assignments"][0]["role"] == "예산"
    assert mock_llm.invoke.call_count == 1


@patch("agent.nodes.role_router.structured_llm")
def test_rule_hits_never_call_llm(mock_structured):
    state = {
        "scoring_table": _table(
            ("가격", "비용 절감 방안", None),
            ("기타", "지역사회 기여", None),
        )
    }
    role_router_node(state)
    mock_structured.assert_not_called()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `py -3 -m pytest agent/tests/test_role_router.py -v`
Expected: 전부 FAIL — `ModuleNotFoundError: No module named 'agent.nodes.role_router'`

- [ ] **Step 3: Write the implementation**

`agent/nodes/role_router.py`:

```python
"""6단계 세부기획의 팀 라우터 — 상위 E2E 스펙 §⑤.

배점표 각 항목을 규칙기반 키워드로 3팀(영업/전산/예산)에 배정한다. LLM은 예산·전산
키워드가 동시에 걸리는 애매한 항목의 분류 폴백에만 쓴다 — 자유생성이 아니라 저위험
분류 작업이므로 하이브리드 원칙(본문은 코퍼스 조립, LLM은 다듬기만)과 충돌하지 않는다.
"""

from typing import Literal

from pydantic import BaseModel

from agent.llm import structured_llm

ROLE_SALES = "영업"
ROLE_IT = "전산"
ROLE_BUDGET = "예산"
ROLES = (ROLE_SALES, ROLE_IT, ROLE_BUDGET)

BUDGET_KEYWORDS = ("예산", "가격", "비용")
IT_KEYWORDS = ("IT", "시스템", "전산", "플랫폼")


class RoleResult(BaseModel):
    role: Literal["영업", "전산", "예산"]


ROLE_PROMPT = """다음 배점표 항목을 담당할 팀을 고르세요.

- 예산: 가격/예산/ROI 산정
- 전산: IT/디지털 구현 타당성
- 영업: 협력 취지/기관 수요/관계 형성 (위 둘에 해당하지 않는 모든 항목)

배점 항목: {category} - {item}
설명: {description}
"""


def _rule_role(text: str) -> str | None:
    """규칙 판정. 예산·전산 키워드가 동시에 걸리면 None(애매 → LLM 폴백)."""
    is_budget = any(k in text for k in BUDGET_KEYWORDS)
    is_it = any(k in text for k in IT_KEYWORDS)
    if is_budget and is_it:
        return None
    if is_budget:
        return ROLE_BUDGET
    if is_it:
        return ROLE_IT
    return ROLE_SALES


def role_router_node(state: dict) -> dict:
    assignments = []
    llm = None
    for entry in state["scoring_table"]:
        text = " ".join(
            v for v in (entry.get("category"), entry["item"], entry.get("description")) if v
        )
        role = _rule_role(text)
        if role is None:
            if llm is None:
                llm = structured_llm(RoleResult)
            result: RoleResult = llm.invoke(
                ROLE_PROMPT.format(
                    category=entry.get("category") or "(분류 없음)",
                    item=entry["item"],
                    description=entry.get("description") or "(설명 없음)",
                )
            )
            role = result.role
        assignments.append({"scoring_item": entry["item"], "role": role})
    return {"role_assignments": assignments}
```

`agent/state.py`의 `sections` 줄 바로 위에 필드 1개 추가:

```python
    role_assignments: list[dict]    # [{scoring_item, role}, ...] — role_router_node 산출 (§⑤ 3팀)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_role_router.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/role_router.py agent/tests/test_role_router.py agent/state.py
git commit -m "feat(agent): role_router_node — 배점표 항목을 3팀에 규칙기반 라우팅 (Task 1)"
```

---

### Task 2: `content_writer_node` 역할 파라미터화

**Files:**
- Modify: `agent/nodes/content_writer.py`
- Test: `agent/tests/test_content_writer.py` (기존 테스트 2건은 무수정 통과가 요구사항)

**Interfaces:**
- Consumes: Task 1의 `state["role_assignments"]`(`[{scoring_item, role}]`)와 역할 문자열 `"영업"/"전산"/"예산"`.
- Produces: `content_writer_node(state: dict, role: str | None = None) -> dict`.
  - `role=None`(기존 경로): 지금과 완전히 동일 — 전체 항목, `spec/` 코퍼스, 반환 `{"sections": [...], "revision_count": int}`.
  - `role` 지정(6단계 경로): `role_assignments`에서 자기 팀 항목만 골라 역할별 코퍼스로 작성, 반환은 `{"sections": [...]}`만 (revision_count는 Task 3에서 파이프라인이 관리). 배정 항목이 0건이면 LLM을 만들지 않고 `{"sections": []}`.

- [ ] **Step 1: Write the failing tests**

`agent/tests/test_content_writer.py` 하단에 추가 (기존 2개 테스트는 그대로 둔다):

```python
def _mock_section(mock_structured, content="본문"):
    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 제목"
    mock_result.content = content
    mock_result.sources = ["plan/02"]
    mock_llm.invoke.return_value = mock_result
    mock_structured.return_value = mock_llm
    return mock_llm


def _institution(tmp_path):
    inst = tmp_path / "suwon"
    (inst / "spec").mkdir(parents=True)
    (inst / "plan").mkdir()
    return inst


@patch("agent.nodes.content_writer.structured_llm")
def test_role_writer_only_writes_assigned_items(mock_structured, tmp_path):
    inst = _institution(tmp_path)
    (inst / "plan" / "02_IT디지털기획_사업제안.txt").write_text("IT 제안 내용", encoding="utf-8")
    mock_llm = _mock_section(mock_structured)

    state = {
        "scoring_table": [
            {"category": "사업", "item": "전산 시스템", "score": 10, "description": None},
            {"category": "신용도", "item": "외부평가", "score": 8, "description": None},
        ],
        "role_assignments": [
            {"scoring_item": "전산 시스템", "role": "전산"},
            {"scoring_item": "외부평가", "role": "영업"},
        ],
        "institution_spec_dir": str(inst / "spec"),
    }
    result = content_writer_node(state, role="전산")

    assert [s["scoring_item"] for s in result["sections"]] == ["전산 시스템"]
    assert "revision_count" not in result
    prompt = mock_llm.invoke.call_args[0][0]
    assert "IT 제안 내용" in prompt        # 전산팀 코퍼스 = plan/02
    assert "전산팀" in prompt              # 역할 컨텍스트가 프롬프트에 들어간다


@patch("agent.nodes.content_writer.structured_llm")
def test_role_writer_with_no_assigned_items_skips_llm(mock_structured, tmp_path):
    inst = _institution(tmp_path)
    state = {
        "scoring_table": [{"category": "신용도", "item": "외부평가", "score": 8, "description": None}],
        "role_assignments": [{"scoring_item": "외부평가", "role": "영업"}],
        "institution_spec_dir": str(inst / "spec"),
    }
    result = content_writer_node(state, role="예산")

    assert result == {"sections": []}
    mock_structured.assert_not_called()


@patch("agent.nodes.content_writer.structured_llm")
def test_sales_corpus_is_spec_plus_bank_ideas(mock_structured, tmp_path):
    inst = _institution(tmp_path)
    (inst / "spec" / "01_개요.txt").write_text("기관 개요", encoding="utf-8")
    (inst / "bank_ideas_draft.txt").write_text("은행 아이디어", encoding="utf-8")
    mock_llm = _mock_section(mock_structured)

    state = {
        "scoring_table": [{"category": "기타", "item": "지역 기여", "score": 5, "description": None}],
        "role_assignments": [{"scoring_item": "지역 기여", "role": "영업"}],
        "institution_spec_dir": str(inst / "spec"),
    }
    content_writer_node(state, role="영업")

    prompt = mock_llm.invoke.call_args[0][0]
    assert "기관 개요" in prompt
    assert "은행 아이디어" in prompt


@patch("agent.nodes.content_writer.structured_llm")
def test_missing_role_plan_file_uses_placeholder(mock_structured, tmp_path):
    inst = _institution(tmp_path)  # plan/03 파일을 만들지 않는다
    mock_llm = _mock_section(mock_structured)

    state = {
        "scoring_table": [{"category": "가격", "item": "비용 적정성", "score": 20, "description": None}],
        "role_assignments": [{"scoring_item": "비용 적정성", "role": "예산"}],
        "institution_spec_dir": str(inst / "spec"),
    }
    result = content_writer_node(state, role="예산")

    assert len(result["sections"]) == 1
    prompt = mock_llm.invoke.call_args[0][0]
    assert "03_금전적지원_사업제안.txt 없음" in prompt
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `py -3 -m pytest agent/tests/test_content_writer.py -v`
Expected: 기존 2건 PASS, 신규 4건 FAIL — `TypeError: content_writer_node() got an unexpected keyword argument 'role'`

- [ ] **Step 3: Write the implementation**

`agent/nodes/content_writer.py` 수정. `SECTION_PROMPT`와 `_load_spec_content`는 그대로 두고, 아래를 추가/변경한다:

```python
# 역할별 근거 코퍼스 — 상위 E2E 스펙 §⑤의 표를 그대로 코드화.
# 영업은 spec/ 전체 + bank_ideas_draft.txt, 전산·예산은 plan/ 파일 하나씩.
ROLE_PLAN_FILES = {
    "전산": "plan/02_IT디지털기획_사업제안.txt",
    "예산": "plan/03_금전적지원_사업제안.txt",
}

ROLE_LINE = "당신은 {role}팀 담당자로서 아래 항목의 세부기획을 작성합니다.\n\n"


def _load_role_corpus(institution_spec_dir: str | None, role: str) -> str:
    """역할별 코퍼스 로드. 경로 기준점은 institution_spec_dir(= {기관}/spec)의 부모."""
    if role == "영업":
        parts = [_load_spec_content(institution_spec_dir)]
        if institution_spec_dir and os.path.isdir(institution_spec_dir):
            draft = os.path.join(os.path.dirname(institution_spec_dir), "bank_ideas_draft.txt")
            if os.path.isfile(draft):
                with open(draft, encoding="utf-8") as f:
                    parts.append(f"[bank_ideas_draft.txt]\n{f.read()}")
        return "\n\n".join(parts)

    if not institution_spec_dir or not os.path.isdir(institution_spec_dir):
        return "(spec 자료 없음 — 신규 기관, 조사 결과 미제공)"
    rel = ROLE_PLAN_FILES[role]
    plan_path = os.path.join(os.path.dirname(institution_spec_dir), *rel.split("/"))
    if not os.path.isfile(plan_path):
        return f"({os.path.basename(rel)} 없음 — 해당 분야 기존 제안 미보유)"
    with open(plan_path, encoding="utf-8") as f:
        return f"[{os.path.basename(rel)}]\n{f.read()}"


def content_writer_node(state: dict, role: str | None = None) -> dict:
    scoring_table = state["scoring_table"]

    if role is not None:
        assigned = {
            a["scoring_item"] for a in state.get("role_assignments", []) if a["role"] == role
        }
        scoring_table = [e for e in scoring_table if e["item"] in assigned]
        if not scoring_table:
            return {"sections": []}
        spec_content = _load_role_corpus(state.get("institution_spec_dir"), role)
    else:
        spec_content = _load_spec_content(state.get("institution_spec_dir"))

    coverage_report = state.get("coverage_report", [])
    gap_by_item = {c["scoring_item"]: c["gap_note"] for c in coverage_report if not c["covered"]}

    llm = structured_llm(SectionResult)
    role_line = ROLE_LINE.format(role=role) if role else ""
    sections = []
    for entry in scoring_table:
        gap_context = ""
        if entry["item"] in gap_by_item:
            gap_context = f"이전 시도에서 누락된 점: {gap_by_item[entry['item']]}"

        result: SectionResult = llm.invoke(
            role_line
            + SECTION_PROMPT.format(
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

    if role is not None:
        return {"sections": sections}
    return {
        "sections": sections,
        "revision_count": state.get("revision_count", 0) + (1 if coverage_report else 0),
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_content_writer.py -v`
Expected: 6 passed (기존 2 + 신규 4)

- [ ] **Step 5: Commit**

```bash
git add agent/nodes/content_writer.py agent/tests/test_content_writer.py
git commit -m "feat(agent): content_writer 역할 파라미터화 — 팀별 코퍼스·항목 필터 (Task 2)"
```

---

### Task 3: 파이프라인 배선 — 라우팅 → 3팀 작성 → 병합 → 검증 1회

**Files:**
- Modify: `agent/pipeline.py`
- Test: `agent/tests/test_pipeline.py` (기존 테스트의 기대치 갱신 + 신규 1건)

**Interfaces:**
- Consumes: Task 1의 `role_router_node`·`ROLES`, Task 2의 `content_writer_node(state, role=...)`.
- Produces: `run_pipeline(...)` 시그니처 불변. 동작 변경: `institution_match_node` 다음에 `role_router_node`가 1회 실행되고, 수정 루프의 매 회차에 3팀 writer가 순차 실행돼 `sections`가 배점표 원순서로 병합되며, `revision_count`는 파이프라인이 계산한다(첫 회차 0, 재시도마다 +1 — 기존 의미 동일).

- [ ] **Step 1: Update existing tests + write the new failing test**

`agent/tests/test_pipeline.py` 전체를 아래로 교체한다. (변경점: 모든 테스트에 `role_router_node` patch 추가, writer가 회차당 3회 호출되는 기대치, retries 테스트의 `side_effect` 리스트 → 고정 반환 + `revision_count`는 파이프라인 계산 검증, 병합 순서 신규 테스트.)

```python
from unittest.mock import patch

from agent.pipeline import run_pipeline


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_stops_when_fully_covered(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong")

    # 3팀 writer가 한 회차에 각 1회씩 = 3회, verification은 병합본에 1회
    assert mock_router.call_count == 1
    assert mock_write.call_count == 3
    assert mock_verify.call_count == 1
    assert result["revision_count"] == 0
    assert result["pptx_path"] == "report_new/dobong/dobong_제안서.pptx"


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_retries_up_to_max_then_stops(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "text"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": False, "gap_note": "부족"}]}
    mock_build.return_value = {"pptx_path": "report_new/dobong/dobong_제안서.pptx"}

    result = run_pipeline("dobong", max_revisions=3)

    # (최초 1 + 재시도 3) 회차 × 3팀 = 12회
    assert mock_write.call_count == 12
    assert mock_verify.call_count == 4
    # revision_count는 이제 파이프라인이 계산: 재시도 회차(2~4번째)마다 +1
    assert result["revision_count"] == 3
    assert result["coverage_report"][0]["covered"] is False


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
def test_pipeline_merges_role_sections_in_scoring_table_order(
    mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build
):
    """3팀 결과는 팀 순서(영업→전산→예산)가 아니라 배점표 원순서로 병합된다."""
    mock_rfp.return_value = {
        "scoring_table": [{"item": "비용 적정성"}, {"item": "지역 기여"}],
        "rfp_text": "text",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [
        {"scoring_item": "비용 적정성", "role": "예산"},
        {"scoring_item": "지역 기여", "role": "영업"},
    ]}

    def write(state, role=None):
        by_role = {
            "영업": [{"scoring_item": "지역 기여"}],
            "예산": [{"scoring_item": "비용 적정성"}],
        }
        return {"sections": by_role.get(role, [])}

    mock_write.side_effect = write
    mock_verify.return_value = {"coverage_report": [
        {"scoring_item": "비용 적정성", "covered": True, "gap_note": None},
        {"scoring_item": "지역 기여", "covered": True, "gap_note": None},
    ]}
    mock_build.return_value = {"pptx_path": "x.pptx"}

    result = run_pipeline("dobong")

    # 영업팀이 먼저 실행돼도 배점표 순서(비용 적정성 → 지역 기여)로 정렬된다
    assert [s["scoring_item"] for s in result["sections"]] == ["비용 적정성", "지역 기여"]


@patch("agent.pipeline.pptx_builder_node")
@patch("agent.pipeline.verification_node")
@patch("agent.pipeline.content_writer_node")
@patch("agent.pipeline.role_router_node")
@patch("agent.pipeline.institution_match_node")
@patch("agent.pipeline.rfp_analysis_node")
@patch("agent.pipeline.rfp_extract_node")
def _run(mock_extract, mock_rfp, mock_match, mock_router, mock_write, mock_verify, mock_build, **kwargs):
    """3단계 분기만 보기 위한 공통 배선. 반환값은 (추출노드 mock, 결과)."""
    mock_extract.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "추출된 본문"}
    mock_rfp.return_value = {"scoring_table": [{"item": "a"}], "rfp_text": "읽은 본문"}
    mock_match.return_value = {"institution_spec_dir": "corpus/institutions/dobong/spec", "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    mock_write.return_value = {"sections": [{"scoring_item": "a"}]}
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    mock_build.return_value = {"pptx_path": "data/report_new/dobong/dobong_제안서.pptx"}
    return mock_extract, run_pipeline("dobong", **kwargs)


def test_pipeline_extracts_when_artifacts_missing(tmp_path):
    """PDF는 있는데 산출물이 없으면 뽑는다 — 배치로 갓 반입된 기관의 경로."""
    pdf = tmp_path / "공고문.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"), rfp_path=str(pdf))

    assert mock_extract.call_count == 1


def test_pipeline_skips_extract_when_artifacts_exist(tmp_path):
    """사람이 rfp-locate 스킬로 만들어 둔 산출물은 덮지 않는다(이상 PDF의 유일한 경로)."""
    out = tmp_path / "out" / "dobong"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text("{}", encoding="utf-8")
    (out / "rfp_text.txt").write_text("사람이 비전으로 읽은 본문", encoding="utf-8")
    pdf = tmp_path / "공고문.pdf"
    pdf.write_bytes(b"%PDF-1.4")

    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"), rfp_path=str(pdf))

    assert mock_extract.call_count == 0


def test_pipeline_skips_extract_without_rfp_path(tmp_path):
    """PDF가 아직 반입되지 않았으면 추출할 것이 없다 — 기존 동작 그대로."""
    mock_extract, _ = _run(report_new_dir=str(tmp_path / "out"))

    assert mock_extract.call_count == 0
```

- [ ] **Step 2: Run tests to verify the wiring tests fail**

Run: `py -3 -m pytest agent/tests/test_pipeline.py -v`
Expected: `role_router_node` patch 대상이 없어 `AttributeError: <module 'agent.pipeline'> does not have the attribute 'role_router_node'` 로 FAIL

- [ ] **Step 3: Write the implementation**

`agent/pipeline.py`의 import에 한 줄 추가:

```python
from agent.nodes.role_router import ROLES, role_router_node
```

`run_pipeline`의 `institution_match_node` 호출부터 루프까지를 아래로 교체:

```python
    state.update(rfp_analysis_node(state))
    state.update(institution_match_node(state))
    state.update(role_router_node(state))

    # 6단계 3팀 분화 — 상위 스펙 §⑤. 팀별 결과를 배점표 원순서로 병합한 뒤
    # verification은 병합본에 1회만 실행한다. 병렬화는 하지 않는다(단일 GPU
    # 로컬 LLM이라 동시 호출이 직렬화됨 — 스펙 편차 기록은 §⑤ 참조).
    order = {e["item"]: i for i, e in enumerate(state["scoring_table"])}
    attempt = 0
    while True:
        sections: list[dict] = []
        for role in ROLES:
            sections.extend(content_writer_node(state, role=role)["sections"])
        sections.sort(key=lambda s: order.get(s["scoring_item"], len(order)))
        state["revision_count"] = state.get("revision_count", 0) + (
            1 if state.get("coverage_report") else 0
        )
        state["sections"] = sections
        state.update(verification_node(state))
        attempt += 1

        all_covered = all(c["covered"] for c in state["coverage_report"])
        if all_covered or attempt > max_revisions:
            break
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `py -3 -m pytest agent/tests/test_pipeline.py -v`
Expected: 6 passed

- [ ] **Step 5: Run the full agent suite**

Run: `py -3 -m pytest agent -q`
Expected: 전부 passed (기준선 대비 신규 테스트 수만큼 증가, 실패 0)

- [ ] **Step 6: Commit**

```bash
git add agent/pipeline.py agent/tests/test_pipeline.py
git commit -m "feat(agent): 파이프라인 6단계 3팀 분화 배선 — 라우팅→3팀 작성→병합→검증 1회 (Task 3)"
```

---

### Task 4: 스펙에 구현 완료 + 편차 기록

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md` (§⑤ 끝에 완료 절 추가, §⑦·⑧의 해당 항목 완료 표기)

**Interfaces:**
- Consumes: Task 1~3의 구현 결과(노드·시그니처 이름).
- Produces: 스펙 문서만. 코드 변경 없음.

- [ ] **Step 1: §⑤ 끝(체크포인트 문단 뒤)에 완료 절 추가**

```markdown
**✅ 구현 완료 (2026-07-30)** — `agent/nodes/role_router.py`(`role_router_node`) +
`content_writer_node(state, role=...)` 역할 파라미터화 + `pipeline.py` 배선.
스펙과의 편차 1건: "LangGraph 병렬 분기 + `operator.add` reducer" 대신 **순수 Python
순차 실행 + 리스트 병합**으로 구현했다. 이유: ① `agent/pipeline.py`는 LangGraph 없이
구현된 순차 함수이고 `requirements.txt`에도 langgraph가 없다(폐쇄망 의존성 최소화)
② 병렬화의 실익이 없다 — LLM 엔드포인트가 단일 GPU 로컬 서빙이라 동시 호출이
직렬화된다. reducer가 보장하려던 동작(병렬 결과 자동 병합·별도 merge 노드 불필요·
verification 1회)은 파이프라인의 리스트 병합(배점표 원순서 정렬)으로 동일하게 달성된다.
```

- [ ] **Step 2: §⑦ 두 줄 갱신**

- `**agent/state.py**` 항목 끝에 ` — **✅ 완료(2026-07-30)**: `role_assignments` 추가. reducer는 §⑤ 편차 기록대로 미적용(파이프라인이 병합).` 추가.
- `**agent/nodes/content_writer.py**`·`**agent/pipeline.py**` 항목 끝에 각각 ` **✅ 완료(2026-07-30)**` 표기 (pipeline 항목의 "남은 것은 `role_router_node`뿐."을 "`role_router_node`도 완료 — 남은 것 없음."으로 교체).

- [ ] **Step 3: §⑧ sub-project 4 줄에 완료 표기**

`4. **6단계 3팀 분화**: ...` 줄 끝에 ` — **✅ 완료(2026-07-30)**` 추가.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-26-e2e-bid-workflow-system-design.md
git commit -m "docs(spec): §⑤ 3팀 분화 구현 완료 + LangGraph→순수 Python 편차 기록 (Task 4)"
```

---

## Self-Review 결과

- **Spec coverage**: §⑤ 라우팅 규칙(키워드 3+4개, LLM 폴백)=Task 1, 역할별 코퍼스 표=Task 2, 병합+verification 1회=Task 3, 체크포인트 미추가=구현 없음(요구사항이 "하지 않는다"), §⑦ 영향 4파일 중 `llm.py`는 이미 완료(§⑥)라 제외 — 갭 없음.
- **Placeholder scan**: TBD/TODO 없음, 모든 코드 스텝에 실제 코드 포함.
- **Type consistency**: `role_assignments`=`[{scoring_item, role}]`, 역할 문자열 `"영업"/"전산"/"예산"`, `ROLES` 순서 = Task 1 정의를 2·3이 동일 사용. `content_writer_node(state, role=None)` 시그니처 일관.
