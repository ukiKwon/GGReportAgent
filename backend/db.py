import sqlite3

SCHEMA = """
CREATE TABLE IF NOT EXISTS institutions (
    institution_id TEXT PRIMARY KEY,
    name_ko        TEXT NOT NULL,
    region_code    TEXT,
    type           TEXT,
    contract_end   TEXT,
    last_bid       TEXT,
    term           INTEGER,
    stage          INTEGER NOT NULL DEFAULT 1,
    giganlist_dir  TEXT,
    rfp_path       TEXT,
    scoring_table  TEXT,
    pptx_path      TEXT
);

CREATE TABLE IF NOT EXISTS bid_cases (
    bid_case_id            TEXT PRIMARY KEY,
    institution_id         TEXT NOT NULL REFERENCES institutions(institution_id),
    schedule_confidence    TEXT NOT NULL DEFAULT '예상',
    expected_date          TEXT,
    confirmed_date          TEXT,
    last_synced_at         TEXT,
    participation_status   TEXT NOT NULL DEFAULT '검토중',
    participation_decision TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS tasks (
    task_id       TEXT PRIMARY KEY,
    bid_case_id   TEXT NOT NULL REFERENCES bid_cases(bid_case_id),
    team          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT '대기',
    progress_pct  INTEGER NOT NULL DEFAULT 0,
    draft_content TEXT NOT NULL DEFAULT '',
    assignee      TEXT,
    approver      TEXT,
    UNIQUE(bid_case_id, team)
);

CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL REFERENCES tasks(task_id),
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> sqlite3.Connection:
    conn = get_connection(db_path)
    conn.executescript(SCHEMA)
    conn.commit()
    return conn
