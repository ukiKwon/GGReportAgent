import pytest

from backend.bidcase_repository import (
    ParticipationDecisionError,
    TEAMS,
    create_bid_case,
    get_bid_case,
    list_bid_cases_for_assignee,
    list_task_summaries,
    submit_participation_decision,
)
from backend.db import init_db
from backend.models import ParticipationDecisionIn


@pytest.fixture
def conn(tmp_path):
    db_path = str(tmp_path / "test.db")
    connection = init_db(db_path)
    connection.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage, giganlist_dir) "
        "VALUES ('mapo', '마포구', 1, 'corpus/institutions/mapo')"
    )
    connection.commit()
    yield connection
    connection.close()


def test_create_and_get_bid_case(conn):
    bid_case = create_bid_case(conn, "mapo")
    assert bid_case.institution_id == "mapo"
    assert bid_case.participation_status == "검토중"
    assert get_bid_case(conn, bid_case.bid_case_id).bid_case_id == bid_case.bid_case_id


def test_get_bid_case_returns_none_when_missing(conn):
    assert get_bid_case(conn, "bc-missing") is None


def test_participation_decision_enforces_tier_order(conn):
    bid_case = create_bid_case(conn, "mapo")
    with pytest.raises(ParticipationDecisionError):
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
        )


def test_participation_decision_non_participate_short_circuits(conn):
    bid_case = create_bid_case(conn, "mapo")
    result = submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=1, role="실무자", by="alice", choice="미참여"),
    )
    assert result.participation_status == "미참여확정"
    assert list_task_summaries(conn, bid_case.bid_case_id) == []

    with pytest.raises(ParticipationDecisionError):
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
        )


def test_participation_decision_all_three_tiers_creates_tasks(conn):
    bid_case = create_bid_case(conn, "mapo")
    submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=1, role="실무자", by="alice", choice="참여"),
    )
    submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=2, role="팀장", by="bob", choice="참여"),
    )
    result = submit_participation_decision(
        conn, bid_case.bid_case_id,
        ParticipationDecisionIn(tier=3, role="부장", by="carol", choice="참여"),
    )

    assert result.participation_status == "참여확정"
    assert len(result.participation_decision) == 3
    summaries = list_task_summaries(conn, bid_case.bid_case_id)
    assert sorted(t.team for t in summaries) == sorted(TEAMS)
    assert all(t.status == "대기" for t in summaries)


def test_list_bid_cases_for_assignee_filters_by_team_and_user(conn):
    bid_case = create_bid_case(conn, "mapo")
    for tier, by in [(1, "alice"), (2, "bob"), (3, "carol")]:
        submit_participation_decision(
            conn, bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role="r", by=by, choice="참여"),
        )
    task = [t for t in list_task_summaries(conn, bid_case.bid_case_id) if t.team == "영업"][0]
    conn.execute("UPDATE tasks SET assignee = 'dave' WHERE task_id = ?", (task.task_id,))
    conn.commit()

    found = list_bid_cases_for_assignee(conn, "영업", "dave")
    assert [b.bid_case_id for b in found] == [bid_case.bid_case_id]
    assert list_bid_cases_for_assignee(conn, "영업", "nobody") == []


def _seed_institution_without_corpus(db_path):
    from backend.db import get_connection

    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('newinst', '신규기관', 1)"
    )
    conn.commit()
    return conn


def test_bid_case_without_corpus_starts_in_대기(tmp_path):
    from backend.bidcase_repository import create_bid_case
    from backend.db import init_db

    db_path = str(tmp_path / "t.db")
    init_db(db_path).close()
    conn = _seed_institution_without_corpus(db_path)
    bid_case = create_bid_case(conn, "newinst")
    assert bid_case.research_status == "대기"
    conn.close()


def test_participation_confirmed_without_corpus_creates_no_tasks(tmp_path):
    from backend.bidcase_repository import (
        create_bid_case,
        list_task_summaries,
        submit_participation_decision,
    )
    from backend.db import init_db
    from backend.models import ParticipationDecisionIn

    db_path = str(tmp_path / "t.db")
    init_db(db_path).close()
    conn = _seed_institution_without_corpus(db_path)
    bid_case = create_bid_case(conn, "newinst")

    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        result = submit_participation_decision(
            conn,
            bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role=role, by=by, choice="참여"),
        )

    assert result.participation_status == "참여확정"
    assert list_task_summaries(conn, bid_case.bid_case_id) == []
    conn.close()
