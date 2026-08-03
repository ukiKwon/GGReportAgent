import time
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(
        str(tmp_path / "registry.db"),
        output_root=str(tmp_path / "report_new"),
        graph_db_path=str(tmp_path / "graph.db"),
    )
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage, rfp_path) VALUES ('nowon','노원구',2,'corpus/rfp/n.pdf')")
    # 참여확정이어야 run이 통과한다 — 참여 결정 없이 워크플로가 도는 상태는 막혀 있다.
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, participation_status)"
                 " VALUES ('bc-1','nowon','참여확정')")
    conn.commit(); conn.close()
    return app


def _wait_for_gate(client, inst, timeout=5.0):
    deadline = time.time() + timeout
    while time.time() < deadline:
        body = client.get(f"/institutions/{inst}/status").json()
        if body["pending_gate"]:
            return body
        time.sleep(0.05)
    raise AssertionError("게이트 대기 상태에 도달하지 못함")


# 그래프의 subagent만 목 — 그래프·게이트·체크포인터는 실물로 돈다
@patch("agent.orchestrator.graph.verifier", lambda s, r: {"coverage_report": [{"scoring_item": "a", "covered": True, "gap_note": None}], "pii_findings": []})
@patch("agent.orchestrator.graph.packager", lambda s, r: {"pptx_path": "x.pptx"})
@patch("agent.orchestrator.graph.draft_team", lambda s, r: {"sections": [{"scoring_item": "a", "content": "x"}]})
@patch("agent.orchestrator.graph.rfi_agent", lambda s, r: {"scoring_table": [{"item": "a"}], "requirements": [], "role_assignments": [{"scoring_item": "a", "role": "영업"}], "stage": 4})
def test_run_then_three_approvals_reach_stage9(tmp_path):
    client = TestClient(_app(tmp_path))

    assert client.post("/institutions/nowon/run").status_code == 202
    body = _wait_for_gate(client, "nowon")
    assert body["pending_gate"] == "기획승인"

    first = True
    for expected_next in ("이관결재", "최종결재"):
        payload = {"approved": True, "comment": None}
        if first:
            payload["by"] = "김영업"  # F10: body.by가 X-User-Id보다 우선
        r = client.post("/institutions/nowon/checkpoint",
                        json=payload,
                        headers={"X-User-Id": "sales-team"})
        assert r.status_code == 202
        assert _wait_for_gate(client, "nowon")["pending_gate"] == expected_next
        first = False

    # F10: 기획승인 결재 메시지에 body.by("김영업")가 쓰여야 한다
    # (그 요청은 X-User-Id "sales-team"도 같이 보냈지만 body.by가 우선한다)
    conn = get_connection(str(tmp_path / "registry.db"))
    rows = conn.execute("SELECT content FROM messages WHERE content LIKE '기획 승인%'").fetchall()
    conn.close()
    assert any("김영업" in r["content"] for r in rows)

    client.post("/institutions/nowon/checkpoint",
                json={"approved": True, "comment": None}, headers={"X-User-Id": "final-approver"})
    deadline = time.time() + 5
    while time.time() < deadline:
        body = client.get("/institutions/nowon/status").json()
        if body["stage"] == 9 and not body["running"]:
            break
        time.sleep(0.05)
    assert body["stage"] == 9
    assert body["pending_gate"] is None
    assert body["failed"] is False


def test_run_allows_manual_artifacts_without_rfp_path(tmp_path):
    """F5: rfp_path가 없어도 사람이 rfp-locate로 만든 산출물이 있으면 실행 가능."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("UPDATE institutions SET rfp_path = NULL WHERE institution_id='nowon'")
    conn.commit(); conn.close()
    out = tmp_path / "report_new" / "노원구"
    out.mkdir(parents=True)
    (out / "rfp_scoring.json").write_text("{}", encoding="utf-8")
    (out / "rfp_text.txt").write_text("수기 반입", encoding="utf-8")

    client = TestClient(app)
    assert client.post("/institutions/nowon/run").status_code == 202


def test_run_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/institutions/nope/run").status_code == 404


def test_checkpoint_without_pending_gate_409(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.post("/institutions/nowon/checkpoint",
                    json={"approved": True, "comment": None}, headers={"X-User-Id": "u"})
    assert r.status_code == 409


@patch("agent.orchestrator.graph.rfi_agent", lambda s, r: (_ for _ in ()).throw(RuntimeError("LLM down")))
def test_graph_failure_marks_not_running_and_keeps_stage(tmp_path):
    client = TestClient(_app(tmp_path))
    client.post("/institutions/nowon/run")
    deadline = time.time() + 5
    while time.time() < deadline:
        body = client.get("/institutions/nowon/status").json()
        if not body["running"]:
            break
        time.sleep(0.05)
    assert body["running"] is False
    assert body["pending_gate"] is None  # 조용히 게이트인 척 하지 않는다
    assert body["failed"] is True  # 폴링 클라이언트가 실패를 알 수 있어야 한다


def test_status_tasks_expose_task_id(tmp_path):
    """프런트가 지시·보고 로그(GET /tasks/{id})를 열려면 task_id가 필요하다."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('task-x','bc-1','영업')")
    conn.commit(); conn.close()

    body = TestClient(app).get("/institutions/nowon/status").json()
    assert body["tasks"][0]["task_id"] == "task-x"


def _app_undecided(tmp_path):
    """참여 결정이 아직 '검토중'인 기관 — 워크플로를 돌릴 수 없어야 한다."""
    app = create_app(
        str(tmp_path / "registry.db"),
        output_root=str(tmp_path / "report_new"),
        graph_db_path=str(tmp_path / "graph.db"),
    )
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage, rfp_path)"
                 " VALUES ('nowon','노원구',2,'corpus/rfp/n.pdf')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.commit(); conn.close()
    return app


def test_run_requires_participation_confirmation(tmp_path):
    """참여확정이 팀 Task를 만들고 그 뒤에 5·6단계가 흐른다 — 순서가 뒤집히면 안 된다."""
    r = TestClient(_app_undecided(tmp_path)).post("/institutions/nowon/run")
    assert r.status_code == 400
    assert "참여" in r.json()["detail"]


def test_run_blocked_when_there_is_no_bid_case_at_all(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage, rfp_path)"
                 " VALUES ('nowon','노원구',2,'corpus/rfp/n.pdf')")
    conn.commit(); conn.close()

    assert TestClient(app).post("/institutions/nowon/run").status_code == 400


def test_run_blocked_after_non_participation(tmp_path):
    app = _app_undecided(tmp_path)
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("UPDATE bid_cases SET participation_status = '미참여확정' WHERE bid_case_id='bc-1'")
    conn.commit(); conn.close()

    assert TestClient(app).post("/institutions/nowon/run").status_code == 400
