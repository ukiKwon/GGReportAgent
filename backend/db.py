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
"""


def get_connection(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> sqlite3.Connection:
    conn = get_connection(db_path)
    conn.execute(SCHEMA)
    conn.commit()
    return conn
