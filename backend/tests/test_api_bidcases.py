import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path, output_root=str(tmp_path / "out"))
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


def _fully_approve_all_tasks(test_client, bid_case_id):
    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    for task in detail["tasks"]:
        task_id = task["task_id"]
        with patch("backend.routers.tasks.stream_chat_reply", return_value=iter(["ok"])):
            test_client.post(
                f"/tasks/{task_id}/messages", json={"content": "hi"},
                headers={"X-User-Id": "dave"},
            )
        test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
        test_client.post(
            f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
        )


def test_finalize_requires_all_tasks_2차완료(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": True},
        headers={"X-User-Id": "carol"},
    )
    assert resp.status_code == 409


def test_finalize_approved_sets_institution_stage_7(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )
    _fully_approve_all_tasks(test_client, bid_case_id)

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": True},
        headers={"X-User-Id": "carol"},
    )
    assert resp.status_code == 200

    institution = test_client.get("/institutions/mapo").json()
    assert institution["stage"] == 7


def test_finalize_rejected_resets_tasks_to_작성중(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )
    _fully_approve_all_tasks(test_client, bid_case_id)

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": False},
        headers={"X-User-Id": "carol"},
    )
    assert resp.status_code == 200

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert all(t["status"] == "작성중" for t in detail["tasks"])


def _ready_to_finalize(test_client, db_path):
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
        )
    _fully_approve_all_tasks(test_client, bid_case_id)
    return bid_case_id


def test_finalize_requires_x_user_id_header(client):
    test_client, db_path = client
    bid_case_id = _ready_to_finalize(test_client, db_path)

    resp = test_client.post(f"/bidcases/{bid_case_id}/finalize", json={"approved": True})
    assert resp.status_code == 422


def test_finalize_approved_records_finalizer(client):
    test_client, db_path = client
    bid_case_id = _ready_to_finalize(test_client, db_path)

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": True},
        headers={"X-User-Id": "dave"},
    )
    assert resp.status_code == 200
    assert resp.json()["finalized_by"] == "dave"
    assert resp.json()["finalized_at"] is not None

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["finalized_by"] == "dave"
    assert detail["finalized_at"] == resp.json()["finalized_at"]


def test_finalize_rejected_records_finalizer(client):
    test_client, db_path = client
    bid_case_id = _ready_to_finalize(test_client, db_path)

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": False},
        headers={"X-User-Id": "erin"},
    )
    assert resp.status_code == 200
    assert resp.json()["finalized_by"] == "erin"
    assert resp.json()["finalized_at"] is not None


def test_finalize_approved_builds_the_deliverable_pptx(client):
    test_client, db_path = client
    bid_case_id = _ready_to_finalize(test_client, db_path)

    resp = test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": True},
        headers={"X-User-Id": "dave"},
    )
    assert resp.status_code == 200

    pptx_path = test_client.get("/institutions/mapo/artifacts").json()["pptx_path"]
    assert pptx_path is not None
    assert os.path.isfile(pptx_path)


def test_finalize_rejected_does_not_build_a_deliverable(client):
    test_client, db_path = client
    bid_case_id = _ready_to_finalize(test_client, db_path)

    test_client.post(
        f"/bidcases/{bid_case_id}/finalize",
        json={"approved": False},
        headers={"X-User-Id": "erin"},
    )

    assert test_client.get("/institutions/mapo/artifacts").json()["pptx_path"] is None


def test_bid_case_finalized_fields_default_to_none(client):
    test_client, db_path = client
    _seed_institution(db_path)
    bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()["bid_case_id"]

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["finalized_by"] is None
    assert detail["finalized_at"] is None
