"""검색 인터페이스 — 이 시그니처가 교체 가능성의 경계선이다(스펙 §⑤).

후일 임베딩 검색을 도입할 때 search()의 시그니처는 유지하고 구현만 바꾼다.
호출부(backend/agent_adapter, /search API)는 수정하지 않는다.
"""

from __future__ import annotations

import os
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from agent.retrieval.indexer import DEFAULT_DB_PATH

# trigram 토크나이저는 3-gram 단위 매치라 질의가 3자 미만이면 매치 자체가 불가능하다.
MIN_QUERY_CHARS = 3


class IndexNotBuiltError(Exception):
    """인덱스 파일이 없다 — 호출부가 폴백(전체 읽기, 503 등)을 결정한다."""


@dataclass(frozen=True)
class RetrievedChunk:
    path: str
    chunk_no: int
    text: str
    score: float  # bm25 — 낮을수록 좋음(SQLite 관례 그대로)
    institution_id: str | None
    doctype: str
    filename: str


def search(
    query: str,
    *,
    institution_id: str | None = None,
    doctypes: Sequence[str] | None = None,
    filename_prefix: str | None = None,
    limit: int = 8,
    db_path: str | os.PathLike = DEFAULT_DB_PATH,
) -> list[RetrievedChunk]:
    query = query.strip()
    if len(query) < MIN_QUERY_CHARS:
        return []
    if not Path(db_path).is_file():
        raise IndexNotBuiltError(
            f"인덱스가 없습니다: {db_path} — 'py -3.14 -m agent.retrieval build'로 생성하세요"
        )

    # FTS5 질의 문법(따옴표·연산자)과 충돌하지 않게 전체를 문자열 리터럴로 감싼다.
    fts_query = '"' + query.replace('"', '""') + '"'

    sql = (
        "SELECT path, chunk_no, text, bm25(chunks) AS score,"
        " institution_id, doctype, filename"
        " FROM chunks WHERE chunks MATCH ?"
    )
    params: list = [fts_query]
    if institution_id is not None:
        sql += " AND institution_id = ?"
        params.append(institution_id)
    if doctypes:
        sql += f" AND doctype IN ({','.join('?' * len(doctypes))})"
        params.extend(doctypes)
    if filename_prefix is not None:
        sql += " AND filename LIKE ? ESCAPE '\\'"
        params.append(_escape_like(filename_prefix) + "%")
    sql += " ORDER BY bm25(chunks) LIMIT ?"
    params.append(limit)

    conn = sqlite3.connect(db_path)
    try:
        rows = conn.execute(sql, params).fetchall()
    finally:
        conn.close()

    return [
        RetrievedChunk(
            path=row[0],
            chunk_no=row[1],
            text=row[2],
            score=row[3],
            institution_id=row[4],
            doctype=row[5],
            filename=row[6],
        )
        for row in rows
    ]


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
