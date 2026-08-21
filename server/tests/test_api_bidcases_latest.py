"""기관별 최신 공고 — 지도가 전체 기관의 입찰일을 bid_case 기준으로 그리는 데 쓴다."""

from fastapi.testclient import TestClient

from server.db import get_connection
from server.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    for iid, name in [("dobong", "도봉구"), ("nowon", "노원구"), ("gwangjin", "광진구")]:
        conn.execute(
            "INSERT INTO institutions (institution_id, name_ko, stage) VALUES (?,?,1)", (iid, name))
    # 도봉구는 공고가 2건 — 나중 것(rowid 큼)이 최신이다
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, schedule_confidence,"
                 " expected_date) VALUES ('bc-old','dobong','예상','2026-01-01')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, schedule_confidence,"
                 " confirmed_date, participation_status)"
                 " VALUES ('bc-new','dobong','확정','2026-09-30','검토중')")
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id, schedule_confidence,"
                 " expected_date) VALUES ('bc-nowon','nowon','예상','2026-11-11')")
    conn.commit(); conn.close()
    return app


def test_returns_latest_bid_case_per_institution(tmp_path):
    body = TestClient(_app(tmp_path)).get("/bidcases/latest").json()
    by_inst = {b["institution_id"]: b for b in body}

    assert set(by_inst) == {"dobong", "nowon"}      # 공고가 없는 광진구는 빠진다
    assert by_inst["dobong"]["bid_case_id"] == "bc-new"
    assert by_inst["dobong"]["confirmed_date"] == "2026-09-30"
    assert by_inst["dobong"]["participation_status"] == "검토중"
    assert by_inst["nowon"]["expected_date"] == "2026-11-11"
    assert by_inst["nowon"]["confirmed_date"] is None


def test_includes_participation_decision_for_the_approval_card(tmp_path):
    """워크플로 탭의 참여 결정 카드가 몇 차까지 결재됐는지 알아야 한다."""
    app = _app(tmp_path)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute(
        "UPDATE bid_cases SET participation_decision = ? WHERE bid_case_id = 'bc-new'",
        ('[{"tier":1,"role":"영업팀","by":"김 차장","at":"2026-08-03T00:00:00",'
         '"choice":"참여","comment":null}]',))
    conn.commit(); conn.close()

    body = TestClient(app).get("/bidcases/latest").json()
    dobong = [b for b in body if b["institution_id"] == "dobong"][0]
    assert [d["tier"] for d in dobong["participation_decision"]] == [1]
    assert dobong["participation_decision"][0]["by"] == "김 차장"


def test_latest_is_not_swallowed_by_the_bid_case_id_route(tmp_path):
    """`/{bid_case_id}` 가 먼저 잡으면 'latest'라는 id를 찾다가 404가 난다."""
    assert TestClient(_app(tmp_path)).get("/bidcases/latest").status_code == 200


def test_empty_database_returns_empty_list(tmp_path):
    app = create_app(str(tmp_path / "e.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    assert TestClient(app).get("/bidcases/latest").json() == []
