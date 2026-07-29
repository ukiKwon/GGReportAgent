import sqlite3

import pytest

from agent.retrieval.indexer import build_index, classify


@pytest.fixture
def corpus(tmp_path):
    root = tmp_path / "corpus"
    spec = root / "institutions" / "dobong" / "spec"
    plan = root / "institutions" / "dobong" / "plan"
    spec.mkdir(parents=True)
    plan.mkdir(parents=True)
    (spec / "00_인덱스.txt").write_text("총 3건 사업목록 검산", encoding="utf-8")
    (plan / "02_IT디지털기획_사업제안.txt").write_text("IT-1 스마트 행정", encoding="utf-8")
    (root / "institutions" / "dobong" / "bank_ideas_draft.txt").write_text(
        "청년금융 아이디어", encoding="utf-8"
    )
    inbox = root / "inbox"
    inbox.mkdir()
    (inbox / "수집_공고.txt").write_text("나라장터 공고 수집분", encoding="utf-8")
    return root


def test_build_index_counts_and_metadata(corpus, tmp_path):
    db = tmp_path / "data" / "corpus_index.db"
    result = build_index(corpus, db)
    assert result == {"files": 4, "chunks": 4}

    conn = sqlite3.connect(db)
    rows = conn.execute(
        "SELECT path, institution_id, doctype, filename FROM chunks ORDER BY path"
    ).fetchall()
    conn.close()
    assert (
        "corpus/institutions/dobong/bank_ideas_draft.txt",
        "dobong",
        "bank_ideas",
        "bank_ideas_draft.txt",
    ) in rows
    doctypes = {r[2] for r in rows}
    assert doctypes == {"spec", "plan", "bank_ideas", "inbox"}


def test_rebuild_replaces_existing_index(corpus, tmp_path):
    db = tmp_path / "corpus_index.db"
    build_index(corpus, db)
    extra = corpus / "institutions" / "dobong" / "spec" / "01_개요.txt"
    extra.write_text("추가 개요", encoding="utf-8")
    result = build_index(corpus, db)
    assert result["files"] == 5
    assert not db.with_name(db.name + ".tmp").exists()


def test_non_utf8_txt_is_skipped(corpus, tmp_path, capsys):
    broken = corpus / "institutions" / "dobong" / "spec" / "03_깨진파일.txt"
    broken.write_bytes("한글".encode("cp949"))
    db = tmp_path / "corpus_index.db"
    result = build_index(corpus, db)
    assert result["files"] == 4
    assert "건너뜀" in capsys.readouterr().err


def test_unsupported_extensions_are_ignored(corpus, tmp_path):
    (corpus / "rfp").mkdir()
    (corpus / "rfp" / "공고문.pdf").write_bytes(b"%PDF-1.4")
    db = tmp_path / "corpus_index.db"
    assert build_index(corpus, db)["files"] == 4


def test_build_index_rejects_missing_root(tmp_path):
    with pytest.raises(NotADirectoryError):
        build_index(tmp_path / "없는폴더", tmp_path / "db.db")


def test_classify_path_rules():
    assert classify(("institutions", "nowon", "spec", "02_x.txt")) == ("nowon", "spec")
    assert classify(("institutions", "nowon", "plan", "03_y.txt")) == ("nowon", "plan")
    assert classify(("institutions", "nowon", "bank_ideas_draft.txt")) == ("nowon", "bank_ideas")
    assert classify(("rfp", "공고.txt")) == (None, "rfp")
    assert classify(("reports", "요약.txt")) == (None, "report")
    assert classify(("inbox", "반입.txt")) == (None, "inbox")
    assert classify(("잡파일.txt",)) == (None, "other")
