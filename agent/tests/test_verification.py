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


# ── llm_used — "이 결과를 만든 모델"을 기록할지 정하는 근거 (후속 정리) ──
# 예전엔 호출부가 `scoring_table이 비었나`로 대신 판단했는데, 그건 여기 매칭 규칙을
# 바깥에 복제한 것이라 규칙이 바뀌면 조용히 어긋난다. 노드가 직접 알려준다.

@patch("agent.nodes.verification.get_llm")
def test_섹션이_매칭되면_llm_used가_True다(mock_get_llm):
    mock_get_llm.return_value.with_structured_output.return_value.invoke.return_value = \
        MagicMock(covered=True, gap_note=None)
    result = verification_node({
        "scoring_table": [{"category": "신용도", "item": "외부평가", "score": 8}],
        "sections": [{"scoring_item": "외부평가", "title": "1", "content": "내용"}],
    })
    assert result["llm_used"] is True


@patch("agent.nodes.verification.get_llm")
def test_배점표가_있어도_매칭_섹션이_0건이면_llm_used가_False다(mock_get_llm):
    """이게 예전 판단이 놓치던 조합이다 — 배점표는 있는데 LLM은 한 번도 안 불린다."""
    result = verification_node({
        "scoring_table": [{"category": "신용도", "item": "외부평가", "score": 8}],
        "sections": [{"scoring_item": "엉뚱한항목", "title": "1", "content": "내용"}],
    })
    assert result["llm_used"] is False
    assert mock_get_llm.call_count == 0            # 실제로 안 불렸음을 함께 고정한다
    assert result["coverage_report"][0]["covered"] is False


@patch("agent.nodes.verification.get_llm")
def test_배점표가_비면_llm_used가_False다(mock_get_llm):
    result = verification_node({"scoring_table": [], "sections": []})
    assert result["llm_used"] is False and mock_get_llm.call_count == 0
