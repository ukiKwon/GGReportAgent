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
