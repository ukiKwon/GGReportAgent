from pathlib import Path

from backend.corpus_validator import validate_corpus


def _make_corpus(root: Path, spec_count: int = 9, plan_count: int = 6) -> Path:
    """규칙을 모두 만족하는 최소 코퍼스를 만든다. 개별 테스트가 여기서 한 가지만 어긴다."""
    spec = root / "spec"
    spec.mkdir(parents=True)
    names = {
        0: "00_인덱스.txt",
        7: "07_홈페이지검색확인결과.txt",
        8: "08_민원게시판_2026년정리.txt",
    }
    for i in range(spec_count):
        (spec / names.get(i, f"{i:02d}_사업목록_예산.txt")).write_text("내용\n", encoding="utf-8")
    plan = root / "plan"
    plan.mkdir()
    for i in range(plan_count):
        (plan / f"{i:02d}_문서.txt").write_text("내용\n", encoding="utf-8")
    (root / "bank_ideas_draft.txt").write_text("초안\n", encoding="utf-8")
    return root


def test_minimal_valid_corpus_has_no_errors(tmp_path):
    report = validate_corpus(_make_corpus(tmp_path / "inst"))
    assert report.errors == []
    assert report.ok is True


def _rules(issues):
    return sorted({i.rule for i in issues})


def test_rule1_reports_too_few_spec_files(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "spec" / "01_사업목록_예산.txt").unlink()
    (root / "spec" / "02_사업목록_예산.txt").unlink()
    report = validate_corpus(root)
    assert 1 in _rules(report.errors)


def test_rule1_reports_missing_prefix(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "spec" / "메모.txt").write_text("x\n", encoding="utf-8")
    report = validate_corpus(root)
    assert 1 in _rules(report.errors)


def test_rule2_numbering_gap_is_warning_not_error(tmp_path):
    root = _make_corpus(tmp_path / "inst", spec_count=10)
    (root / "spec" / "06_사업목록_예산.txt").unlink()
    report = validate_corpus(root)
    assert report.errors == []
    assert 2 in _rules(report.warnings)


def test_rule3_requires_exactly_six_plan_files(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "plan" / "06_추가.txt").write_text("x\n", encoding="utf-8")
    report = validate_corpus(root)
    assert 3 in _rules(report.errors)


def test_rule4_rejects_singular_bank_idea_filename(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "bank_ideas_draft.txt").rename(root / "bank_idea_draft.txt")
    report = validate_corpus(root)
    assert 4 in _rules(report.errors)


def test_rule5_requires_homepage_and_complaint_files(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "spec" / "07_홈페이지검색확인결과.txt").rename(root / "spec" / "07_기타.txt")
    report = validate_corpus(root)
    assert 5 in _rules(report.errors)


def test_rule9_reports_non_utf8_file(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    (root / "spec" / "01_사업목록_예산.txt").write_bytes(b"\xff\xfe\x00\x81")
    report = validate_corpus(root)
    assert 9 in _rules(report.errors)
