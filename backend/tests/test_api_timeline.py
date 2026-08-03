from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.execute("INSERT INTO tasks (task_id, bid_case_id, team) VALUES ('task-s','bc-1','영업')")
    conn.commit(); conn.close()
    return app


def _rows(tmp_path, messages=(), notifications=()):
    conn = get_connection(str(tmp_path / "r.db"))
    for mid, role, content, author, stage, at in messages:
        conn.execute(
            "INSERT INTO messages (message_id, task_id, role, content, author, stage, created_at)"
            " VALUES (?, 'task-s', ?, ?, ?, ?, ?)", (mid, role, content, author, stage, at))
    for nid, kind, content, stage, at in notifications:
        conn.execute(
            "INSERT INTO notifications (notification_id, recipient, kind, institution_id,"
            " content, stage, created_at) VALUES (?, '영업팀', ?, 'nowon', ?, ?, ?)",
            (nid, kind, content, stage, at))
    conn.commit(); conn.close()


def test_merges_messages_and_notifications_in_time_order(tmp_path):
    app = _app(tmp_path)
    _rows(tmp_path,
          messages=[("m2", "human", "기획 승인 — 김 차장", "김 차장", 6, "2026-08-03T10:00:00"),
                    ("m1", "agent", "영업팀 초안 3건 작성 완료", None, 5, "2026-08-03T09:00:00")],
          notifications=[("n1", "결재요청", "기획승인 대기", 5, "2026-08-03T09:30:00")])

    events = TestClient(app).get("/institutions/nowon/timeline").json()["events"]
    assert [e["kind"] for e in events] == ["message", "notification", "message"]

    first, notif, last = events
    assert (first["stage"], first["team"], first["role"]) == (5, "영업", "agent")
    assert first["task_id"] == "task-s"
    # 알림은 팀이 없고 kind가 role 자리에 들어간다 — 화면이 같은 줄 형식으로 그린다.
    assert (notif["stage"], notif["team"], notif["role"]) == (5, None, "결재요청")
    assert notif["task_id"] is None
    assert (last["stage"], last["author"]) == (6, "김 차장")


def test_legacy_rows_without_stage_are_kept_as_null(tmp_path):
    """stage 컬럼이 붙기 전에 쌓인 행도 버리지 않는다 — 화면이 '단계 미상'으로 묶는다."""
    app = _app(tmp_path)
    _rows(tmp_path, messages=[("m0", "user", "옛날 글", None, None, "2026-01-01T00:00:00")])

    events = TestClient(app).get("/institutions/nowon/timeline").json()["events"]
    assert len(events) == 1 and events[0]["stage"] is None


def test_empty_timeline_is_200(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.get("/institutions/nowon/timeline").json() == {"events": []}


def test_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.get("/institutions/ghost/timeline").status_code == 404
