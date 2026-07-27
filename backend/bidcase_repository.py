import json
import secrets
import sqlite3
from datetime import datetime, timezone

from backend.models import (
    BidCase,
    ParticipationDecisionEntry,
    ParticipationDecisionIn,
    TaskSummary,
)

TEAMS = ["영업", "IT", "예산"]


class ParticipationDecisionError(ValueError):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_bid_case(row: sqlite3.Row) -> BidCase:
    data = dict(row)
    data["participation_decision"] = json.loads(data["participation_decision"])
    return BidCase(**data)


def create_bid_case(
    conn: sqlite3.Connection,
    institution_id: str,
    schedule_confidence: str = "예상",
    expected_date: str | None = None,
    confirmed_date: str | None = None,
) -> BidCase:
    bid_case_id = f"bc-{secrets.token_hex(4)}"
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, last_synced_at, participation_status, participation_decision)
           VALUES (?, ?, ?, ?, ?, ?, '검토중', '[]')""",
        (bid_case_id, institution_id, schedule_confidence, expected_date, confirmed_date, _now()),
    )
    conn.commit()
    return get_bid_case(conn, bid_case_id)


def get_bid_case(conn: sqlite3.Connection, bid_case_id: str) -> BidCase | None:
    cursor = conn.execute("SELECT * FROM bid_cases WHERE bid_case_id = ?", (bid_case_id,))
    row = cursor.fetchone()
    return _row_to_bid_case(row) if row else None


def list_task_summaries(conn: sqlite3.Connection, bid_case_id: str) -> list[TaskSummary]:
    cursor = conn.execute(
        """SELECT task_id, team, status, progress_pct, assignee, approver
           FROM tasks WHERE bid_case_id = ? ORDER BY team""",
        (bid_case_id,),
    )
    return [TaskSummary(**dict(row)) for row in cursor.fetchall()]


def list_bid_cases_for_assignee(
    conn: sqlite3.Connection, team: str, assignee: str
) -> list[BidCase]:
    cursor = conn.execute(
        """SELECT DISTINCT bc.* FROM bid_cases bc
           JOIN tasks t ON t.bid_case_id = bc.bid_case_id
           WHERE t.team = ? AND t.assignee = ?
           ORDER BY bc.bid_case_id""",
        (team, assignee),
    )
    return [_row_to_bid_case(row) for row in cursor.fetchall()]


def submit_participation_decision(
    conn: sqlite3.Connection, bid_case_id: str, decision: ParticipationDecisionIn
) -> BidCase:
    bid_case = get_bid_case(conn, bid_case_id)
    if bid_case is None:
        raise ParticipationDecisionError(f"bid case not found: {bid_case_id}")
    if bid_case.participation_status != "검토중":
        raise ParticipationDecisionError(
            f"participation already decided: {bid_case.participation_status}"
        )

    expected_tier = len(bid_case.participation_decision) + 1
    if decision.tier != expected_tier:
        raise ParticipationDecisionError(f"expected tier {expected_tier}, got {decision.tier}")

    entry = ParticipationDecisionEntry(
        tier=decision.tier, role=decision.role, by=decision.by, at=_now(),
        choice=decision.choice, comment=decision.comment,
    )
    decisions = bid_case.participation_decision + [entry]
    decisions_json = json.dumps([d.model_dump() for d in decisions], ensure_ascii=False)

    if decision.choice != "참여":
        new_status = "미참여확정" if decision.choice == "미참여" else "보류"
        conn.execute(
            "UPDATE bid_cases SET participation_decision = ?, participation_status = ? "
            "WHERE bid_case_id = ?",
            (decisions_json, new_status, bid_case_id),
        )
        conn.commit()
        return get_bid_case(conn, bid_case_id)

    if decision.tier < 3:
        conn.execute(
            "UPDATE bid_cases SET participation_decision = ? WHERE bid_case_id = ?",
            (decisions_json, bid_case_id),
        )
        conn.commit()
        return get_bid_case(conn, bid_case_id)

    conn.execute(
        "UPDATE bid_cases SET participation_decision = ?, participation_status = '참여확정' "
        "WHERE bid_case_id = ?",
        (decisions_json, bid_case_id),
    )
    for team in TEAMS:
        task_id = f"task-{secrets.token_hex(4)}"
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES (?, ?, ?, '대기', 0, '')""",
            (task_id, bid_case_id, team),
        )
    conn.commit()
    return get_bid_case(conn, bid_case_id)
