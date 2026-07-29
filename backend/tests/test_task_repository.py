import pytest

from backend.bidcase_repository import create_bid_case, submit_participation_decision
from backend.db import init_db
from backend.models import ParticipationDecisionIn
from backend.task_repository import (
    add_message,
    approve_task,
    claim_approver_if_unset,
    claim_assignee_if_unset,
    get_task,
    list_messages,
    submit_task,
    update_draft_content,
)


@pytest.fixture
def task_id(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage, giganlist_dir) "
        "VALUES ('mapo', '마포구', 1, 'giganlist/mapo')"
    )
    conn.commit()
    bid_case = create_bid_case(conn, "mapo")
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role="r", by=by, choice="참여"),
        )
    task = conn.execute(
        "SELECT task_id FROM tasks WHERE bid_case_id = ? AND team = '영업'",
        (bid_case.bid_case_id,),
    ).fetchone()
    yield conn, task["task_id"]
    conn.close()


def test_get_task_returns_task(task_id):
    conn, tid = task_id
    task = get_task(conn, tid)
    assert task.team == "영업"
    assert task.status == "대기"


def test_get_task_returns_none_when_missing(task_id):
    conn, _ = task_id
    assert get_task(conn, "task-missing") is None


def test_claim_assignee_only_claims_when_unset(task_id):
    conn, tid = task_id
    claim_assignee_if_unset(conn, tid, "dave")
    claim_assignee_if_unset(conn, tid, "eve")
    task = get_task(conn, tid)
    assert task.assignee == "dave"
    assert task.status == "작성중"


def test_add_message_and_list_messages(task_id):
    conn, tid = task_id
    add_message(conn, tid, "user", "안녕")
    add_message(conn, tid, "agent", "네 도와드릴게요")
    messages = list_messages(conn, tid)
    assert [m.role for m in messages] == ["user", "agent"]
    assert messages[0].content == "안녕"


def test_update_draft_content(task_id):
    conn, tid = task_id
    update_draft_content(conn, tid, "새 초안")
    assert get_task(conn, tid).draft_content == "새 초안"


def test_submit_and_approve_task(task_id):
    conn, tid = task_id
    submit_task(conn, tid)
    assert get_task(conn, tid).status == "1차완료"

    claim_approver_if_unset(conn, tid, "boss")
    approve_task(conn, tid, approved=True)
    task = get_task(conn, tid)
    assert task.approver == "boss"
    assert task.status == "2차완료"


def test_approve_task_rejected_returns_to_작성중(task_id):
    conn, tid = task_id
    submit_task(conn, tid)
    claim_approver_if_unset(conn, tid, "boss")
    approve_task(conn, tid, approved=False)
    assert get_task(conn, tid).status == "작성중"
