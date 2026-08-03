"""계정 목록 — 화면 전환기가 쓰는, 실데이터에 실제로 등장하는 신원들 (계획 C2 후속)."""

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path, demo=False, db="r.db"):
    app = create_app(str(tmp_path / db), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"), demo=demo)
    conn = get_connection(str(tmp_path / db))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    for tid, team, assignee in [("t1", "영업", "김 차장"), ("t2", "전산", "권 차장"),
                                ("t3", "취합", None)]:
        conn.execute(
            "INSERT INTO tasks (task_id, bid_case_id, team, assignee) VALUES (?,?,?,?)",
            (tid, "bc-1", team, assignee))
    for nid, recipient in [("n1", "영업팀"), ("n2", "디자이너"), ("n3", "김 차장")]:
        conn.execute(
            "INSERT INTO notifications (notification_id, recipient, kind, content, created_at)"
            " VALUES (?,?,'쪽지','x','2026-08-03T00:00:00')", (nid, recipient))
    conn.commit(); conn.close()
    return app


def test_lists_people_from_tasks_and_roles_from_notifications(tmp_path):
    body = TestClient(_app(tmp_path)).get("/accounts").json()

    people = [a for a in body["accounts"] if a["name"]]
    roles = [a for a in body["accounts"] if not a["name"]]
    # 김 차장의 tasks.team은 '영업'이지만 쪽지는 '영업팀' 앞으로 오므로 그쪽으로 맞춘다.
    # 권 차장은 '전산' 앞으로 온 쪽지가 없어 원래 값을 그대로 둔다.
    assert [(a["name"], a["team"]) for a in people] == [("권 차장", "전산"), ("김 차장", "영업팀")]
    # 담당자가 없는 작업(취합)은 계정이 아니고, 사람 이름과 겹치는 수신자도 역할로 중복되지 않는다
    assert [a["team"] for a in roles] == ["디자이너", "영업팀"]


def test_person_team_maps_to_the_name_that_actually_receives_notes(tmp_path):
    """계정 전환의 요점은 그 사람의 쪽지함을 보는 것 — 소속이 수신자와 어긋나면 빈 화면이 된다."""
    app = _app(tmp_path, db="map.db")
    body = TestClient(app).get("/accounts").json()
    kim = [a for a in body["accounts"] if a["name"] == "김 차장"][0]
    assert kim["team"] == "영업팀"        # tasks.team '영업' → 실제 수신자 '영업팀'


def test_demo_flag_tells_the_ui_whether_to_show_the_switcher(tmp_path):
    assert TestClient(_app(tmp_path)).get("/accounts").json()["demo"] is False
    assert TestClient(_app(tmp_path, demo=True, db="demo.db")).get("/accounts").json()["demo"] is True


def test_empty_database_returns_empty_list(tmp_path):
    app = create_app(str(tmp_path / "empty.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    assert TestClient(app).get("/accounts").json() == {"demo": False, "accounts": []}
