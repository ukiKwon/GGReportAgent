"""검색 인터페이스 — 이 시그니처가 교체 가능성의 경계선이다(스펙 §⑤).

원래 주석은 "후일 임베딩 검색을 도입할 때 search()의 시그니처는 유지하고 구현만
바꾼다"였다. 계획 F가 그 "후일"이고, 약속대로 **시그니처는 그대로**다 —
`backend/routers/search.py`와 `backend/agent_adapter.py`는 한 줄도 안 고쳤다.

**두 갈래를 합친다.**

- **FTS(trigram)** — 글자가 겹칠 때 강하다. `제12조`·`1,250억`처럼 원문 그대로인
  고유명사·금액·조항을 정확히 집는다. 대신 `"청년 자립 지원"`으로
  `"청년 창업 자금"`을 영영 못 찾는다(겹치는 3-gram이 없다).
- **임베딩** — 뜻이 가까우면 글자가 달라도 찾는다. 대신 숫자·고유명사를 뭉갠다.

합성은 **RRF(Reciprocal Rank Fusion)**: `Σ 1/(60 + 순위)`. bm25(낮을수록 좋음,
상한 없음)와 코사인(0~1)은 **척도가 달라 그냥 더할 수 없고**, 정규화는 질의마다
분포가 달라 불안정하다. RRF는 점수가 아니라 **순위**만 쓰므로 그 문제가 아예 없다.

임베딩을 못 쓰는 상황(폐쇄망에 모델 부재, 엔드포인트 다운, 옛 인덱스)에서는 **FTS
단독으로 조용히 폴백**한다. 검색 기능 자체가 죽는 것보다 낫고, 사용자는 결과 행의
`score_kind`로 지금 어느 모드인지 알 수 있다.
"""

from __future__ import annotations

import os
import sqlite3
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from agent.retrieval import embedder
from agent.retrieval.embedder import EmbeddingUnavailableError
from agent.retrieval.indexer import DEFAULT_DB_PATH, IndexNotBuiltError, _has_table

# trigram 토크나이저는 3-gram 단위 매치라 질의가 3자 미만이면 매치 자체가 불가능하다.
# **이건 FTS의 한계이지 의미 검색의 한계가 아니다** — 그래서 이 게이트는 FTS 경로
# 안쪽에만 건다. 벡터가 있으면 "청년" 두 글자로도 답할 수 있다.
MIN_QUERY_CHARS = 3

# RRF 상수. 원 논문(Cormack et al. 2009)의 관례값으로, 상위 순위 간 점수 차를
# 완만하게 만들어 한쪽 랭커의 1등이 결과를 독식하지 못하게 한다.
RRF_K = 60
# 합성 전에 각 경로에서 뽑을 후보 수의 배수. 좁으면 두 목록이 겹치지 않아 RRF가
# 할 일이 없어지고, 넓으면 코사인 계산만 늘어난다.
CANDIDATE_MULTIPLIER = 5

# 폴백 경고는 프로세스당 한 번만 — 매 검색마다 찍으면 로그가 못 쓰게 된다.
_warned_embedding = False


__all__ = ["search", "RetrievedChunk", "IndexNotBuiltError", "MIN_QUERY_CHARS"]


@dataclass(frozen=True)
class RetrievedChunk:
    path: str
    chunk_no: int
    text: str
    score: float
    institution_id: str | None
    doctype: str
    filename: str
    # ⚠️ score의 의미는 모드에 따라 **뒤집힌다** — bm25는 낮을수록, rrf는 높을수록
    # 좋다. 그래서 score_kind를 반드시 함께 내보낸다. 정렬은 search()가 끝내서 주므로
    # **호출부가 다시 정렬하면 안 된다.**
    score_kind: str = "bm25"          # "bm25" | "rrf"
    bm25: float | None = None         # FTS 경로에 걸렸을 때만
    cosine: float | None = None       # 벡터 경로에 걸렸을 때만


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
    if not query:
        return []
    if not Path(db_path).is_file():
        raise IndexNotBuiltError(
            f"인덱스가 없습니다: {db_path} — 'py -3.14 -m agent.retrieval build'로 생성하세요"
        )

    filters = _Filters(institution_id, doctypes, filename_prefix)
    pool = limit * CANDIDATE_MULTIPLIER

    conn = sqlite3.connect(db_path)
    try:
        fts_hits = _fts_candidates(conn, query, filters, pool)
        vec_hits = _vector_candidates(conn, query, filters, pool)

        if not vec_hits:
            # FTS 단독 — 기존 동작 그대로(score = bm25, 낮을수록 좋음).
            top = fts_hits[:limit]
            return _materialize(
                conn,
                [(rowid, score, {"bm25": score, "cosine": None}) for rowid, score in top],
                score_kind="bm25",
            )

        bm25_by_id = dict(fts_hits)
        cosine_by_id = dict(vec_hits)
        merged = _rrf_merge([r for r, _ in fts_hits], [r for r, _ in vec_hits])[:limit]
        return _materialize(
            conn,
            [
                (
                    rowid,
                    score,
                    {"bm25": bm25_by_id.get(rowid), "cosine": cosine_by_id.get(rowid)},
                )
                for rowid, score in merged
            ],
            score_kind="rrf",
        )
    finally:
        conn.close()


class _Filters:
    """SQL 조각을 한 번만 만들어 **FTS와 벡터 양쪽 경로에 똑같이** 건다.

    한쪽에만 걸면 필터 밖 문서가 반대 경로로 새어 들어온다 — 기관을 지정했는데
    남의 구 문서가 섞이는 종류의 사고다.
    """

    def __init__(
        self,
        institution_id: str | None,
        doctypes: Sequence[str] | None,
        filename_prefix: str | None,
    ) -> None:
        self.clauses: list[str] = []
        self.params: list = []
        if institution_id is not None:
            self.clauses.append("institution_id = ?")
            self.params.append(institution_id)
        if doctypes:
            self.clauses.append(f"doctype IN ({','.join('?' * len(doctypes))})")
            self.params.extend(doctypes)
        if filename_prefix is not None:
            self.clauses.append("filename LIKE ? ESCAPE '\\'")
            self.params.append(_escape_like(filename_prefix) + "%")

    def sql(self, prefix: str = "") -> str:
        return "".join(f" AND {prefix}{c}" for c in self.clauses)


def _fts_candidates(
    conn: sqlite3.Connection, query: str, filters: _Filters, pool: int
) -> list[tuple[int, float]]:
    """(rowid, bm25) 목록. bm25는 낮을수록 좋다."""
    if len(query) < MIN_QUERY_CHARS:
        return []
    fts_query = _build_fts_query(query)
    if fts_query is None:
        return []

    sql = (
        "SELECT rowid, bm25(chunks) AS score FROM chunks WHERE chunks MATCH ?"
        + filters.sql()
        + " ORDER BY bm25(chunks) LIMIT ?"
    )
    return [
        (row[0], row[1])
        for row in conn.execute(sql, [fts_query, *filters.params, pool]).fetchall()
    ]


def _vector_candidates(
    conn: sqlite3.Connection, query: str, filters: _Filters, pool: int
) -> list[tuple[int, float]]:
    """(rowid, 코사인) 목록. 코사인은 높을수록 좋다. 쓸 수 없으면 빈 목록."""
    if not _has_table(conn, "vectors"):
        return []      # 계획 F 이전에 만든 인덱스 — FTS 단독으로 계속 쓴다

    sql = (
        "SELECT v.rowid, v.embedding FROM vectors v JOIN chunks c ON c.rowid = v.rowid"
        " WHERE 1=1" + filters.sql("c.")
    )
    rows = conn.execute(sql, filters.params).fetchall()
    if not rows:
        return []

    try:
        query_vector = embedder.embed_query(query, expected_dim=len(rows[0][1]) // 4)
    except EmbeddingUnavailableError as exc:
        _warn_once(f"[경고] 임베딩을 쓸 수 없어 FTS 단독으로 검색합니다: {exc}")
        return []

    matrix = np.stack([embedder.from_blob(blob) for _, blob in rows])
    similarities = _cosine(matrix, np.asarray(query_vector, dtype="<f4"))

    # 2,763청크에서는 전수 비교가 밀리초급이다. 질의 임베딩 자체가 1.2초라
    # 근사 인덱스(HNSW 등)를 붙일 이유가 아직 없다.
    top = np.argsort(-similarities)[:pool]
    return [(rows[i][0], float(similarities[i])) for i in top if similarities[i] > 0]


def _cosine(matrix: np.ndarray, vector: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1)
    vector_norm = np.linalg.norm(vector)
    if vector_norm == 0:
        return np.zeros(len(matrix), dtype="float32")
    # 0벡터 청크(빈 내용 등)로 0나눗셈이 나면 nan이 섞여 정렬이 조용히 망가진다.
    safe = np.where(norms == 0, 1.0, norms)
    return (matrix @ vector) / (safe * vector_norm)


def _rrf_merge(fts_ids: Sequence[int], vector_ids: Sequence[int]) -> list[tuple[int, float]]:
    """두 **순위** 목록을 RRF로 합쳐 (rowid, 점수) 내림차순 목록을 돌려준다.

    점수를 안 쓰고 순위만 쓰는 것이 핵심이다 — 척도가 다른 두 랭커를 정규화 없이
    합칠 수 있고, 한쪽 랭커의 점수 분포가 이상해져도 결과가 무너지지 않는다.
    """
    scores: dict[int, float] = {}
    for ids in (fts_ids, vector_ids):
        for rank, rowid in enumerate(ids, start=1):
            scores[rowid] = scores.get(rowid, 0.0) + 1.0 / (RRF_K + rank)
    return sorted(scores.items(), key=lambda item: -item[1])


def _materialize(
    conn: sqlite3.Connection,
    scored: Sequence[tuple[int, float, dict]],
    *,
    score_kind: str,
) -> list[RetrievedChunk]:
    """rowid 목록 → RetrievedChunk 목록. **주어진 순서를 그대로 유지**한다."""
    if not scored:
        return []
    ids = [rowid for rowid, _, _ in scored]
    placeholders = ",".join("?" * len(ids))
    rows = {
        row[0]: row
        for row in conn.execute(
            "SELECT rowid, path, chunk_no, text, institution_id, doctype, filename"
            f" FROM chunks WHERE rowid IN ({placeholders})",
            ids,
        ).fetchall()
    }
    out = []
    for rowid, score, extra in scored:
        row = rows.get(rowid)
        if row is None:
            continue
        out.append(
            RetrievedChunk(
                path=row[1],
                chunk_no=row[2],
                text=row[3],
                score=score,
                institution_id=row[4],
                doctype=row[5],
                filename=row[6],
                score_kind=score_kind,
                bm25=extra["bm25"],
                cosine=extra["cosine"],
            )
        )
    return out


def _warn_once(message: str) -> None:
    global _warned_embedding
    if not _warned_embedding:
        print(message, file=sys.stderr)
        _warned_embedding = True


def _build_fts_query(query: str) -> str | None:
    """자연어 질의 → FTS5 OR 질의.

    질의 전체를 한 구문으로 감싸면 채팅 문장이 코퍼스에 통째로 실재해야만 매치되므로,
    토큰(3자 이상)과 인접 토큰쌍("청년 창업" 같은 2자 단어 연쇄를 살리는 경로)을
    각각 구문 리터럴로 감싸 OR로 잇는다. 문법 문자는 리터럴 내부로 격리돼 안전하다.
    """
    tokens = query.split()
    phrases: list[str] = [t for t in tokens if len(t) >= MIN_QUERY_CHARS]
    phrases += [f"{a} {b}" for a, b in zip(tokens, tokens[1:])]
    seen: dict[str, None] = dict.fromkeys(phrases)
    if not seen:
        return None
    return " OR ".join('"' + p.replace('"', '""') + '"' for p in seen)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
