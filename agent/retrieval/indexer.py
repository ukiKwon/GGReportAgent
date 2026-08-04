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
from collections.abc import Callable, Mapping, Sequence
from pathlib import Path

from agent.retrieval import embedder
from agent.retrieval.chunker import chunk_text
from agent.retrieval.embedder import EmbeddingUnavailableError
from agent.retrieval.parsers import parse_file

# search.py가 indexer.DEFAULT_DB_PATH를 import하므로 반대 방향 import는 순환이 된다.
# 예외 하나 때문에 구조를 뒤집는 대신 여기서 정의하고 search가 재수출한다.


class IndexNotBuiltError(Exception):
    """인덱스 파일·대장이 없다 — 호출부가 폴백(전체 읽기, 503 등)을 결정한다."""

DEFAULT_DB_PATH = "data/corpus_index.db"
DEFAULT_CORPUS_ROOT = "corpus"
# 완료 산출물 아카이브 — `backend/main.py`의 create_app(archive_root=...) 기본값과
# 같은 값이어야 한다. (`backend/orchestrator_service.py`는 접두사 없는
# "report_archive"를 쓴다 — NEXT.md의 M-1로 추적 중인 불일치다.)
DEFAULT_ARCHIVE_ROOT = "data/report_archive"

DOCTYPES = ("spec", "plan", "bank_ideas", "rfp", "report", "inbox", "archive", "other")

# 아카이브 루트에서 색인할 파일(허용목록). `tasks_dump.json`을 넣으면 대화 원문 전체가
# 지식 검색에 섞여 산출물이 잡담에 묻힌다 — 그래서 허용목록이지 차단목록이 아니다.
# (지금은 파서가 .txt/.pptx뿐이라 나머지는 어차피 걸러지지만, 나중에 .json 파서가
#  생기는 순간 tasks_dump가 인덱스를 뒤덮게 되므로 여기서 미리 막는다.)
ARCHIVE_INDEXABLE_NAMES = ("rfp_text.txt", "rfp_scoring.json", "coverage_map.json")
ARCHIVE_LABEL = "archive"

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


def classify(
    rel_parts: tuple[str, ...], root_label: str = DEFAULT_CORPUS_ROOT
) -> tuple[str | None, str]:
    """루트 기준 경로 조각 → (institution_id, doctype).

    아카이브 루트는 `{기관명(한글)}/{날짜}/{파일}` 구조다. 기관명은 `name_ko`라서
    `institution_id`(슬러그)가 아니다 — 되짚으려면 레지스트리가 필요한데 `agent/`는
    `backend/`를 import하지 않는다. 그래서 **여기서는 원본 폴더명을 그대로 돌려주고**,
    슬러그 변환은 매핑을 쥐고 있는 호출부(`index_file`의 `institution_names`)가 한다.
    """
    if root_label == ARCHIVE_LABEL:
        return (rel_parts[0] if len(rel_parts) >= 2 else None), ARCHIVE_LABEL
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


def _archive_indexable(path: Path) -> bool:
    return path.name in ARCHIVE_INDEXABLE_NAMES or path.suffix.lower() == ".pptx"


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
    institution_names: Mapping[str, str] | None = None,
) -> int | None:
    """파일 하나를 청킹해 chunks·files에 넣고 청크 수를 돌려준다.

    **None은 "읽지 못해 건너뜀", 0은 "읽었지만 내용이 없음"** 이다 — 빈 텍스트 파일도
    색인 대상 파일로는 세야 하므로 둘을 구분한다.

    `institution_names`는 아카이브 폴더의 한글 기관명 → `institution_id` 매핑이다.
    없으면 `institution_id`를 비운다 — 한글 이름을 슬러그 자리에 넣으면 기관 필터가
    조용히 어긋난다(다른 곳의 `institution_id`는 전부 슬러그다).
    """
    if root_label == ARCHIVE_LABEL and not _archive_indexable(path):
        return None

    text = parse_file(path)
    if text is None:
        if path.suffix.lower() in (".txt",):
            print(f"[건너뜀] UTF-8 아님: {path}", file=sys.stderr)
        return None

    rel = path.relative_to(root)
    institution_id, doctype = classify(rel.parts, root_label)
    if root_label == ARCHIVE_LABEL:
        institution_id = (institution_names or {}).get(institution_id or "")
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


def reindex(
    roots: Sequence[tuple[str | os.PathLike, str]],
    db_path: str | os.PathLike = DEFAULT_DB_PATH,
    *,
    embed: bool = True,
    force: bool = False,
    batch_size: int = embedder.DEFAULT_BATCH_SIZE,
    progress: Callable[[int, int], None] | None = None,
    institution_names: Mapping[str, str] | None = None,
) -> dict:
    """변경분만 다시 색인한다. `roots`는 `(경로, 라벨)` 목록.

    전체 재빌드가 CPU에서 약 57분이라, 산출물 몇 개 늘었다고 매번 다 돌릴 수 없다.
    §② 17번(완료 후 자동 색인)이 성립하려면 이 함수가 선행 조건이다.

    **제자리 갱신이라 `os.replace` 원자 교체를 쓰지 않는다** — 대신 한 트랜잭션으로
    묶어 중간 상태가 다른 연결에 보이지 않게 한다.

    **넘기지 않은 루트는 건드리지 않는다.** 완료 처리 후에는 그 기관 아카이브만
    훑는데, 그때 `corpus/` 파일이 통째로 "삭제됨"으로 판정되면 인덱스가 날아간다.

    변경 판정은 **mtime+size**다. 코퍼스가 수천 개라 전량 해시는 그 자체로 느리고,
    여기서 잡으려는 것은 "산출물이 새로 떨어졌다"이지 위변조가 아니다. 그래도
    미심쩍으면 `force=True`로 대장을 무시하고 다시 넣는다.

    `embed`의 기본값이 켜짐인 것은 `build_index`와 반대인데, 이 함수는 다른 테스트가
    암묵적으로 부르는 일이 없는 **명시적 유지보수 동작**이기 때문이다.
    """
    db_path = Path(db_path)
    if not db_path.is_file():
        raise IndexNotBuiltError(
            f"인덱스가 없습니다: {db_path} — 'py -3.14 -m agent.retrieval build'로 먼저 생성하세요"
        )

    conn = sqlite3.connect(db_path)
    added = updated = removed = 0
    chunk_count = 0
    embedded = 0
    try:
        if not _has_table(conn, "files"):
            raise IndexNotBuiltError(
                f"이 인덱스에는 파일 대장이 없습니다({db_path}) — 계획 F 이전에 만들어져"
                " 무엇이 변했는지 알 길이 없습니다."
                " 'py -3.14 -m agent.retrieval build'로 전체 재빌드하세요."
            )

        for raw_root, label in roots:
            root = Path(raw_root)
            if not root.is_dir():
                # 아직 아카이브가 생기지 않은 새 설치 등 — 없는 루트를 "전부 삭제됨"
                # 으로 읽으면 멀쩡한 인덱스를 지운다.
                continue

            known = {
                row[0]: (row[1], row[2])
                for row in conn.execute(
                    "SELECT path, mtime, size FROM files WHERE root = ?", (label,)
                ).fetchall()
            }
            seen: set[str] = set()

            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                stored_path = f"{root.name}/{path.relative_to(root).as_posix()}"
                seen.add(stored_path)
                previous = known.get(stored_path)
                stat = path.stat()
                if previous is not None and not force:
                    if previous[0] == stat.st_mtime and previous[1] == stat.st_size:
                        continue
                if previous is not None:
                    _drop_path(conn, stored_path)
                count = index_file(conn, path, root, label, institution_names)
                if count is None:
                    seen.discard(stored_path)
                    continue
                chunk_count += count
                if previous is None:
                    added += 1
                else:
                    updated += 1

            for stored_path in known.keys() - seen:
                _drop_path(conn, stored_path)
                removed += 1

        if embed:
            try:
                embedded = _embed_chunks(conn, batch_size, progress)
            except EmbeddingUnavailableError as exc:
                print(f"\n[경고] 임베딩을 건너뜁니다: {exc}", file=sys.stderr)
        conn.commit()
    finally:
        conn.close()

    return {
        "added": added,
        "updated": updated,
        "removed": removed,
        "chunks": chunk_count,
        "embedded": embedded,
    }


def _drop_path(conn: sqlite3.Connection, stored_path: str) -> None:
    """한 파일의 청크·벡터·대장을 함께 지운다.

    셋 중 하나라도 빠뜨리면 조용한 고장이 된다 — 벡터만 남으면 검색이 **사라진
    문서를 계속 돌려주고**, 대장만 남으면 다음 재색인이 "변한 게 없다"고 판단한다.
    """
    ids = [
        row[0]
        for row in conn.execute("SELECT rowid FROM chunks WHERE path = ?", (stored_path,))
    ]
    if ids:
        placeholders = ",".join("?" * len(ids))
        conn.execute(f"DELETE FROM vectors WHERE rowid IN ({placeholders})", ids)
        conn.execute("DELETE FROM chunks WHERE path = ?", (stored_path,))
    conn.execute("DELETE FROM files WHERE path = ?", (stored_path,))


def _has_table(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None
