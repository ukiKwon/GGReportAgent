from pathlib import Path

import pytest

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
        content = "IT-1 사업\n" if i == 1 else "내용\n"
        (plan / f"{i:02d}_문서.txt").write_text(content, encoding="utf-8")
    (root / "bank_ideas_draft.txt").write_text(IDEA_OK, encoding="utf-8")
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


IDEA_OK = """[아이디어 1-1] 예시
- 연계 구청사업/근거: spec/01 참고, plan IT-1 연계
- 구체적 상품/협력 형태: 정책연계대출
- 은행 기대효과: 신규 거래 확보
"""


def _write_bank_ideas(root: Path, body: str) -> None:
    (root / "bank_ideas_draft.txt").write_text(body, encoding="utf-8")


def _write_plan01(root: Path, body: str) -> None:
    (root / "plan" / "01_문서.txt").write_text(body, encoding="utf-8")


def test_rule6_flags_citation_to_missing_spec_number(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(root, IDEA_OK.replace("spec/01", "spec/42"))
    report = validate_corpus(root)
    assert 6 in _rules(report.errors)


def test_rule6_flags_plan_citation_absent_from_plan01(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "FN-1 사업\n")
    _write_bank_ideas(root, IDEA_OK)  # plan IT-1을 인용하는데 plan/01엔 FN-1뿐
    report = validate_corpus(root)
    assert 6 in _rules(report.errors)


def test_rule6_passes_when_citations_resolve(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(root, IDEA_OK)
    report = validate_corpus(root)
    assert 6 not in _rules(report.errors)


def test_rule7_bank_name_in_product_block_is_warning_only(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(
        root, IDEA_OK.replace("구체적 상품/협력 형태: 정책연계대출",
                              "구체적 상품/협력 형태: 우리은행 제휴대출")
    )
    report = validate_corpus(root)
    assert report.errors == []
    assert 7 in _rules(report.warnings)


def test_rule7_ignores_bank_name_outside_product_block(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(
        root, IDEA_OK.replace("은행 기대효과: 신규 거래 확보",
                              "은행 기대효과: 우리은행이 이미 선점한 영역을 피할 수 있음")
    )
    report = validate_corpus(root)
    assert 7 not in _rules(report.warnings)


def test_rule8_flags_missing_block(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    broken = IDEA_OK + IDEA_OK.replace("- 은행 기대효과: 신규 거래 확보\n", "")
    _write_bank_ideas(root, broken)
    report = validate_corpus(root)
    assert 8 in _rules(report.errors)


def test_rule8_flags_out_of_order_blocks(tmp_path):
    """블록 개수는 3(=배수)이지만 순서가 뒤바뀐 경우 — order-mismatch 분기 전용 테스트.

    라벨이 정확히 3개(3의 배수)이므로 `len(positions) % 3 != 0` 분기는 절대
    발동할 수 없다. 이 테스트가 통과하려면 `index != order % 3` 순서 검사
    분기가 반드시 동작해야 한다.
    """
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(
        root,
        "[아이디어 9-9] 예시\n"
        "- 구체적 상품/협력 형태: 정책연계대출\n"  # 원래는 두 번째(index1) 블록인데 첫 자리에 옴
        "- 연계 구청사업/근거: spec/01 참고, plan IT-1 연계\n"  # 원래는 첫 번째(index0) 블록
        "- 은행 기대효과: 신규 거래 확보\n",
    )
    report = validate_corpus(root)
    assert 8 in _rules(report.errors)


def test_rule8_accepts_circled_label_style(tmp_path):
    root = _make_corpus(tmp_path / "inst")
    _write_plan01(root, "IT-1 사업\n")
    _write_bank_ideas(
        root,
        "① 연계 구청사업/근거: spec/01, plan IT-1\n"
        "② 구체적 상품/협력 형태: 정책연계대출\n"
        "③ 은행 기대효과: 신규 거래 확보\n",
    )
    report = validate_corpus(root)
    assert 8 not in _rules(report.errors)


GIGANLIST = Path(__file__).resolve().parents[2] / "corpus" / "institutions"
INSTITUTIONS = sorted(p.name for p in GIGANLIST.iterdir() if (p / "spec").is_dir())


@pytest.mark.parametrize("institution", INSTITUTIONS)
def test_existing_corpora_have_no_errors(institution):
    """기존 25개 기관 폴더는 규칙의 상한선이다 — 오류가 나오면 규칙이 틀린 것이다."""
    report = validate_corpus(GIGANLIST / institution)
    assert report.errors == [], [
        f"규칙{i.rule} {i.file}: {i.message}" for i in report.errors
    ]


def test_guro_numbering_gap_surfaces_as_warning():
    report = validate_corpus(GIGANLIST / "guro")
    assert 2 in sorted({i.rule for i in report.warnings})
