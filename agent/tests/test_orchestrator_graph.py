from unittest.mock import MagicMock, patch

from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command

from agent.orchestrator.graph import build_workflow_graph
from agent.orchestrator.ports import NullRecorder

BASE_INPUT = {
    "institution_id": "nowon",
    "institution_name": "노원구",
    "giganlist_dir": "corpus/institutions",
    "report_new_dir": "data/report_new",
    "rfp_path": None,
    "stage": 2,
}
CFG = {"configurable": {"thread_id": "nowon"}}


def _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify):
    mock_rfi.side_effect = lambda s, r: {
        "scoring_table": [{"item": "a"}],
        "requirements": [],
        "role_assignments": [{"scoring_item": "a", "role": "영업"}],
        "stage": 4,
    }
    mock_draft.side_effect = lambda s, r: {"sections": [{"scoring_item": "a", "content": "x"}]}
    mock_pack.side_effect = lambda s, r: {"pptx_path": "x.pptx"}
    mock_verify.side_effect = lambda s, r: {
        "coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}],
        "pii_findings": [],
    }


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_full_run_pauses_at_three_gates_then_finishes(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)                       # → 🛑 기획승인
    state = graph.get_state(CFG)
    assert state.next == ("gate_plan",) or state.tasks[0].interrupts  # 기획승인 대기

    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)  # → 🛑 이관결재
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)  # → 🛑 최종결재
    result = graph.invoke(Command(resume={"approved": True, "by": "인사권자", "comment": None}), CFG)

    assert result["stage"] == 9
    assert mock_pack.call_count == 1
    assert mock_verify.call_count == 1
    # 3팀 팬아웃: draft_team이 역할 수(3)만큼 호출
    assert mock_draft.call_count == 3


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_plan_rejection_reruns_drafts_with_note(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)
    graph.invoke(Command(resume={"approved": False, "by": "영업팀", "comment": "민원 근거 보강"}), CFG)

    # 반려 → 초안 3팀 재실행 후 다시 기획승인 대기
    assert mock_draft.call_count == 6
    state = graph.get_state(CFG)
    assert state.values.get("revision_note") == "민원 근거 보강"
    assert state.tasks and state.tasks[0].interrupts  # 다시 게이트에서 대기
    # 리뷰 Major 픽스: sections는 구본 3건이 아니라 재작성된 신본 3건만 남아야 한다
    # (operator.add였다면 구3+신3=6건이 누적되어 반려된 슬라이드가 남는다).
    assert len(state.values.get("sections", [])) == 3


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_plan_rejection_then_approval_packager_sees_only_new_sections(
    mock_rfi, mock_draft, mock_pack, mock_verify
):
    """기획반려 후 승인까지 완주 — packager가 받는 sections가 신본 3건뿐이어야 한다
    (구본이 섞여 PPTX에 반려된 슬라이드가 남는 회귀를 막는다)."""
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)
    graph.invoke(Command(resume={"approved": False, "by": "영업팀", "comment": "민원 근거 보강"}), CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    result = graph.invoke(Command(resume={"approved": True, "by": "인사권자", "comment": None}), CFG)

    assert result["stage"] == 9
    assert mock_draft.call_count == 6  # 반려 3 + 재작성 3
    assert mock_pack.call_count == 1
    packager_input_sections = mock_pack.call_args[0][0]["sections"]
    assert len(packager_input_sections) == 3
    pii_scan_sections = mock_verify.call_args[0][0]["sections"]
    assert len(pii_scan_sections) == 3


@patch("agent.orchestrator.graph.verifier")
@patch("agent.orchestrator.graph.packager")
@patch("agent.orchestrator.graph.draft_team")
@patch("agent.orchestrator.graph.rfi_agent")
def test_final_rejection_reruns_packager_and_verifier(mock_rfi, mock_draft, mock_pack, mock_verify):
    _mock_nodes(mock_rfi, mock_draft, mock_pack, mock_verify)
    graph = build_workflow_graph(NullRecorder(), MemorySaver())

    graph.invoke(BASE_INPUT, CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    graph.invoke(Command(resume={"approved": True, "by": "영업팀", "comment": None}), CFG)
    graph.invoke(Command(resume={"approved": False, "by": "인사권자", "comment": "표지 수정"}), CFG)

    # 최종 반려 → packager·verifier 재실행 후 다시 최종결재 대기
    assert mock_pack.call_count == 2
    assert mock_verify.call_count == 2
    state = graph.get_state(CFG)
    assert state.tasks and state.tasks[0].interrupts
