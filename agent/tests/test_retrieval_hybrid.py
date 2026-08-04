"""하이브리드 검색(FTS + 임베딩, RRF 합성) 테스트 (계획 F Task 3).

가짜 임베딩은 **키워드 카운트 벡터**다 — `[청년, 창업, 도로]` 3차원. 무작위 값이면
"의미가 가까워서 찾았다"를 검증할 수 없으니, 유사도를 손으로 계산할 수 있게 만든다.
"""

import sqlite3
import urllib.error

import pytest

from agent.retrieval import embedder
from agent.retrieval.indexer import build_index
from agent.retrieval.search import _rrf_merge, search

KEYWORDS = ("청년", "창업", "도로")


def keyword_vector(text: str) -> list[float]:
    return [float(text.count(k)) for k in KEYWORDS]


@pytest.fixture(autouse=True)
def reset_warning():
    """폴백 경고는 프로세스당 1회라 테스트 간에 상태가 새면 검증이 어긋난다."""
    import agent.retrieval.search as search_module

    search_module._warned_embedding = False
    yield
    search_module._warned_embedding = False


@pytest.fixture
def fake_embed(monkeypatch):
    def _post(url, payload, timeout):
        return {"embeddings": [keyword_vector(t) for t in payload["input"]]}

    monkeypatch.setattr(embedder, "_http_post", _post)


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path / "corpus"
    dobong = root / "institutions" / "dobong" / "spec"
    nowon = root / "institutions" / "nowon" / "spec"
    dobong.mkdir(parents=True)
    nowon.mkdir(parents=True)
    (dobong / "01_창업.txt").write_text("청년 창업 자금 융자 지원", encoding="utf-8")
    (dobong / "02_도로.txt").write_text("도로 재포장 공사 발주", encoding="utf-8")
    (nowon / "01_창업.txt").write_text("청년 창업 보육센터 운영", encoding="utf-8")
    return root


@pytest.fixture
def hybrid_db(corpus, tmp_path, fake_embed):
    db = tmp_path / "index.db"
    build_index(corpus, db, embed=True)
    return db


@pytest.fixture
def fts_only_db(corpus, tmp_path):
    # hybrid_db와 **다른 파일명**이어야 한다 — 같으면 한 테스트가 둘 다 쓸 때
    # 나중에 만들어진 쪽이 앞의 것을 덮어써 조용히 비교가 무의미해진다.
    db = tmp_path / "fts_only.db"
    build_index(corpus, db)          # embed=False — 벡터가 없다
    return db


# ── FTS 단독(폴백) 경로 ────────────────────────────────────────────────────

def test_벡터가_없으면_FTS_단독이고_score_kind가_bm25다(fts_only_db):
    results = search("청년 창업", db_path=fts_only_db)
    assert results
    assert all(c.score_kind == "bm25" for c in results)
    assert all(c.cosine is None for c in results)


def test_구_스키마_DB에서도_죽지_않는다(corpus, tmp_path):
    """vectors 테이블이 아예 없는 옛 인덱스로도 검색이 돼야 한다."""
    db = tmp_path / "old.db"
    build_index(corpus, db)
    conn = sqlite3.connect(db)
    conn.executescript("DROP TABLE vectors; DROP TABLE files;")
    conn.commit()
    conn.close()

    results = search("청년 창업", db_path=db)
    assert results and all(c.score_kind == "bm25" for c in results)


def test_임베딩_엔드포인트가_죽으면_FTS로_폴백한다(hybrid_db, monkeypatch, capsys):
    def _post(url, payload, timeout):
        raise urllib.error.URLError("connection refused")

    monkeypatch.setattr(embedder, "_http_post", _post)

    results = search("청년 창업", db_path=hybrid_db)

    assert results and all(c.score_kind == "bm25" for c in results)
    assert "임베딩" in capsys.readouterr().err


def test_폴백_경고는_한_번만_찍는다(hybrid_db, monkeypatch, capsys):
    """매 검색마다 찍으면 로그가 못 쓰게 된다."""

    def _post(url, payload, timeout):
        raise urllib.error.URLError("down")

    monkeypatch.setattr(embedder, "_http_post", _post)

    search("청년 창업", db_path=hybrid_db)
    capsys.readouterr()
    search("청년 창업", db_path=hybrid_db)
    assert capsys.readouterr().err == ""


# ── 하이브리드 경로 ────────────────────────────────────────────────────────

def test_FTS로_0건인_질의를_의미로_찾아낸다(hybrid_db, fts_only_db):
    """이 계획의 존재 이유. '자립'은 코퍼스에 없고 '청년'은 2자라 trigram이 못 잡는다."""
    assert search("청년 자립", db_path=fts_only_db) == []

    results = search("청년 자립", db_path=hybrid_db)

    assert results
    assert all(c.score_kind == "rrf" for c in results)
    assert all("청년" in c.text for c in results)
    # 도로 문서는 벡터가 직교라 안 나와야 한다.
    assert not any("도로" in c.text for c in results)


def test_원문_그대로인_용어는_여전히_정확히_잡힌다(hybrid_db):
    """하이브리드가 FTS의 기존 강점을 깨면 안 된다 — 핵심 회귀 확인."""
    results = search("재포장 공사", db_path=hybrid_db)
    assert results
    assert "도로 재포장 공사 발주" in results[0].text


def test_기관_필터가_벡터_경로에도_적용된다(hybrid_db):
    """한쪽에만 걸면 필터 밖 문서가 벡터 경로로 새어 들어온다."""
    results = search("청년 자립", institution_id="nowon", db_path=hybrid_db)
    assert results
    assert all(c.institution_id == "nowon" for c in results)


def test_doctype_필터가_벡터_경로에도_적용된다(hybrid_db):
    assert search("청년 자립", doctypes=("plan",), db_path=hybrid_db) == []
    assert search("청년 자립", doctypes=("spec",), db_path=hybrid_db) != []


def test_파일명_접두사_필터가_벡터_경로에도_적용된다(hybrid_db):
    results = search("청년 자립", filename_prefix="02_", db_path=hybrid_db)
    assert all(c.filename.startswith("02_") for c in results)


def test_3자_미만_질의도_벡터가_있으면_답한다(hybrid_db, fts_only_db):
    """trigram 한계는 FTS의 것이지 의미 검색의 것이 아니다."""
    assert search("청년", db_path=fts_only_db) == []
    assert search("청년", db_path=hybrid_db) != []


def test_빈_질의는_어느_경로에서도_빈_결과다(hybrid_db):
    assert search("   ", db_path=hybrid_db) == []


def test_limit을_지킨다(hybrid_db):
    assert len(search("청년 창업", limit=1, db_path=hybrid_db)) == 1


def test_결과에_bm25와_cosine이_함께_실린다(hybrid_db):
    results = search("청년 창업", db_path=hybrid_db)
    top = results[0]
    assert top.score_kind == "rrf"
    assert top.score > 0            # RRF는 높을수록 좋다 — bm25와 방향이 반대다
    assert top.cosine is not None   # 벡터 경로에도 걸린 문서


def test_정렬은_search가_끝내서_준다(hybrid_db):
    results = search("청년 창업", db_path=hybrid_db)
    scores = [c.score for c in results]
    assert scores == sorted(scores, reverse=True)


# ── RRF 순수 함수 ──────────────────────────────────────────────────────────

def test_rrf는_양쪽_상위를_끌어올린다():
    """양쪽 목록에 다 있는 문서가, 한쪽에서만 1등인 문서보다 위여야 한다."""
    merged = _rrf_merge([2, 1, 3], [2, 3, 1])
    assert merged[0][0] == 2


def test_rrf는_점수가_아니라_순위만_쓴다():
    """bm25(낮을수록 좋음·상한 없음)와 코사인(0~1)은 척도가 달라 더할 수 없다."""
    a = _rrf_merge([1, 2], [])
    b = _rrf_merge([1, 2], [])
    assert a == b
    # 1등이 2등보다 높다. 1/(60+1) > 1/(60+2)
    assert a[0][1] > a[1][1]


def test_rrf는_한쪽이_비어도_동작한다():
    assert [rowid for rowid, _ in _rrf_merge([], [5, 6])] == [5, 6]
