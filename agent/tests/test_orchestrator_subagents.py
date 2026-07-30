from unittest.mock import MagicMock, patch

from agent.orchestrator.ports import NullRecorder
from agent.orchestrator.subagents import draft_team, packager, rfi_agent, verifier

BASE = {
    "institution_id": "nowon",
    "institution_name": "노원구",
    "giganlist_dir": "corpus/institutions",
    "report_new_dir": "data/report_new",
    "rfp_path": None,
    "stage": 3,
}


@patch("agent.orchestrator.subagents.role_router_node")
@patch("agent.orchestrator.subagents.institution_match_node")
@patch("agent.orchestrator.subagents.rfp_analysis_node")
def test_rfi_agent_runs_analysis_chain_and_reports(mock_rfp, mock_match, mock_router):
    mock_rfp.return_value = {
        "scoring_table": [{"item": "a"}],
        "requirements": [{"item": "a", "risk_flag": None}],
        "rfp_text": "본문",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "a", "role": "영업"}]}
    recorder = MagicMock()

    result = rfi_agent(dict(BASE), recorder)

    assert result["scoring_table"] == [{"item": "a"}]
    assert result["stage"] == 4
    recorder.set_stage.assert_called_with(4)
    # risk_flag 없음 → 되물음 없음
    recorder.notify.assert_not_called()


@patch("agent.orchestrator.subagents.role_router_node")
@patch("agent.orchestrator.subagents.institution_match_node")
@patch("agent.orchestrator.subagents.rfp_analysis_node")
def test_rfi_agent_risk_triggers_advisory_notify(mock_rfp, mock_match, mock_router):
    mock_rfp.return_value = {
        "scoring_table": [{"item": "출연금"}],
        "requirements": [{"item": "출연금", "risk_flag": "출연금 요구 상향"}],
        "rfp_text": "본문",
    }
    mock_match.return_value = {"institution_spec_dir": None, "archive_pptx_path": None}
    mock_router.return_value = {"role_assignments": [{"scoring_item": "출연금", "role": "예산"}]}
    recorder = MagicMock()

    rfi_agent(dict(BASE), recorder)

    recorder.notify.assert_called_once()
    args = recorder.notify.call_args[0]
    assert args[0] == "영업팀" and args[1] == "되물음"
    assert "출연금" in args[2]


@patch("agent.orchestrator.subagents.content_writer_node")
def test_draft_team_writes_role_sections_and_records(mock_writer):
    mock_writer.return_value = {"sections": [{"scoring_item": "a"}]}
    recorder = MagicMock()
    state = dict(BASE, role="영업", role_assignments=[{"scoring_item": "a", "role": "영업"}],
                 scoring_table=[{"item": "a"}])

    result = draft_team(state, recorder)

    assert result == {"sections": [{"scoring_item": "a"}]}
    mock_writer.assert_called_once()
    assert mock_writer.call_args.kwargs["role"] == "영업"
    recorder.task_update.assert_any_call("영업", "작성중", 10)
    recorder.task_update.assert_any_call("영업", "1차완료", 100)


@patch("agent.nodes.content_writer.structured_llm")
def test_draft_team_includes_revision_note_in_prompt(mock_structured, tmp_path):
    """F1 픽스 — 기획반려 재작성 시 draft_team이 revision_note를 content_writer_node에
    실어 보내고, content_writer가 role 경로에서 그 사유를 프롬프트에 포함해야 한다."""
    inst = tmp_path / "suwon"
    (inst / "spec").mkdir(parents=True)
    (inst / "plan").mkdir()
    (inst / "plan" / "02_IT디지털기획_사업제안.txt").write_text("IT 제안 내용", encoding="utf-8")

    mock_llm = MagicMock()
    mock_result = MagicMock()
    mock_result.title = "1. 제목"
    mock_result.content = "본문"
    mock_result.sources = ["plan/02"]
    mock_llm.invoke.return_value = mock_result
    mock_structured.return_value = mock_llm

    state = dict(
        BASE,
        role="전산",
        role_assignments=[{"scoring_item": "전산 시스템", "role": "전산"}],
        scoring_table=[{"category": "사업", "item": "전산 시스템", "score": 10, "description": None}],
        institution_spec_dir=str(inst / "spec"),
        revision_note="민원 근거 보강",
    )
    recorder = MagicMock()

    draft_team(state, recorder)

    prompt = mock_llm.invoke.call_args[0][0]
    assert "반려 사유" in prompt
    assert "민원 근거 보강" in prompt


@patch("agent.orchestrator.subagents.pptx_builder_node")
def test_packager_orders_sections_by_scoring_table(mock_pptx):
    """F2 픽스 — 팬아웃 완료 순서로 뒤섞인 sections를 scoring_table 원순서로
    정렬해 pptx_builder_node에 넘겨야 한다(미배정 항목은 뒤로)."""
    mock_pptx.return_value = {"pptx_path": "x.pptx"}
    recorder = MagicMock()
    state = dict(
        BASE,
        scoring_table=[{"item": "a"}, {"item": "b"}, {"item": "c"}],
        sections=[
            {"scoring_item": "c", "content": "3"},
            {"scoring_item": "a", "content": "1"},
            {"scoring_item": "unknown", "content": "?"},
            {"scoring_item": "b", "content": "2"},
        ],
    )

    packager(state, recorder)

    passed_state = mock_pptx.call_args[0][0]
    assert [s["scoring_item"] for s in passed_state["sections"]] == ["a", "b", "c", "unknown"]


@patch("agent.orchestrator.subagents.verification_node")
def test_verifier_adds_pii_findings(mock_verify):
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}]}
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[{"item": "a"}],
                 sections=[{"scoring_item": "a", "title": "t", "content": "연락처 010-1234-5678", "sources": []}])

    result = verifier(state, recorder)

    assert result["coverage_report"][0]["covered"] is True
    assert result["pii_findings"] == [{"kind": "휴대폰", "value": "010-****-5678"}]
    recorder.message.assert_called()  # 검사 보고가 기록된다
