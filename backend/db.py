import os
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
    participation_decision TEXT NOT NULL DEFAULT '[]',
    research_status        TEXT NOT NULL DEFAULT '대기',
    finalized_by           TEXT,
    finalized_at           TEXT,
    source_slug            TEXT,
    notice_id              TEXT,
    title                  TEXT,
    notice_url             TEXT
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
    created_at TEXT NOT NULL,
    author     TEXT,                          -- 사람이 쓴 글의 실명(결재자·담당자)
    stage      INTEGER                        -- 기록 당시의 9단계 진행 단계
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id TEXT PRIMARY KEY,
    recipient       TEXT NOT NULL,
    kind            TEXT NOT NULL,          -- 쪽지/되물음/결재요청/이관
    institution_id  TEXT,
    task_id         TEXT,
    content         TEXT NOT NULL,
    link            TEXT,
    created_at      TEXT NOT NULL,
    read_at         TEXT,
    stage           INTEGER,                  -- 기록 당시의 9단계 진행 단계
    sender          TEXT                      -- 사람이 보낸 쪽지만. 시스템 알림은 NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
    chat_message_id TEXT PRIMARY KEY,
    institution_id  TEXT NOT NULL,
    role            TEXT NOT NULL,          -- user/agent
    content         TEXT NOT NULL,
    created_at      TEXT NOT NULL
);
"""

# SCHEMA에 뒤늦게 추가된 bid_cases 컬럼들. CREATE TABLE IF NOT EXISTS는 이미 있는
# 테이블에 컬럼을 붙여주지 않으므로 기존 registry.db에는 따로 넣어야 한다. 예전
# finalized_by 때처럼 DB를 지우고 재시드하는 방식은 이제 못 쓴다 — 반입된 실데이터가
# 들어 있을 수 있기 때문이다.
BID_CASE_MIGRATIONS = {
    # research_status는 이번 작업보다 먼저 추가된 컬럼인데, 당시엔 재시드로 처리해서
    # 그 이전에 만들어진 registry.db에는 아직 없다(이 PC의 파일에서 실제로 확인됨).
    # 그런 DB에 붙으면 create_bid_case의 INSERT가 바로 깨지므로 같이 메운다.
    "research_status": "TEXT NOT NULL DEFAULT '대기'",
    "source_slug": "TEXT",
    "notice_id": "TEXT",
    "title": "TEXT",
    "notice_url": "TEXT",
}

# 단계별 수행 내용 뷰(계획 C1-fix)가 쓰는 컬럼들. 기존 행은 NULL로 남아 "단계 미상"이 된다.
MESSAGE_MIGRATIONS = {"author": "TEXT", "stage": "INTEGER"}
# sender는 사람이 보낸 쪽지에만 있다 — 시스템(에이전트) 알림은 NULL로 남는다(계획 C2).
NOTIFICATION_MIGRATIONS = {"stage": "INTEGER", "sender": "TEXT"}

MIGRATIONS = {
    "bid_cases": BID_CASE_MIGRATIONS,
    "messages": MESSAGE_MIGRATIONS,
    "notifications": NOTIFICATION_MIGRATIONS,
}

# 반입 dedup 키 (collector/SCHEMA.md §④의 유일키). 위 컬럼이 붙은 뒤에야 만들 수
# 있으므로 SCHEMA와 분리한다. SQLite는 NULL을 서로 다른 값으로 취급하므로, 두 컬럼이
# NULL인 기존 수동/seed bid_case가 여러 건 있어도 걸리지 않는다 — 부분 인덱스가
# 필요 없는 이유다.
INDEXES = """
CREATE UNIQUE INDEX IF NOT EXISTS idx_bid_cases_notice
    ON bid_cases(source_slug, notice_id);
"""


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """없는 컬럼만 붙인다(멱등). 두 번 돌려도 안전하고 기존 행은 건드리지 않는다."""
    for table, columns in MIGRATIONS.items():
        existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        for column, sql_type in columns.items():
            if column not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {sql_type}")


def init_db(db_path: str) -> sqlite3.Connection:
    parent = os.path.dirname(db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = get_connection(db_path)
    conn.executescript(SCHEMA)
    _migrate(conn)
    conn.executescript(INDEXES)
    conn.commit()
    return conn
