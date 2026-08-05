from unittest.mock import ANY, MagicMock, patch

from agent.llm import DEFAULT_MODEL
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
def test_rfi_agent_runs_analysis_chain_and_reports(mock_rfp, mock_match, mock_router, monkeypatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
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
    # LLM을 쓴 분석 체인의 보고에는 사용 모델이 실린다
    assert recorder.message.call_args.kwargs["model"] == DEFAULT_MODEL


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
def test_draft_team_writes_role_sections_and_records(mock_writer, monkeypatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
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
    # 초안팀은 LLM으로 작성하므로 보고에 사용 모델이 실린다
    assert recorder.message.call_args.kwargs["model"] == DEFAULT_MODEL


def test_draft_team_omits_model_when_no_items_assigned(monkeypatch):
    """리뷰 픽스 — 이 role에 배정된 배점 항목이 0건이면 content_writer_node가
    structured_llm() 호출 전에 sections=[]로 조기 반환한다(content_writer.py:79-81).
    그때는 LLM을 안 썼으므로 보고에 model을 넘기면 안 된다."""
    monkeypatch.delenv("LLM_MODEL", raising=False)
    recorder = MagicMock()
    # role_assignments에 "전산"에 배정된 항목이 없다 — content_writer_node가 실제로
    # sections=[]를 조기 반환하는 경로를 그대로 태운다(mock 없이).
    state = dict(BASE, role="전산", role_assignments=[{"scoring_item": "a", "role": "영업"}],
                 scoring_table=[{"item": "a"}])

    result = draft_team(state, recorder)

    assert result == {"sections": []}
    assert "model" not in recorder.message.call_args.kwargs


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
def test_verifier_adds_pii_findings(mock_verify, monkeypatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}],
                                "llm_used": True}
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[{"item": "a"}],
                 sections=[{"scoring_item": "a", "title": "t", "content": "연락처 010-1234-5678", "sources": []}])

    result = verifier(state, recorder)

    assert result["coverage_report"][0]["covered"] is True
    assert result["pii_findings"] == [{"kind": "휴대폰", "value": "010-****-5678"}]
    recorder.message.assert_called()  # 검사 보고가 기록된다
    # 검증도 LLM(커버리지 판정)을 쓰므로 보고에 사용 모델이 실린다
    assert recorder.message.call_args.kwargs["model"] == DEFAULT_MODEL


@patch("agent.orchestrator.subagents.verification_node")
def test_verifier_omits_model_when_scoring_table_empty(mock_verify):
    """리뷰 픽스와 같은 모양의 구멍 — scoring_table이 비면 verification_node가 순회할
    항목이 없어 LLM을 아예 안 탄다(verification.py). 그때는 model을 넘기면 안 된다."""
    mock_verify.return_value = {"coverage_report": [], "llm_used": False}
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[], sections=[])

    verifier(state, recorder)

    assert "model" not in recorder.message.call_args.kwargs


@patch("agent.orchestrator.subagents.verification_node")
def test_배점표가_있어도_LLM을_안_썼으면_모델명을_안_남긴다(mock_verify):
    """예전엔 `scoring_table이 비었나`로 대신 판단해서 **이 조합을 놓쳤다** —
    배점표는 있는데 매칭되는 섹션이 하나도 없으면 LLM은 한 번도 안 불린다.
    노드가 알려주는 llm_used를 그대로 믿으므로 이제 걸린다."""
    mock_verify.return_value = {
        "coverage_report": [{"scoring_item": "a", "covered": False, "gap_note": "섹션 누락"}],
        "llm_used": False,
    }
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[{"item": "a"}], sections=[])

    verifier(state, recorder)

    assert "model" not in recorder.message.call_args.kwargs


@patch("agent.orchestrator.subagents.verification_node")
def test_llm_used는_그래프_상태로_새어나가지_않는다(mock_verify):
    """OrchestratorState에 없는 키다 — 이 호출 한 번의 사실이지 파이프라인 상태가 아니다."""
    mock_verify.return_value = {"coverage_report": [], "llm_used": True}
    state = dict(BASE, scoring_table=[{"item": "a"}], sections=[])

    result = verifier(state, MagicMock())

    assert "llm_used" not in result


@patch("agent.orchestrator.subagents.verification_node")
def test_verifier_sends_final_approval_notify(mock_verify):
    """F7: verifier 완료 시 인사권자에게 최종결재 대기 알림이 1회 기록된다."""
    mock_verify.return_value = {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}],
                                "llm_used": True}
    recorder = MagicMock()
    state = dict(BASE, scoring_table=[{"item": "a"}],
                 sections=[{"scoring_item": "a", "title": "t", "content": "본문", "sources": []}])

    verifier(state, recorder)

    # 계획 I에서 "인사권자" → "본부장"으로 개명했다(최종 결재자는 본부장급).
    recorder.notify.assert_called_once_with("본부장", "결재요청", ANY)


# ── 디자이너 Task 개설 (계획 H Task 1) ──────────────────────────────────
# 7단계 이관은 지금까지 알림만 보냈다. 디자이너가 받은 것을 열어보고 작업물을 올리려면
# 그 사람 몫의 Task 행이 있어야 한다.

@patch("agent.orchestrator.subagents.pptx_builder_node")
def test_packager가_디자이너_task를_연다(mock_pptx):
    mock_pptx.return_value = {"pptx_path": "x.pptx"}
    recorder = MagicMock()

    packager(dict(BASE, scoring_table=[], sections=[]), recorder)

    recorder.task_open.assert_called_once_with("디자이너")
    recorder.notify.assert_called_once_with("디자이너", "이관", ANY)


@patch("agent.orchestrator.subagents.pptx_builder_node")
def test_task_update가_아니라_task_open을_쓴다(mock_pptx):
    """**packager는 최종반려 때 다시 돈다**(이 모듈 verifier의 F7 주석). task_update는
    status='대기'·progress=0을 덮어쓰므로, 그걸 썼다면 디자이너가 파일을 올려둔 뒤
    최종반려가 나는 순간 작업 상태가 초기화된다. 행만 보장하고 상태는 건드리지 않는다."""
    mock_pptx.return_value = {"pptx_path": "x.pptx"}
    recorder = MagicMock()

    packager(dict(BASE, scoring_table=[], sections=[]), recorder)

    designer_updates = [c for c in recorder.task_update.call_args_list
                        if c.args and c.args[0] == "디자이너"]
    assert designer_updates == []
