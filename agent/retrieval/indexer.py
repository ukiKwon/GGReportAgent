"""corpus/ 전체를 훑어 SQLite FTS5(trigram) 인덱스를 전체 재빌드한다.

증분 갱신은 지원하지 않는다 — {db_path}.tmp에 새로 빌드한 뒤 os.replace로 원자
교체하므로, 빌드 중의 검색 요청은 교체 전 구 인덱스를 계속 본다.
"""

from __future__ import annotations

import datetime
import os
import sqlite3
import sys
from pathlib import Path

from agent.retrieval.chunker import chunk_text
from agent.retrieval.parsers import parse_file

DEFAULT_DB_PATH = "data/corpus_index.db"
DEFAULT_CORPUS_ROOT = "corpus"

DOCTYPES = ("spec", "plan", "bank_ideas", "rfp", "report", "inbox", "other")

SCHEMA = """
CREATE VIRTUAL TABLE chunks USING fts5(
    text,
    path UNINDEXED,
    chunk_no UNINDEXED,
    institution_id UNINDEXED,
    doctype UNINDEXED,
    filename UNINDEXED,
    tokenize = 'trigram'
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""


def classify(rel_parts: tuple[str, ...]) -> tuple[str | None, str]:
    """corpus 루트 기준 경로 조각 → (institution_id, doctype)."""
    if len(rel_parts) >= 2 and rel_parts[0] == "institutions":
        institution_id = rel_parts[1]
        if rel_parts[-1] == "bank_ideas_draft.txt":
            return institution_id, "bank_ideas"
        if "spec" in rel_parts[2:-1]:
            return institution_id, "spec"
        if "plan" in rel_parts[2:-1]:
            return institution_id, "plan"
        return institution_id, "other"
    if rel_parts and rel_parts[0] == "rfp":
        return None, "rfp"
    if rel_parts and rel_parts[0] == "reports":
        return None, "report"
    if rel_parts and rel_parts[0] == "inbox":
        return None, "inbox"
    return None, "other"


def build_index(
    corpus_root: str | os.PathLike = DEFAULT_CORPUS_ROOT,
    db_path: str | os.PathLike = DEFAULT_DB_PATH,
) -> dict:
    """인덱스를 새로 빌드해 원자 교체하고 {"files": n, "chunks": m}을 돌려준다."""
    corpus_root = Path(corpus_root)
    db_path = Path(db_path)
    if not corpus_root.is_dir():
        raise NotADirectoryError(f"코퍼스 루트가 아닙니다: {corpus_root}")

    db_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = db_path.with_name(db_path.name + ".tmp")
    if tmp_path.exists():
        tmp_path.unlink()

    conn = sqlite3.connect(tmp_path)
    file_count = 0
    chunk_count = 0
    try:
        conn.executescript(SCHEMA)
        for path in sorted(corpus_root.rglob("*")):
            if not path.is_file():
                continue
            text = parse_file(path)
            if text is None:
                if path.suffix.lower() in (".txt",):
                    print(f"[건너뜀] UTF-8 아님: {path}", file=sys.stderr)
                continue
            rel = path.relative_to(corpus_root)
            institution_id, doctype = classify(rel.parts)
            stored_path = f"{corpus_root.name}/{rel.as_posix()}"
            for chunk_no, chunk in enumerate(chunk_text(text)):
                conn.execute(
                    "INSERT INTO chunks (text, path, chunk_no, institution_id, doctype, filename)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (chunk, stored_path, chunk_no, institution_id, doctype, path.name),
                )
                chunk_count += 1
            file_count += 1
        conn.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            [
                ("built_at", datetime.datetime.now(datetime.timezone.utc).isoformat()),
                ("corpus_root", str(corpus_root)),
                ("file_count", str(file_count)),
            ],
        )
        conn.commit()
    finally:
        conn.close()

    os.replace(tmp_path, db_path)
    return {"files": file_count, "chunks": chunk_count}
