"""corpus/ 전체를 훑어 SQLite FTS5(trigram) 인덱스 + 임베딩 벡터를 전체 재빌드한다.

`{db_path}.tmp`에 새로 빌드한 뒤 os.replace로 원자 교체하므로, 빌드 중의 검색 요청은
교체 전 구 인덱스를 계속 본다. **임베딩을 켜면 전체 빌드가 CPU에서 약 1시간**이라
(2,763청크 × 1.24초 실측) 이 원자성이 없으면 그동안 검색이 죽는다.

증분 갱신은 `reindex()`(계획 F Task 4)가 담당한다 — 전체가 1시간이라 산출물 몇 개
추가하자고 매번 다 돌릴 수 없다.

**벡터를 같은 DB 파일에 두는 이유**: 원자 교체 한 번으로 FTS와 벡터가 함께 넘어가고,
둘이 서로 어긋난 상태가 존재할 수 없다.
"""

from __future__ import annotations

import datetime
import os
import sqlite3
import sys
import time
from collections.abc import Callable
from pathlib import Path

from agent.retrieval import embedder
from agent.retrieval.chunker import chunk_text
from agent.retrieval.embedder import EmbeddingUnavailableError
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
CREATE TABLE vectors (
    rowid     INTEGER PRIMARY KEY,   -- chunks.rowid와 1:1
    embedding BLOB NOT NULL          -- 리틀엔디언 float32 × embed_dim
);
CREATE TABLE files (
    path  TEXT PRIMARY KEY,          -- chunks.path와 같은 표기
    mtime REAL NOT NULL,
    size  INTEGER NOT NULL,
    root  TEXT NOT NULL              -- 어느 루트에서 왔는지(corpus / archive)
);
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


def _default_progress(done: int, total: int, started: float) -> None:
    """57분짜리 작업을 깜깜한 채로 기다리게 하지 않는다."""
    elapsed = time.monotonic() - started
    remain = (elapsed / done * (total - done)) if done else 0.0
    percent = done * 100 // total if total else 100
    print(
        f"\r[임베딩] {done}/{total} ({percent}%) — 남은 시간 약 {remain / 60:.0f}분",
        end="" if done < total else "\n",
        file=sys.stderr,
        flush=True,
    )


def _embed_chunks(
    conn: sqlite3.Connection,
    batch_size: int,
    progress: Callable[[int, int], None] | None,
) -> int:
    """chunks 전체를 임베딩해 vectors에 채운다. 실패하면 0을 돌려준다(예외 아님)."""
    pending = conn.execute(
        "SELECT c.rowid, c.text FROM chunks c"
        " LEFT JOIN vectors v ON v.rowid = c.rowid WHERE v.rowid IS NULL"
        " ORDER BY c.rowid"
    ).fetchall()
    if not pending:
        return 0

    total = len(pending)
    started = time.monotonic()
    report = progress or (lambda done, tot: _default_progress(done, tot, started))
    dim = _stored_dim(conn)
    done = 0

    for start in range(0, total, batch_size):
        batch = pending[start : start + batch_size]
        vectors = embedder.embed_texts([text for _, text in batch], expected_dim=dim)
        if dim is None:
            # 첫 응답이 차원을 확정한다 — 사람이 손으로 맞추게 하면 틀렸을 때
            # 예외 없이 조용히 이상한 결과만 나온다. 모델명도 여기서 함께 적는다:
            # 뒤에 실패해 중간에 끊겨도 "어느 모델로 만든 벡터인지"는 남아야 한다.
            dim = len(vectors[0])
            conn.executemany(
                "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                [("embed_dim", str(dim)), ("embed_model", embedder.model_name())],
            )
        conn.executemany(
            "INSERT INTO vectors (rowid, embedding) VALUES (?, ?)",
            [(rowid, embedder.to_blob(vec)) for (rowid, _), vec in zip(batch, vectors)],
        )
        done += len(batch)
        report(done, total)

    conn.execute(
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('embedded_at', ?)",
        (datetime.datetime.now(datetime.timezone.utc).isoformat(),),
    )
    return done


def _stored_dim(conn: sqlite3.Connection) -> int | None:
    row = conn.execute("SELECT value FROM meta WHERE key = 'embed_dim'").fetchone()
    return int(row[0]) if row else None


def index_file(
    conn: sqlite3.Connection,
    path: Path,
    root: Path,
    root_label: str,
) -> int | None:
    """파일 하나를 청킹해 chunks·files에 넣고 청크 수를 돌려준다.

    **None은 "읽지 못해 건너뜀", 0은 "읽었지만 내용이 없음"** 이다 — 빈 텍스트 파일도
    색인 대상 파일로는 세야 하므로 둘을 구분한다.
    """
    text = parse_file(path)
    if text is None:
        if path.suffix.lower() in (".txt",):
            print(f"[건너뜀] UTF-8 아님: {path}", file=sys.stderr)
        return None

    rel = path.relative_to(root)
    institution_id, doctype = classify(rel.parts)
    stored_path = f"{root.name}/{rel.as_posix()}"

    count = 0
    for chunk_no, chunk in enumerate(chunk_text(text)):
        conn.execute(
            "INSERT INTO chunks (text, path, chunk_no, institution_id, doctype, filename)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (chunk, stored_path, chunk_no, institution_id, doctype, path.name),
        )
        count += 1

    stat = path.stat()
    conn.execute(
        "INSERT OR REPLACE INTO files (path, mtime, size, root) VALUES (?, ?, ?, ?)",
        (stored_path, stat.st_mtime, stat.st_size, root_label),
    )
    return count


def build_index(
    corpus_root: str | os.PathLike = DEFAULT_CORPUS_ROOT,
    db_path: str | os.PathLike = DEFAULT_DB_PATH,
    *,
    embed: bool = False,
    batch_size: int = embedder.DEFAULT_BATCH_SIZE,
    progress: Callable[[int, int], None] | None = None,
) -> dict:
    """인덱스를 새로 빌드해 원자 교체하고 {"files", "chunks", "embedded"}를 돌려준다.

    `embed`의 기본값이 **꺼짐**인 것은 의도적이다(계획서는 켜짐으로 적었으나 뒤집었다).
    켜져 있으면 인덱스를 만드는 모든 테스트가 실제 임베딩 엔드포인트를 때리게 되는데,
    개발 PC에는 Ollama가 실제로 떠 있어 조용히 수 초씩 잡아먹고 환경에 따라 결과가
    달라진다. 켜는 것은 CLI와 재색인 서비스의 책임이다.
    """
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
    embedded = 0
    try:
        conn.executescript(SCHEMA)
        for path in sorted(corpus_root.rglob("*")):
            if not path.is_file():
                continue
            added = index_file(conn, path, corpus_root, corpus_root.name)
            if added is None:
                continue
            chunk_count += added
            file_count += 1
        conn.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?)",
            [
                ("built_at", datetime.datetime.now(datetime.timezone.utc).isoformat()),
                ("corpus_root", str(corpus_root)),
                ("file_count", str(file_count)),
            ],
        )
        if embed:
            try:
                embedded = _embed_chunks(conn, batch_size, progress)
            except EmbeddingUnavailableError as exc:
                # 인덱스 자체는 살린다 — 폐쇄망에 임베딩 모델이 없다고 해서
                # 검색 기능이 통째로 죽으면 안 된다. FTS 단독으로 계속 쓴다.
                #
                # **여기까지 만든 벡터는 버리지 않는다.** 57분짜리 작업이 41분째에
                # 끊겼다고 처음부터 다시 시키는 건 가혹하다. 남은 청크는 reindex가
                # 벡터 없는 것만 골라 채운다(_embed_chunks의 LEFT JOIN).
                embedded = conn.execute("SELECT COUNT(*) FROM vectors").fetchone()[0]
                print(f"\n[경고] 임베딩을 건너뜁니다: {exc}", file=sys.stderr)
                if embedded:
                    print(
                        f"[경고] {embedded}/{chunk_count}건까지 임베딩됨 —"
                        " 'py -3.14 -m agent.retrieval reindex'로 나머지를 채우세요.",
                        file=sys.stderr,
                    )
        conn.commit()
    finally:
        conn.close()

    os.replace(tmp_path, db_path)
    return {"files": file_count, "chunks": chunk_count, "embedded": embedded}
