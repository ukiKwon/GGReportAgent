import json
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "graph.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team, assignee) VALUES ('task-1','bc-1','전산','it-user')")
    conn.commit(); conn.close()
    return app


@patch("backend.routers.tasks.check_upload")
def test_upload_updates_draft_and_records_check(mock_check, tmp_path):
    mock_check.return_value = {"coverage": [{"scoring_item": "전산 시스템 구축", "covered": True, "gap_note": None}],
                               "pii": [], "skipped": None, "llm_used": True}
    client = TestClient(_app(tmp_path))
    r = client.post("/tasks/task-1/upload", json={"content": "IT 본문"},
                    headers={"X-User-Id": "it-user"})
    assert r.status_code == 200
    assert r.json()["pii_count"] == 0

    conn = get_connection(str(tmp_path / "registry.db"))
    assert conn.execute("SELECT draft_content FROM tasks WHERE task_id='task-1'").fetchone()[0] == "IT 본문"
    msgs = conn.execute("SELECT role, content, model FROM messages WHERE task_id='task-1'").fetchall()
    assert len(msgs) == 1 and msgs[0]["role"] == "agent" and "검사" in msgs[0]["content"]
    # 즉시검사도 LLM(커버리지 판정)을 쓴다 — 그 기록에 모델명이 남아야 워크플로
    # 로그의 🧠 표시가 팀 로그·단계 로그에서 일관된다.
    assert msgs[0]["model"]


@patch("backend.routers.tasks.check_upload")
def test_생략된_검사는_모델명을_남기지_않는다(mock_check, tmp_path):
    """배점표가 없으면 PII 스캔만 돌아 LLM이 한 번도 안 불린다 — 그 기록에 모델명을
    붙이면 '이 모델이 판정했다'는 거짓말이 된다."""
    mock_check.return_value = {"coverage": [], "pii": [], "llm_used": False,
                               "skipped": "배점표 미추출(rfp_scoring.json 없음) — coverage 검사 생략"}
    client = TestClient(_app(tmp_path))
    client.post("/tasks/task-1/upload", json={"content": "본문"},
                headers={"X-User-Id": "it-user"})

    conn = get_connection(str(tmp_path / "registry.db"))
    assert conn.execute("SELECT model FROM messages WHERE task_id='task-1'").fetchone()[0] is None


def test_upload_wrong_user_403_and_missing_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/tasks/task-1/upload", json={"content": "x"},
                       headers={"X-User-Id": "someone-else"}).status_code == 403
    assert client.post("/tasks/nope/upload", json={"content": "x"},
                       headers={"X-User-Id": "u"}).status_code == 404


def _app_unassigned(tmp_path):
    app = create_app(str(tmp_path / "registry.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "graph.db"))
    conn = get_connection(str(tmp_path / "registry.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('task-1','bc-1','전산')")
    conn.commit(); conn.close()
    return app


@patch("backend.routers.tasks.check_upload")
def test_upload_to_unassigned_task_claims_assignee(mock_check, tmp_path):
    """I-3 회귀: assignee가 NULL인(오케스트레이터가 만든) task는 /messages와 동일하게
    첫 업로드가 담당을 선점해야 한다 — 무조건 403이면 안 된다."""
    mock_check.return_value = {"coverage": [], "pii": [], "skipped": "배점표 미추출",
                               "llm_used": False}
    client = TestClient(_app_unassigned(tmp_path))

    r = client.post("/tasks/task-1/upload", json={"content": "IT 본문"},
                    headers={"X-User-Id": "it-user"})
    assert r.status_code == 200

    conn = get_connection(str(tmp_path / "registry.db"))
    assignee = conn.execute("SELECT assignee FROM tasks WHERE task_id='task-1'").fetchone()[0]
    conn.close()
    assert assignee == "it-user"


@patch("backend.routers.tasks.check_upload")
def test_upload_to_task_already_claimed_by_another_403(mock_check, tmp_path):
    """미배정 task에 다른 사용자가 이미 선점한 뒤라면 여전히 403이어야 한다."""
    mock_check.return_value = {"coverage": [], "pii": [], "skipped": "배점표 미추출",
                               "llm_used": False}
    app = _app_unassigned(tmp_path)
    conn = get_connection(str(tmp_path / "registry.db"))
    from backend.task_repository import claim_assignee_if_unset
    claim_assignee_if_unset(conn, "task-1", "it-user")
    conn.close()

    client = TestClient(app)
    r = client.post("/tasks/task-1/upload", json={"content": "x"},
                    headers={"X-User-Id": "someone-else"})
    assert r.status_code == 403
