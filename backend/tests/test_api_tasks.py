import pytest
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


@pytest.fixture
def client_and_task(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path)
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage, giganlist_dir) "
        "VALUES ('mapo', '마포구', 1, 'giganlist/mapo')"
    )
    conn.commit()
    conn.close()

    with TestClient(app) as test_client:
        bid_case_id = test_client.post("/bidcases", json={"institution_id": "mapo"}).json()[
            "bid_case_id"
        ]
        for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
            test_client.post(
                f"/bidcases/{bid_case_id}/participation-decisions",
                json={"tier": tier, "role": "r", "by": by, "choice": "참여"},
            )
        detail = test_client.get(f"/bidcases/{bid_case_id}").json()
        task_id = [t for t in detail["tasks"] if t["team"] == "영업"][0]["task_id"]
        yield test_client, task_id


def test_get_task_detail(client_and_task):
    test_client, task_id = client_and_task
    resp = test_client.get(f"/tasks/{task_id}")
    assert resp.status_code == 200
    assert resp.json()["team"] == "영업"
    assert resp.json()["messages"] == []


def test_submit_requires_matching_assignee(client_and_task):
    test_client, task_id = client_and_task
    resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert resp.status_code == 403


def test_submit_and_approve_flow(client_and_task):
    test_client, task_id = client_and_task

    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    submit_resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert submit_resp.status_code == 200
    assert submit_resp.json()["status"] == "1차완료"

    approve_resp = test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["status"] == "2차완료"
    assert approve_resp.json()["approver"] == "boss"


def test_approve_before_submit_is_409(client_and_task):
    test_client, task_id = client_and_task
    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    resp = test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )
    assert resp.status_code == 409


def test_approve_rejects_second_different_approver(client_and_task):
    test_client, task_id = client_and_task
    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    first = test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )
    assert first.status_code == 200
    assert first.json()["approver"] == "boss"

    # approver is now permanently claimed as "boss" (claim_approver_if_unset only sets
    # it once). A different caller hitting approve should get 403 regardless of the
    # task's current status, since the approver-mismatch check runs before the
    # status check in post_task_approve.
    second = test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "someone-else"}
    )
    assert second.status_code == 403


def test_submit_after_approval_is_409(client_and_task):
    test_client, task_id = client_and_task
    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )

    resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert resp.status_code == 409

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert detail["status"] == "2차완료"


def test_submit_after_reject_still_works(client_and_task):
    test_client, task_id = client_and_task
    from backend.db import get_connection
    from backend.task_repository import claim_assignee_if_unset

    db_path = test_client.app.state.db_path
    conn = get_connection(db_path)
    claim_assignee_if_unset(conn, task_id, "dave")
    conn.close()

    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": False}, headers={"X-User-Id": "boss"}
    )

    resp = test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "1차완료"


from unittest.mock import MagicMock, patch


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_streams_and_persists_reply(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["안녕", "하세요"])

    resp = test_client.post(
        f"/tasks/{task_id}/messages",
        json={"content": "소개 부탁해요"},
        headers={"X-User-Id": "dave"},
    )
    assert resp.status_code == 200
    assert resp.text == "안녕하세요"

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert detail["assignee"] == "dave"
    assert detail["status"] == "작성중"
    assert [m["role"] for m in detail["messages"]] == ["user", "agent"]
    assert detail["draft_content"] == "안녕하세요"


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_rejects_second_assignee(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["ok"])
    test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi"}, headers={"X-User-Id": "dave"}
    )

    resp = test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi again"}, headers={"X-User-Id": "eve"}
    )
    assert resp.status_code == 403


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_after_submit_is_409(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["ok"])

    test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi"}, headers={"X-User-Id": "dave"}
    )
    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})

    resp = test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "one more"}, headers={"X-User-Id": "dave"}
    )
    assert resp.status_code == 409

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert [m["role"] for m in detail["messages"]] == ["user", "agent"]


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_after_approval_is_409(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["ok"])

    test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi"}, headers={"X-User-Id": "dave"}
    )
    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": True}, headers={"X-User-Id": "boss"}
    )

    resp = test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "one more"}, headers={"X-User-Id": "dave"}
    )
    assert resp.status_code == 409

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert detail["status"] == "2차완료"
    assert [m["role"] for m in detail["messages"]] == ["user", "agent"]


@patch("backend.routers.tasks.stream_chat_reply")
def test_post_message_allowed_after_reject(mock_stream, client_and_task):
    test_client, task_id = client_and_task
    mock_stream.return_value = iter(["ok"])

    test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "hi"}, headers={"X-User-Id": "dave"}
    )
    test_client.post(f"/tasks/{task_id}/submit", headers={"X-User-Id": "dave"})
    test_client.post(
        f"/tasks/{task_id}/approve", json={"approved": False}, headers={"X-User-Id": "boss"}
    )

    resp = test_client.post(
        f"/tasks/{task_id}/messages", json={"content": "revise please"}, headers={"X-User-Id": "dave"}
    )
    assert resp.status_code == 200

    detail = test_client.get(f"/tasks/{task_id}").json()
    assert detail["status"] == "작성중"
    assert [m["role"] for m in detail["messages"]] == ["user", "agent", "user", "agent"]
