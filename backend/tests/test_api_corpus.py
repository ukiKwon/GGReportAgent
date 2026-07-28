import pytest
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path, output_root=str(tmp_path / "out"))
    with TestClient(app) as test_client:
        yield test_client, db_path


def _seed(db_path, institution_id="newinst"):
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES (?, '신규기관', 1)",
        (institution_id,),
    )
    conn.commit()
    conn.close()


def test_validate_reports_ok_for_existing_corpus(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post(
        "/institutions/newinst/corpus/validate", json={"path": "giganlist/dobong"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["errors"] == []


def test_validate_does_not_change_state(client):
    test_client, db_path = client
    _seed(db_path)
    test_client.post("/institutions/newinst/corpus/validate", json={"path": "giganlist/dobong"})
    detail = test_client.get("/institutions/newinst").json()
    assert detail["giganlist_dir"] is None


def test_register_rejects_absolute_path(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": "C:/windows"})
    assert resp.status_code == 400


def test_register_rejects_parent_traversal(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/../.."})
    assert resp.status_code == 400


def test_register_404_for_unknown_institution(client):
    test_client, _ = client
    resp = test_client.post("/institutions/nope/corpus", json={"path": "giganlist/dobong"})
    assert resp.status_code == 404


def test_register_422_when_validation_fails(client, tmp_path):
    test_client, db_path = client
    _seed(db_path)
    broken = tmp_path / "broken"
    (broken / "spec").mkdir(parents=True)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": str(broken)})
    assert resp.status_code in (400, 422)
    assert test_client.get("/institutions/newinst").json()["giganlist_dir"] is None


def test_register_sets_dir_and_activates_pending_bid_case(client):
    test_client, db_path = client
    _seed(db_path)
    bid_case_id = test_client.post(
        "/bidcases", json={"institution_id": "newinst"}
    ).json()["bid_case_id"]
    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
    assert test_client.get(f"/bidcases/{bid_case_id}").json()["tasks"] == []

    resp = test_client.post(
        "/institutions/newinst/corpus", json={"path": "giganlist/dobong"}
    )
    assert resp.status_code == 200
    assert resp.json()["activated_bid_cases"] == [bid_case_id]

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["research_status"] == "완료"
    assert len(detail["tasks"]) == 3


def test_register_is_idempotent(client):
    test_client, db_path = client
    _seed(db_path)
    bid_case_id = test_client.post(
        "/bidcases", json={"institution_id": "newinst"}
    ).json()["bid_case_id"]
    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
    test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/dobong"})
    test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/dobong"})

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert len(detail["tasks"]) == 3
