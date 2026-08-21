import pytest

from server.db import init_db


def test_init_db_creates_institutions_table(tmp_path):
    db_path = str(tmp_path / "registry.db")
    conn = init_db(db_path)
    cursor = conn.execute("PRAGMA table_info(institutions)")
    columns = {row["name"] for row in cursor.fetchall()}
    assert columns == {
        "institution_id", "name_ko", "region_code", "type",
        "contract_end", "last_bid", "term", "stage",
        "giganlist_dir", "rfp_path", "pptx_path",
    }
    conn.close()


def test_옛_DB에_남은_scoring_table_컬럼이_있어도_읽힌다(tmp_path):
    """2026-08-06에 스키마에서 뺐지만 기존 파일에서는 지우지 않는다(SQLite의 컬럼
    삭제는 테이블 재작성이라 반입된 실데이터를 건드리는 위험이 이득보다 크다).
    `SELECT *`가 그 값을 실어 와도 조회가 깨지면 안 된다."""
    from server.db import get_connection
    from server.repository import get_institution, list_institutions

    db_path = str(tmp_path / "old.db")
    init_db(db_path).close()
    conn = get_connection(db_path)
    conn.execute("ALTER TABLE institutions ADD COLUMN scoring_table TEXT")
    conn.execute("INSERT INTO institutions (institution_id, name_ko, scoring_table)"
                 " VALUES ('nowon', '노원구', '[{\"item\": \"a\"}]')")
    conn.commit()

    assert get_institution(conn, "nowon").name_ko == "노원구"
    assert [i.institution_id for i in list_institutions(conn)] == ["nowon"]
    assert not hasattr(get_institution(conn, "nowon"), "scoring_table")
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


def test_migration_adds_new_columns_to_legacy_db(tmp_path):
    """구버전 registry.db(컬럼 없음)에 붙는지 + 두 번 돌려도 안전한지."""
    import sqlite3

    db_path = str(tmp_path / "legacy.db")
    legacy = sqlite3.connect(db_path)
    legacy.executescript(
        """CREATE TABLE messages (
               message_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL,
               content TEXT NOT NULL, created_at TEXT NOT NULL);
           CREATE TABLE notifications (
               notification_id TEXT PRIMARY KEY, recipient TEXT NOT NULL, kind TEXT NOT NULL,
               institution_id TEXT, task_id TEXT, content TEXT NOT NULL, link TEXT,
               created_at TEXT NOT NULL, read_at TEXT);
           INSERT INTO messages VALUES ('msg-old','t','user','옛날 글','2026-01-01T00:00:00');"""
    )
    legacy.commit(); legacy.close()

    init_db(db_path).close()
    conn = init_db(db_path)          # 두 번째 호출도 깨지지 않아야 한다(멱등)
    msg_cols = {r["name"] for r in conn.execute("PRAGMA table_info(messages)")}
    ntf_cols = {r["name"] for r in conn.execute("PRAGMA table_info(notifications)")}
    assert {"author", "stage"} <= msg_cols
    assert {"stage", "sender"} <= ntf_cols
    # 기존 행은 보존되고 새 컬럼만 NULL이다 — 프런트가 "단계 미상"으로 묶는 근거.
    old = conn.execute("SELECT * FROM messages WHERE message_id='msg-old'").fetchone()
    assert old["content"] == "옛날 글" and old["author"] is None and old["stage"] is None
    conn.close()
