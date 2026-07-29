import pytest

from agent.retrieval import IndexNotBuiltError, build_index, search


@pytest.fixture
def index_db(tmp_path):
    root = tmp_path / "corpus"
    dobong = root / "institutions" / "dobong"
    nowon = root / "institutions" / "nowon"
    (dobong / "spec").mkdir(parents=True)
    (dobong / "plan").mkdir(parents=True)
    (nowon / "spec").mkdir(parents=True)
    (dobong / "spec" / "02_사업목록.txt").write_text(
        "청년 창업 지원 센터 운영 사업", encoding="utf-8"
    )
    (dobong / "plan" / "02_IT디지털기획_사업제안.txt").write_text(
        "IT-1 청년 창업 플랫폼 구축 제안", encoding="utf-8"
    )
    (dobong / "plan" / "03_금전적지원_사업제안.txt").write_text(
        "FN-1 청년 창업 대출 이차보전", encoding="utf-8"
    )
    (nowon / "spec" / "02_사업목록.txt").write_text(
        "어르신 복지관 리모델링 사업", encoding="utf-8"
    )
    db = tmp_path / "corpus_index.db"
    build_index(root, db)
    return db


def test_search_returns_matching_chunks_with_metadata(index_db):
    results = search("청년 창업", db_path=index_db)
    assert results
    assert all("청년 창업" in c.text for c in results)
    top = results[0]
    assert top.path.startswith("corpus/institutions/dobong/")
    assert top.institution_id == "dobong"


def test_institution_filter(index_db):
    results = search("리모델링", institution_id="nowon", db_path=index_db)
    assert results != []
    assert all(c.institution_id == "nowon" for c in results)
    assert search("리모델링", institution_id="dobong", db_path=index_db) == []


def test_doctype_and_filename_prefix_filters(index_db):
    results = search(
        "청년 창업", doctypes=("plan",), filename_prefix="03_", db_path=index_db
    )
    assert [c.filename for c in results] == ["03_금전적지원_사업제안.txt"]


def test_query_below_three_chars_returns_empty(index_db):
    assert search("청년"[:1], db_path=index_db) == []
    assert search("ab", db_path=index_db) == []


def test_query_with_quotes_does_not_raise(index_db):
    # 따옴표는 FTS5 문법 문자 — 이스케이프돼 구문 오류 없이 실행돼야 한다
    # (구문 리터럴 검색이라 매치 0건인 것은 정상).
    assert search('청년 "창업" 지원', db_path=index_db) == []


def test_limit(index_db):
    assert len(search("청년 창업", db_path=index_db)) == 3
    assert len(search("청년 창업", limit=1, db_path=index_db)) == 1


def test_missing_index_raises(tmp_path):
    with pytest.raises(IndexNotBuiltError):
        search("아무거나", db_path=tmp_path / "없음.db")


def test_no_match_returns_empty(index_db):
    assert search("존재하지않는어휘조합", db_path=index_db) == []
