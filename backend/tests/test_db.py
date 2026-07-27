import pytest

from backend.db import init_db


def test_init_db_creates_institutions_table(tmp_path):
    db_path = str(tmp_path / "registry.db")
    conn = init_db(db_path)
    cursor = conn.execute("PRAGMA table_info(institutions)")
    columns = {row["name"] for row in cursor.fetchall()}
    assert columns == {
        "institution_id", "name_ko", "region_code", "type",
        "contract_end", "last_bid", "term", "stage",
        "giganlist_dir", "rfp_path", "scoring_table", "pptx_path",
    }
    conn.close()


def test_init_db_creates_bid_case_task_message_tables(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)

    conn.execute(
        """INSERT INTO institutions (institution_id, name_ko, stage)
           VALUES ('mapo', '마포구', 1)"""
    )
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, participation_status,
            participation_decision, last_synced_at)
           VALUES ('bc-1', 'mapo', '예상', '검토중', '[]', '2026-07-28T00:00:00+00:00')"""
    )
    conn.execute(
        """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
           VALUES ('task-1', 'bc-1', '영업', '대기', 0, '')"""
    )
    conn.execute(
        """INSERT INTO messages (message_id, task_id, role, content, created_at)
           VALUES ('msg-1', 'task-1', 'user', '안녕', '2026-07-28T00:00:01+00:00')"""
    )
    conn.commit()

    bid_case = conn.execute("SELECT * FROM bid_cases WHERE bid_case_id = 'bc-1'").fetchone()
    task = conn.execute("SELECT * FROM tasks WHERE task_id = 'task-1'").fetchone()
    message = conn.execute("SELECT * FROM messages WHERE message_id = 'msg-1'").fetchone()

    assert bid_case["institution_id"] == "mapo"
    assert task["team"] == "영업"
    assert message["content"] == "안녕"
    conn.close()


def test_tasks_table_rejects_duplicate_team_per_bid_case(tmp_path):
    import sqlite3

    db_path = str(tmp_path / "test.db")
    conn = init_db(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
    )
    conn.execute(
        """INSERT INTO bid_cases (bid_case_id, institution_id, participation_decision)
           VALUES ('bc-1', 'mapo', '[]')"""
    )
    conn.execute(
        """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
           VALUES ('task-1', 'bc-1', '영업', '대기', 0, '')"""
    )
    conn.commit()

    with pytest.raises(sqlite3.IntegrityError):
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES ('task-2', 'bc-1', '영업', '대기', 0, '')"""
        )
    conn.close()
