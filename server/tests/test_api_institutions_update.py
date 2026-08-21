from fastapi.testclient import TestClient

from server.db import get_connection
from server.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, type, contract_end, stage)"
        " VALUES ('dobong', '도봉구', '지자체', '2026-12-31', 2)"
    )
    conn.commit(); conn.close()
    return app


def test_put_partial_update_keeps_unset_fields(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.put("/institutions/dobong", json={"contract_end": "2027-06-30", "term": 4})
    assert r.status_code == 200
    body = r.json()
    assert body["contract_end"] == "2027-06-30"
    assert body["term"] == 4
    assert body["type"] == "지자체"      # 미전송 필드 보존
    assert body["stage"] == 2            # stage는 갱신 대상 아님


def test_put_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.put("/institutions/nope", json={"term": 4}).status_code == 404


def test_put_rejects_stage_and_unknown_fields_silently(tmp_path):
    """stage 같은 워크플로 필드는 이 API로 못 바꾼다(모델에 없음 → 무시)."""
    client = TestClient(_app(tmp_path))
    r = client.put("/institutions/dobong", json={"stage": 9, "term": 3})
    assert r.status_code == 200
    assert r.json()["stage"] == 2
    assert r.json()["term"] == 3
