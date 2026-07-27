import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path)
    with TestClient(app) as test_client:
        conn = app.state.db_path
        yield test_client, db_path


def _seed_institution(db_path):
    from backend.db import get_connection

    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.commit()
    conn.close()


def test_create_and_get_bid_case_via_api(client):
    test_client, db_path = client
    _seed_institution(db_path)

    create_resp = test_client.post("/bidcases", json={"institution_id": "mapo"})
    assert create_resp.status_code == 200
    bid_case_id = create_resp.json()["bid_case_id"]

    get_resp = test_client.get(f"/bidcases/{bid_case_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["institution_id"] == "mapo"
    assert get_resp.json()["tasks"] == []


def test_get_bid_case_404_when_missing(client):
    test_client, _ = client
    resp = test_client.get("/bidcases/bc-missing")
    assert resp.status_code == 404


def test_participation_decisions_full_chain_creates_tasks(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]

    for tier, role, by in [(1, "실무자", "alice"), (2, "팀장", "bob"), (3, "부장", "carol")]:
        resp = test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
        assert resp.status_code == 200

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["participation_status"] == "참여확정"
    assert len(detail["tasks"]) == 3


def test_participation_decision_tier_order_violation_is_400(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/participation-decisions",
        json={"tier": 2, "role": "팀장", "by": "bob", "choice": "참여"},
    )
    assert resp.status_code == 400
