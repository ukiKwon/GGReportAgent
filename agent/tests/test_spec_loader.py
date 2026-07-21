import os

from agent.tools.spec_loader import find_archive_pptx, list_known_institutions, load_institution_files


def _make_giganlist(tmp_path):
    d = tmp_path / "giganlist" / "dobong"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    (d / "spec" / "00_인덱스.txt").write_text("인덱스 내용", encoding="utf-8")
    (d / "plan" / "00_제안개요_및_배경.txt").write_text("개요 내용", encoding="utf-8")
    (d / "bank_ideas_draft.txt").write_text("은행 아이디어", encoding="utf-8")
    return str(tmp_path / "giganlist")


def test_list_known_institutions(tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    assert list_known_institutions(giganlist_dir) == ["dobong"]


def test_load_institution_files_reads_spec_plan_and_bank_ideas(tmp_path):
    giganlist_dir = _make_giganlist(tmp_path)
    result = load_institution_files(giganlist_dir, "dobong")
    assert result["spec_files"]["00_인덱스.txt"] == "인덱스 내용"
    assert result["plan_files"]["00_제안개요_및_배경.txt"] == "개요 내용"
    assert result["bank_ideas"] == "은행 아이디어"


def test_load_institution_files_bank_ideas_none_if_missing(tmp_path):
    d = tmp_path / "giganlist" / "nowon"
    (d / "spec").mkdir(parents=True)
    (d / "plan").mkdir(parents=True)
    result = load_institution_files(str(tmp_path / "giganlist"), "nowon")
    assert result["bank_ideas"] is None


def test_find_archive_pptx_matches_by_substring(tmp_path):
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "수원시_금고제안서_2026.pptx").write_bytes(b"fake pptx bytes")
    found = find_archive_pptx(str(archive_dir), "수원시")
    assert found is not None
    assert found.endswith("수원시_금고제안서_2026.pptx")


def test_find_archive_pptx_returns_none_when_no_match(tmp_path):
    archive_dir = tmp_path / "report_archive"
    archive_dir.mkdir()
    (archive_dir / "안양시_제안서.pptx").write_bytes(b"fake pptx bytes")
    assert find_archive_pptx(str(archive_dir), "수원시") is None
