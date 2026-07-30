from unittest.mock import MagicMock, patch

from agent.nodes.content_writer import content_writer_node


@patch("agent.nodes.content_writer.structured_llm")
def test_content_writer_produces_one_section_per_scoring_item(mock_structured, tmp_path):
    spec_dir = tmp_path / "spec"
    spec_dir.mkdir()
    (spec_dir / "01_개요.txt").write_text("기관 개요 내용", encoding="utf-8")

    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 신용도 및 재무구조"
    mock_result.content = "본문 내용"
    mock_result.sources = ["spec/01"]
    mock_llm.invoke.return_value = mock_result
    mock_structured.return_value = mock_llm

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


@patch("agent.nodes.content_writer.structured_llm")
def test_content_writer_increments_revision_count_on_reentry(mock_structured, tmp_path):
    spec_dir = tmp_path / "spec"
    spec_dir.mkdir()

    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 신용도"
    mock_result.content = "수정된 내용"
    mock_result.sources = ["spec/01"]
    mock_llm.invoke.return_value = mock_result
    mock_structured.return_value = mock_llm

    state = {
        "scoring_table": [{"category": "신용도", "item": "외부평가", "score": 8, "description": None}],
        "institution_spec_dir": str(spec_dir),
        "institution_name": "수원시",
        "revision_count": 1,
        "coverage_report": [{"scoring_item": "외부평가", "covered": False, "gap_note": "근거 누락"}],
    }
    result = content_writer_node(state)

    assert result["revision_count"] == 2


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
