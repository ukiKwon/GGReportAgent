"""벡터 저장·빌드 시 임베딩 테스트 (계획 F Task 2).

임베딩은 **기본값이 꺼짐**이다. 이 PC처럼 Ollama가 실제로 떠 있는 환경에서 기본값이
켜져 있으면, 인덱스를 만드는 모든 테스트가 실호출로 수 초씩 잡아먹는다. 켜는 것은
CLI(`build`)와 재색인 서비스의 몫이다.
"""

import sqlite3
import urllib.error

import pytest

from agent.retrieval import embedder
from agent.retrieval.indexer import build_index


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path / "corpus"
    spec = root / "institutions" / "dobong" / "spec"
    spec.mkdir(parents=True)
    (spec / "00_인덱스.txt").write_text("총 3건 사업목록 검산", encoding="utf-8")
    (spec / "02_사업목록.txt").write_text("청년 창업 지원 센터 운영", encoding="utf-8")
    return root


def fake_embeddings(monkeypatch, dim=4):
    def _post(url, payload, timeout):
        # 텍스트 길이로 서로 다른 벡터를 만들어, 짝이 어긋나면 테스트가 잡아내게 한다.
        return {"embeddings": [[float(len(t))] * dim for t in payload["input"]]}

    monkeypatch.setattr(embedder, "_http_post", _post)


def rows(db, sql):
    conn = sqlite3.connect(db)
    try:
        return conn.execute(sql).fetchall()
    finally:
        conn.close()


def test_임베딩_꺼짐이_기본값이다(corpus, tmp_path, monkeypatch):
    called = []
    monkeypatch.setattr(embedder, "_http_post", lambda *a, **k: called.append(1))
    db = tmp_path / "index.db"

    result = build_index(corpus, db)

    assert called == []
    assert result["embedded"] == 0
    assert rows(db, "SELECT COUNT(*) FROM vectors")[0][0] == 0


def test_임베딩을_켜면_청크마다_벡터가_생긴다(corpus, tmp_path, monkeypatch):
    fake_embeddings(monkeypatch, dim=4)
    db = tmp_path / "index.db"

    result = build_index(corpus, db, embed=True)

    assert result["chunks"] == 2
    assert result["embedded"] == 2
    # rowid가 chunks와 1:1로 맞아야 한다 — 어긋나면 검색이 엉뚱한 청크를 돌려준다.
    chunk_ids = [r[0] for r in rows(db, "SELECT rowid FROM chunks ORDER BY rowid")]
    vector_ids = [r[0] for r in rows(db, "SELECT rowid FROM vectors ORDER BY rowid")]
    assert chunk_ids == vector_ids


def test_저장된_벡터가_원본_값을_보존한다(corpus, tmp_path, monkeypatch):
    fake_embeddings(monkeypatch, dim=4)
    db = tmp_path / "index.db"
    build_index(corpus, db, embed=True)

    pairs = rows(db, "SELECT c.text, v.embedding FROM chunks c JOIN vectors v ON c.rowid = v.rowid")
    for text, blob in pairs:
        assert embedder.from_blob(blob).tolist() == [float(len(text))] * 4


def test_meta에_모델과_차원이_기록된다(corpus, tmp_path, monkeypatch):
    fake_embeddings(monkeypatch, dim=4)
    db = tmp_path / "index.db"
    build_index(corpus, db, embed=True)

    meta = dict(rows(db, "SELECT key, value FROM meta"))
    assert meta["embed_dim"] == "4"
    assert meta["embed_model"] == embedder.model_name()
    assert "embedded_at" in meta


def test_임베딩이_실패해도_FTS_인덱스는_살아남는다(corpus, tmp_path, monkeypatch, capsys):
    """폐쇄망에 임베딩 모델이 없을 수 있다. 그때 검색이 통째로 죽으면 안 된다."""

    def _post(url, payload, timeout):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(embedder, "_http_post", _post)
    db = tmp_path / "index.db"

    result = build_index(corpus, db, embed=True)

    assert result["chunks"] == 2
    assert result["embedded"] == 0
    assert rows(db, "SELECT COUNT(*) FROM chunks")[0][0] == 2
    assert rows(db, "SELECT COUNT(*) FROM vectors")[0][0] == 0
    assert "임베딩" in capsys.readouterr().err
    # 실패했으면 meta에 모델을 남기면 안 된다 — 남기면 검색이 벡터가 있다고 착각한다.
    assert "embed_model" not in dict(rows(db, "SELECT key, value FROM meta"))


def test_파일_대장에_mtime과_크기가_기록된다(corpus, tmp_path):
    db = tmp_path / "index.db"
    build_index(corpus, db)

    files = rows(db, "SELECT path, mtime, size, root FROM files ORDER BY path")
    assert len(files) == 2
    for path, mtime, size, root in files:
        assert path.startswith("corpus/institutions/dobong/spec/")
        assert mtime > 0
        assert size > 0
        assert root == "corpus"


def test_진행률_콜백이_배치마다_불린다(corpus, tmp_path, monkeypatch):
    fake_embeddings(monkeypatch, dim=4)
    seen = []
    db = tmp_path / "index.db"

    build_index(corpus, db, embed=True, batch_size=1, progress=lambda d, t: seen.append((d, t)))

    # 청크 2건 × 배치 1 = 2번, 마지막은 완료를 알린다.
    assert seen == [(1, 2), (2, 2)]


def test_원자_교체는_임베딩을_켜도_유지된다(corpus, tmp_path, monkeypatch):
    """빌드가 57분짜리라, 도중에 기존 인덱스가 사라지면 그동안 검색이 죽는다."""
    fake_embeddings(monkeypatch, dim=4)
    db = tmp_path / "index.db"
    build_index(corpus, db, embed=True)
    build_index(corpus, db, embed=True)

    assert not db.with_name(db.name + ".tmp").exists()
    assert rows(db, "SELECT COUNT(*) FROM vectors")[0][0] == 2
