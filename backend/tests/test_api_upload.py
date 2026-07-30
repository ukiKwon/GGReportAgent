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
                               "pii": [], "skipped": None}
    client = TestClient(_app(tmp_path))
    r = client.post("/tasks/task-1/upload", json={"content": "IT 본문"},
                    headers={"X-User-Id": "it-user"})
    assert r.status_code == 200
    assert r.json()["pii_count"] == 0

    conn = get_connection(str(tmp_path / "registry.db"))
    assert conn.execute("SELECT draft_content FROM tasks WHERE task_id='task-1'").fetchone()[0] == "IT 본문"
    msgs = conn.execute("SELECT role, content FROM messages WHERE task_id='task-1'").fetchall()
    assert len(msgs) == 1 and msgs[0]["role"] == "agent" and "검사" in msgs[0]["content"]


def test_upload_wrong_user_403_and_missing_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.post("/tasks/task-1/upload", json={"content": "x"},
                       headers={"X-User-Id": "someone-else"}).status_code == 403
    assert client.post("/tasks/nope/upload", json={"content": "x"},
                       headers={"X-User-Id": "u"}).status_code == 404
