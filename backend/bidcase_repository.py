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


def _research_status_for(conn: sqlite3.Connection, institution_id: str) -> str:
    row = conn.execute(
        "SELECT giganlist_dir FROM institutions WHERE institution_id = ?", (institution_id,)
    ).fetchone()
    return "완료" if row and row["giganlist_dir"] else "대기"


def create_bid_case(
    conn: sqlite3.Connection,
    institution_id: str,
    schedule_confidence: str = "예상",
    expected_date: str | None = None,
    confirmed_date: str | None = None,
    commit: bool = True,
) -> BidCase:
    bid_case_id = f"bc-{secrets.token_hex(4)}"
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, last_synced_at, participation_status, participation_decision,
            research_status)
           VALUES (?, ?, ?, ?, ?, ?, '검토중', '[]', ?)""",
        (
            bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, _now(), _research_status_for(conn, institution_id),
        ),
    )
    if commit:
        conn.commit()
    return get_bid_case(conn, bid_case_id)


def schedule_date_from(schedule: dict) -> str | None:
    """공고 일정 4개 중 "입찰이 언제인가"에 해당하는 날짜를 고른다.

    bid_cases의 expected_date/confirmed_date는 입찰 시점을 뜻하므로 제출 마감일
    (deadline_at)이 1순위다. 없으면 contract_end로 폴백하는데, 계약 종료가 곧 다음
    입찰 시점이라는 것이 이 리포의 기존 해석이다(csv_import.HEADER_MAP도 '입찰예상일'을
    contract_end에 매핑한다). 둘 다 없으면 None — 공고는 실재하므로 bid_case는 만든다.
    """
    return schedule.get("deadline_at") or schedule.get("contract_end")


def upsert_bid_case_from_notice(
    conn: sqlite3.Connection,
    institution_id: str,
    source_slug: str,
    record: dict,
    commit: bool = True,
) -> tuple[str, bool]:
    """manifest 레코드 1건을 bid_case에 반영한다. (bid_case_id, 신규여부)를 돌려준다.

    유일키는 (source_slug, notice_id) — 같은 공고를 다시 수집하는 것은 정상이고
    나중 배치가 이긴다(collector/SCHEMA.md §④).
    """
    notice_id = record.get("notice_id")
    title = record.get("title")
    notice_url = (record.get("evidence") or {}).get("url")
    schedule = record.get("schedule") or {}
    confidence = schedule.get("confidence") or "예상"
    date = schedule_date_from(schedule)

    # 확정이면 confirmed_date, 예상이면 expected_date에 넣고 반대쪽은 건드리지 않는다 —
    # 예상이 확정으로 승격될 때 예전 예상값을 지우면 "언제 예상했었나"가 사라진다.
    date_column = "confirmed_date" if confidence == "확정" else "expected_date"

    row = conn.execute(
        "SELECT bid_case_id FROM bid_cases WHERE source_slug = ? AND notice_id = ?",
        (source_slug, notice_id),
    ).fetchone()

    if row:
        bid_case_id = row["bid_case_id"]
        conn.execute(
            f"""UPDATE bid_cases
                SET schedule_confidence = ?, {date_column} = COALESCE(?, {date_column}),
                    title = ?, notice_url = ?, last_synced_at = ?
                WHERE bid_case_id = ?""",
            (confidence, date, title, notice_url, _now(), bid_case_id),
        )
        created = False
    else:
        bid_case = create_bid_case(
            conn,
            institution_id,
            schedule_confidence=confidence,
            expected_date=date if date_column == "expected_date" else None,
            confirmed_date=date if date_column == "confirmed_date" else None,
            commit=False,
        )
        bid_case_id = bid_case.bid_case_id
        conn.execute(
            """UPDATE bid_cases SET source_slug = ?, notice_id = ?, title = ?, notice_url = ?
               WHERE bid_case_id = ?""",
            (source_slug, notice_id, title, notice_url, bid_case_id),
        )
        created = True

    if commit:
        conn.commit()
    return bid_case_id, created


def get_bid_case(conn: sqlite3.Connection, bid_case_id: str) -> BidCase | None:
    cursor = conn.execute("SELECT * FROM bid_cases WHERE bid_case_id = ?", (bid_case_id,))
    row = cursor.fetchone()
    return _row_to_bid_case(row) if row else None


def record_finalization(conn: sqlite3.Connection, bid_case_id: str, finalized_by: str) -> None:
    """Stamp who finalized this bid case and when (audit trail for the confirm/reject action)."""
    conn.execute(
        "UPDATE bid_cases SET finalized_by = ?, finalized_at = ? WHERE bid_case_id = ?",
        (finalized_by, _now(), bid_case_id),
    )
    conn.commit()


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


def list_latest_bid_cases(conn: sqlite3.Connection) -> list[BidCase]:
    """기관마다 최신 공고 1건 — 지도가 전체 기관의 입찰일을 그리는 데 쓴다.

    "최신"의 기준은 `OrchestratorService._latest_bid_case`와 같은 rowid 내림차순이다
    (공고에 신뢰할 만한 시각 컬럼이 없어 삽입 순서를 쓴다). 공고가 없는 기관은 빠진다.
    """
    cursor = conn.execute(
        """SELECT * FROM bid_cases WHERE rowid IN (
               SELECT MAX(rowid) FROM bid_cases GROUP BY institution_id
           ) ORDER BY institution_id"""
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
    if bid_case.research_status == "완료":
        create_tasks_for_bid_case(conn, bid_case_id, commit=False)
    conn.commit()
    return get_bid_case(conn, bid_case_id)


def create_tasks_for_bid_case(
    conn: sqlite3.Connection, bid_case_id: str, commit: bool = True
) -> list[str]:
    """팀별 Task를 만든다. 이미 있는 팀은 건너뛴다(멱등)."""
    existing = {
        row["team"]
        for row in conn.execute("SELECT team FROM tasks WHERE bid_case_id = ?", (bid_case_id,))
    }
    created = []
    for team in TEAMS:
        if team in existing:
            continue
        task_id = f"task-{secrets.token_hex(4)}"
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES (?, ?, ?, '대기', 0, '')""",
            (task_id, bid_case_id, team),
        )
        created.append(task_id)
    if commit:
        conn.commit()
    return created


def activate_pending_bid_cases(
    conn: sqlite3.Connection, institution_id: str, commit: bool = True
) -> list[str]:
    """코퍼스가 반입된 기관에서, 참여확정됐지만 코퍼스 때문에 밀려 있던 BidCase를 푼다."""
    rows = conn.execute(
        """SELECT bid_case_id FROM bid_cases
           WHERE institution_id = ? AND participation_status = '참여확정'
             AND research_status = '대기'""",
        (institution_id,),
    ).fetchall()
    activated = []
    for row in rows:
        bid_case_id = row["bid_case_id"]
        conn.execute(
            "UPDATE bid_cases SET research_status = '완료' WHERE bid_case_id = ?",
            (bid_case_id,),
        )
        create_tasks_for_bid_case(conn, bid_case_id, commit=False)
        activated.append(bid_case_id)
    if commit:
        conn.commit()
    return activated
