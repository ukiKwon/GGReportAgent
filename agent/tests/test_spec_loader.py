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


# ── M-1: 실제 아카이브 배치를 찾지 못하던 결함 ──────────────────────────
# `server/archive.py`는 `{뿌리}/{기관명}/{날짜}/제안서.pptx`로 만든다 — 기관명은
# **폴더 이름**이고 파일은 그냥 `제안서.pptx`다. 평면 listdir로는 한 번도 못 찾았다.

def _archived(root, institution, day, name="제안서.pptx"):
    d = root / institution / day
    d.mkdir(parents=True)
    (d / name).write_bytes(b"fake pptx bytes")
    return d / name


def test_find_archive_pptx가_실제_아카이브_배치를_찾는다(tmp_path):
    archive_dir = tmp_path / "report_archive"
    _archived(archive_dir, "수원시", "2026-03-01")
    found = find_archive_pptx(str(archive_dir), "수원시")
    assert found is not None and found.endswith("제안서.pptx")
    assert "수원시" in found


def test_find_archive_pptx는_가장_최근_회차를_고른다(tmp_path):
    """오름차순으로 첫 번째를 고르면 **가장 오래된** 회차를 재활용하게 된다."""
    archive_dir = tmp_path / "report_archive"
    _archived(archive_dir, "수원시", "2025-01-05")
    _archived(archive_dir, "수원시", "2026-03-01")
    assert "2026-03-01" in find_archive_pptx(str(archive_dir), "수원시")


def test_find_archive_pptx는_남의_기관을_집어오지_않는다(tmp_path):
    archive_dir = tmp_path / "report_archive"
    _archived(archive_dir, "안양시", "2026-03-01")
    assert find_archive_pptx(str(archive_dir), "수원시") is None


def test_find_archive_pptx는_대문자_확장자도_본다(tmp_path):
    archive_dir = tmp_path / "report_archive"
    _archived(archive_dir, "수원시", "2026-03-01", name="제안서.PPTX")
    assert find_archive_pptx(str(archive_dir), "수원시") is not None
