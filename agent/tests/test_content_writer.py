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
