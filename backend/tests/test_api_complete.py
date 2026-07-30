from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path, stage):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
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
