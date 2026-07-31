"""F4 회귀망 — 실물 subagent 1개를 그래프로 통과시켜 state 채널 유실을 잡는다.

langgraph는 OrchestratorState에 없는 키를 조용히 버린다(A1 최종 리뷰 실측).
draft_team→content_writer 실물 경로가 그래프 채널을 실제로 오가는지 최소 1회 검증.
"""

from unittest.mock import MagicMock, patch

from langgraph.checkpoint.memory import MemorySaver

from agent.orchestrator.graph import build_workflow_graph
from agent.orchestrator.ports import NullRecorder


@patch("agent.nodes.content_writer.structured_llm")
@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.rfi_agent")
def test_real_draft_team_flows_through_graph(mock_rfi, mock_pack, mock_verify, mock_llm, tmp_path):
    # rfi만 목 — draft_team은 실물(content_writer 포함, LLM만 목)
    mock_rfi.side_effect = lambda s, r: {
        "scoring_table": [
            {"category": "기타", "item": "지역 기여", "score": 10, "description": None}],
        "requirements": [],
        "role_assignments": [{"scoring_item": "지역 기여", "role": "영업"}],
        "institution_spec_dir": None,
        "stage": 4,
    }
    section = MagicMock(); section.title = "1. 지역 기여"; section.content = "본문"; section.sources = []
    mock_llm.return_value.invoke.return_value = section
    mock_pack.side_effect = lambda s, r: {"pptx_path": "x.pptx"}
    mock_verify.side_effect = lambda s, r: {
        "coverage_report": [{"scoring_item": "지역 기여", "covered": True, "gap_note": None}],
        "pii_findings": [],
    }

    graph = build_workflow_graph(NullRecorder(), MemorySaver())
    cfg = {"configurable": {"thread_id": "t"}}
    graph.invoke({"institution_id": "t", "institution_name": "테스트구",
                  "giganlist_dir": str(tmp_path), "report_new_dir": str(tmp_path),
                  "rfp_path": None, "stage": 2, "sections": []}, cfg)

    state = graph.get_state(cfg)
    # 실물 draft_team이 만든 section이 그래프 채널에 실제로 실렸다
    assert state.values["sections"][0]["scoring_item"] == "지역 기여"
    assert state.values["sections"][0]["content"] == "본문"
