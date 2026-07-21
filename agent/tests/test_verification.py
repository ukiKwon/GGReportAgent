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
