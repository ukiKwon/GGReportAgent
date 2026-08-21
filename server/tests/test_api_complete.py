from fastapi.testclient import TestClient

from server.db import get_connection
from server.main import create_app


def _app(tmp_path, stage):
    # index_db_path를 반드시 격리한다 — complete가 계획 F부터 **백그라운드 재색인**을
    # 걸기 때문에, 안 넘기면 기본값 `data/corpus_index.db`(개발자의 실제 검색 인덱스)에
    # 테스트 산출물이 들어간다. 실제로 그렇게 오염된 적이 있다.
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     index_db_path=str(tmp_path / "idx.db"),
                     graph_db_path=str(tmp_path / "g.db"), archive_root=str(tmp_path / "arch"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',?)", (stage,))
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-1','nowon')")
    conn.commit(); conn.close()
    return app


def test_complete_archives_and_marks(tmp_path):
    (tmp_path / "out" / "노원구").mkdir(parents=True)
    (tmp_path / "out" / "노원구" / "rfp_text.txt").write_text("원문", encoding="utf-8")
    client = TestClient(_app(tmp_path, stage=9))

    r = client.post("/institutions/nowon/complete", headers={"X-User-Id": "sales-team"})
    assert r.status_code == 200
    assert "arch" in r.json()["archive_dir"]

    conn = get_connection(str(tmp_path / "r.db"))
    assert conn.execute("SELECT participation_status FROM bid_cases WHERE bid_case_id='bc-1'").fetchone()[0] == "제출완료"


def test_complete_before_stage9_409(tmp_path):
    client = TestClient(_app(tmp_path, stage=6))
    assert client.post("/institutions/nowon/complete", headers={"X-User-Id": "u"}).status_code == 409


def test_complete_scopes_to_latest_bid_case_only(tmp_path):
    """I-2 회귀: 기관에 과거 bid_case(유찰)와 최신 bid_case가 둘 다 있을 때
    complete는 최신 건만 '제출완료'로 바꿔야 한다 — 과거 건 상태는 보존."""
    (tmp_path / "out" / "노원구").mkdir(parents=True)
    (tmp_path / "out" / "노원구" / "rfp_text.txt").write_text("원문", encoding="utf-8")
    app = _app(tmp_path, stage=9)
    conn = get_connection(str(tmp_path / "r.db"))
    # bc-1(과거, 유찰) 이미 있음 — 최신 bc-2 추가
    conn.execute(
        "UPDATE bid_cases SET participation_status = '유찰' WHERE bid_case_id = 'bc-1'"
    )
    conn.execute("INSERT INTO bid_cases (bid_case_id, institution_id) VALUES ('bc-2','nowon')")
    conn.execute(
        "INSERT INTO tasks (task_id, bid_case_id, team, status) VALUES ('task-old','bc-1','영업','대기')"
    )
    conn.execute(
        "INSERT INTO tasks (task_id, bid_case_id, team, status) VALUES ('task-new','bc-2','영업','대기')"
    )
    conn.commit(); conn.close()

    client = TestClient(app)
    r = client.post("/institutions/nowon/complete", headers={"X-User-Id": "sales-team"})
    assert r.status_code == 200

    conn = get_connection(str(tmp_path / "r.db"))
    rows = {row["bid_case_id"]: row["participation_status"]
            for row in conn.execute("SELECT bid_case_id, participation_status FROM bid_cases")}
    conn.close()
    assert rows["bc-1"] == "유찰", "과거 bid_case 상태가 덮어써짐"
    assert rows["bc-2"] == "제출완료"

    import json
    dump_path = None
    for day_dir in (tmp_path / "arch" / "노원구").iterdir():
        dump_path = day_dir / "tasks_dump.json"
    tasks_dump = json.loads(dump_path.read_text(encoding="utf-8"))
    assert [t["task_id"] for t in tasks_dump] == ["task-new"], \
        "tasks_dump에 최신 bid_case 이외의 task가 섞임"
