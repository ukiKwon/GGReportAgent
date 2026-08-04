"""증분 재색인 테스트 (계획 F Task 4).

전체 빌드가 CPU에서 약 57분이라, 산출물 몇 개 늘었다고 매번 다 돌릴 수 없다.
§② 17번(아카이브 후 자동 재색인)이 성립하려면 증분이 **선행 조건**이다.
"""

import sqlite3
import time

import pytest

from agent.retrieval import embedder
from agent.retrieval.indexer import build_index, reindex


@pytest.fixture(autouse=True)
def fake_embed(monkeypatch):
    def _post(url, payload, timeout):
        return {"embeddings": [[float(len(t)), 1.0, 0.0] for t in payload["input"]]}

    monkeypatch.setattr(embedder, "_http_post", _post)


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path / "corpus"
    spec = root / "institutions" / "dobong" / "spec"
    spec.mkdir(parents=True)
    (spec / "01_사업.txt").write_text("청년 창업 지원", encoding="utf-8")
    (spec / "02_예산.txt").write_text("총 예산 120억원", encoding="utf-8")
    return root


@pytest.fixture
def db(corpus, tmp_path):
    path = tmp_path / "index.db"
    build_index(corpus, path, embed=True)
    return path


def rows(db, sql):
    conn = sqlite3.connect(db)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def count(db, table):
    return rows(db, f"SELECT COUNT(*) FROM {table}")[0][0]


def test_변한_게_없으면_아무것도_안_한다(corpus, db):
    result = reindex([(corpus, "corpus")], db)
    assert result == {"added": 0, "updated": 0, "removed": 0, "chunks": 0, "embedded": 0}


def test_새_파일만_추가로_색인한다(corpus, db):
    before = count(db, "chunks")
    (corpus / "institutions" / "dobong" / "spec" / "03_신규.txt").write_text(
        "신규 도로 정비 계획", encoding="utf-8"
    )

    result = reindex([(corpus, "corpus")], db)

    assert result["added"] == 1
    assert result["updated"] == 0
    assert result["chunks"] == 1
    assert result["embedded"] == 1
    assert count(db, "chunks") == before + 1
    # 기존 청크를 건드리지 않았어야 한다 — 전체 재빌드였다면 벡터도 다 다시 만들었을 것.
    assert count(db, "vectors") == before + 1


def test_수정된_파일은_옛_청크를_지우고_다시_넣는다(corpus, db):
    target = corpus / "institutions" / "dobong" / "spec" / "01_사업.txt"
    time.sleep(0.01)
    target.write_text("청년 창업 지원\n\n두 번째 문단이 늘었다", encoding="utf-8")

    result = reindex([(corpus, "corpus")], db)

    assert result["updated"] == 1
    texts = [r[0] for r in rows(db, "SELECT text FROM chunks WHERE path LIKE '%01_사업%'")]
    assert any("두 번째 문단" in t for t in texts)
    # 옛 내용만 담긴 청크가 남아 있으면 검색이 유령 문서를 돌려준다.
    assert not any(t == "청년 창업 지원" for t in texts)


def test_삭제된_파일은_청크와_벡터에서_사라진다(corpus, db):
    (corpus / "institutions" / "dobong" / "spec" / "02_예산.txt").unlink()

    result = reindex([(corpus, "corpus")], db)

    assert result["removed"] == 1
    assert rows(db, "SELECT COUNT(*) FROM chunks WHERE path LIKE '%02_예산%'")[0][0] == 0
    assert count(db, "vectors") == count(db, "chunks")


def test_고아_벡터가_남지_않는다(corpus, db):
    """chunks에 없는 rowid의 벡터가 남으면 검색이 사라진 문서를 돌려준다."""
    (corpus / "institutions" / "dobong" / "spec" / "02_예산.txt").unlink()
    reindex([(corpus, "corpus")], db)

    orphans = rows(
        db, "SELECT COUNT(*) FROM vectors v LEFT JOIN chunks c ON c.rowid = v.rowid"
        " WHERE c.rowid IS NULL"
    )[0][0]
    assert orphans == 0


def test_임베딩이_빠진_청크를_뒤늦게_채운다(corpus, tmp_path):
    """전체 빌드가 중간에 끊겼을 때 나머지를 이어 채우는 경로(Task 2와 짝)."""
    db = tmp_path / "index.db"
    build_index(corpus, db)              # 벡터 없이
    assert count(db, "vectors") == 0

    result = reindex([(corpus, "corpus")], db)

    assert result["added"] == 0 and result["updated"] == 0
    assert result["embedded"] == count(db, "chunks")


def test_force는_대장을_무시하고_다시_넣는다(corpus, db):
    before = count(db, "chunks")
    result = reindex([(corpus, "corpus")], db, force=True)

    assert result["updated"] == 2
    assert count(db, "chunks") == before


def test_임베딩_없이도_증분이_동작한다(corpus, db):
    (corpus / "institutions" / "dobong" / "spec" / "03_신규.txt").write_text(
        "신규 문서", encoding="utf-8"
    )
    result = reindex([(corpus, "corpus")], db, embed=False)

    assert result["added"] == 1
    assert result["embedded"] == 0


def test_인덱스가_없으면_명확히_실패한다(corpus, tmp_path):
    from agent.retrieval.search import IndexNotBuiltError

    with pytest.raises(IndexNotBuiltError):
        reindex([(corpus, "corpus")], tmp_path / "없음.db")


def test_옛_스키마_인덱스는_전체_재빌드를_안내한다(corpus, tmp_path):
    """계획 F 이전 인덱스에는 files 대장이 없어 무엇이 변했는지 알 길이 없다."""
    from agent.retrieval.search import IndexNotBuiltError

    db = tmp_path / "old.db"
    build_index(corpus, db)
    conn = sqlite3.connect(db)
    conn.executescript("DROP TABLE files;")
    conn.commit()
    conn.close()

    with pytest.raises(IndexNotBuiltError, match="build"):
        reindex([(corpus, "corpus")], db)


def test_여러_루트를_함께_본다(corpus, tmp_path, db):
    """T5의 아카이브 루트가 올라탈 자리 — 루트별로 삭제 판정이 독립이어야 한다."""
    archive = tmp_path / "report_archive"
    (archive / "도봉구" / "2026-08-04").mkdir(parents=True)
    (archive / "도봉구" / "2026-08-04" / "rfp_text.txt").write_text(
        "공고문 본문", encoding="utf-8"
    )

    result = reindex([(corpus, "corpus"), (archive, "archive")], db)

    assert result["added"] == 1
    assert result["removed"] == 0          # corpus 쪽 파일이 지워졌다고 오판하면 안 된다
    roots = {r[0] for r in rows(db, "SELECT DISTINCT root FROM files")}
    assert roots == {"corpus", "archive"}


def test_없는_루트는_건너뛴다(corpus, tmp_path, db):
    """아카이브가 아직 안 생긴 새 설치 — 없는 루트를 '전부 삭제됨'으로 읽으면 안 된다."""
    before = count(db, "chunks")

    result = reindex([(corpus, "corpus"), (tmp_path / "없는폴더", "archive")], db)

    assert result["removed"] == 0
    assert count(db, "chunks") == before


def test_한_루트만_재색인해도_다른_루트가_지워지지_않는다(corpus, tmp_path, db):
    """완료 처리 후에는 그 기관 아카이브만 훑는다 — 그때 corpus가 통째로 날아가면 안 된다."""
    archive = tmp_path / "report_archive"
    archive.mkdir()
    (archive / "산출물.txt").write_text("제안서 요약", encoding="utf-8")
    before = count(db, "chunks")

    result = reindex([(archive, "archive")], db)

    assert result["removed"] == 0
    assert count(db, "chunks") == before + 1
