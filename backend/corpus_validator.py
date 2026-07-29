"""기관 코퍼스(corpus/institutions/{기관}/)가 institution-corpus-format 규격을 지키는지 검사한다.

FastAPI/Pydantic에 의존하지 않는다 — DMZ 쪽에서 백엔드 없이 CLI로 돌려야 하기 때문이다.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

SPEC_MIN_FILES = 8
SPEC_MAX_FILES = 10
PLAN_PREFIXES = ("00", "01", "02", "03", "04", "05")
NUMBERED_NAME = re.compile(r"^(\d{2})_")

IDEA_BLOCKS = ("연계 구청사업/근거", "구체적 상품/협력 형태", "은행 기대효과")
SPEC_CITATION = re.compile(r"spec/(\d{2})")
PLAN_CITATION = re.compile(r"plan\s+([A-Z]{2}-\d+)")
# 제안 주체(KB/국민은행)는 제외한다 — 자기 이름을 쓰는 것은 위반이 아니다.
BANNED_BANK_NAMES = (
    "신한은행", "우리은행", "하나은행", "농협은행", "기업은행",
    "SC제일은행", "카카오뱅크", "토스뱅크", "케이뱅크",
)
SELF_CHECK = re.compile(r"총\s*\d+\s*건|합계")
CROSS_CHECK_LABELS = ("확인됨", "부분확인", "확인안됨")
SCORE_PAIR = re.compile(r"(\d+)\s*/\s*(\d+)")


@dataclass
class ValidationIssue:
    rule: int
    file: str | None
    message: str


@dataclass
class ValidationReport:
    errors: list[ValidationIssue] = field(default_factory=list)
    warnings: list[ValidationIssue] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors


def _read_text(path: Path, report: ValidationReport, rel: str) -> str | None:
    """UTF-8로 읽는다. 실패하면 규칙 9 오류로 보고하고 None을 돌려준다."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        report.errors.append(ValidationIssue(9, rel, "UTF-8로 디코딩할 수 없습니다"))
        return None


def _read_quiet(path: Path) -> str | None:
    """UTF-8로 읽되, 실패는 조용히 None — 규칙 9 보고는 _check_encoding이 전담한다."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


def _check_spec_structure(root: Path, report: ValidationReport) -> list[str]:
    """규칙 1·2·5. spec 파일 번호 목록을 돌려준다(내용 규칙에서 재사용)."""
    spec_dir = root / "spec"
    if not spec_dir.is_dir():
        report.errors.append(ValidationIssue(1, "spec", "spec 디렉터리가 없습니다"))
        return []

    files = sorted(p.name for p in spec_dir.glob("*.txt"))
    if not SPEC_MIN_FILES <= len(files) <= SPEC_MAX_FILES:
        report.errors.append(
            ValidationIssue(
                1, "spec", f"spec .txt 파일이 {len(files)}개입니다 "
                f"({SPEC_MIN_FILES}~{SPEC_MAX_FILES}개여야 합니다)"
            )
        )

    numbers: list[str] = []
    for name in files:
        match = NUMBERED_NAME.match(name)
        if match is None:
            report.errors.append(
                ValidationIssue(1, f"spec/{name}", "파일명이 'NN_' 접두사로 시작하지 않습니다")
            )
            continue
        numbers.append(match.group(1))

    duplicates = {n for n in numbers if numbers.count(n) > 1}
    for dup in sorted(duplicates):
        report.errors.append(ValidationIssue(1, "spec", f"번호 {dup}가 중복됩니다"))

    if numbers and "00" not in numbers:
        report.errors.append(ValidationIssue(1, "spec", "00번 파일이 없습니다"))

    ints = sorted({int(n) for n in numbers})
    if ints:
        missing = [f"{n:02d}" for n in range(ints[0], ints[-1] + 1) if n not in ints]
        if missing:
            report.warnings.append(
                ValidationIssue(2, "spec", f"번호가 비어 있습니다: {', '.join(missing)}")
            )

    for keyword, label in (("홈페이지검색확인결과", "홈페이지 확인"), ("민원게시판", "민원게시판")):
        hits = [n for n in files if keyword in n]
        if len(hits) != 1:
            report.errors.append(
                ValidationIssue(
                    5, "spec", f"{label} 파일이 {len(hits)}개입니다 (정확히 1개여야 합니다)"
                )
            )

    return numbers


def _check_plan_structure(root: Path, report: ValidationReport) -> None:
    """규칙 3."""
    plan_dir = root / "plan"
    if not plan_dir.is_dir():
        report.errors.append(ValidationIssue(3, "plan", "plan 디렉터리가 없습니다"))
        return

    files = sorted(p.name for p in plan_dir.glob("*.txt"))
    if len(files) != len(PLAN_PREFIXES):
        report.errors.append(
            ValidationIssue(3, "plan", f"plan .txt 파일이 {len(files)}개입니다 (정확히 6개)")
        )

    prefixes = [m.group(1) for m in (NUMBERED_NAME.match(n) for n in files) if m]
    for expected in PLAN_PREFIXES:
        if prefixes.count(expected) != 1:
            report.errors.append(
                ValidationIssue(
                    3, "plan", f"{expected}으로 시작하는 파일이 {prefixes.count(expected)}개입니다"
                )
            )


def _check_bank_ideas_presence(root: Path, report: ValidationReport) -> None:
    """규칙 4."""
    if (root / "bank_idea_draft.txt").is_file():
        report.errors.append(
            ValidationIssue(
                4, "bank_idea_draft.txt",
                "단수형 파일명입니다 — bank_ideas_draft.txt(복수형)로 바꾸세요",
            )
        )
    if not (root / "bank_ideas_draft.txt").is_file():
        report.errors.append(
            ValidationIssue(4, "bank_ideas_draft.txt", "파일이 없습니다")
        )


def _check_encoding(root: Path, report: ValidationReport) -> None:
    """규칙 9. 모든 .txt를 한 번 읽어 디코딩 가능한지 본다."""
    for path in sorted(root.rglob("*.txt")):
        _read_text(path, report, str(path.relative_to(root)).replace("\\", "/"))


def _check_citations(root: Path, spec_numbers: list[str], report: ValidationReport) -> None:
    """규칙 6. spec/NN은 실재 번호여야 하고, plan XX-N은 plan/01에 등장해야 한다."""
    plan01 = next((root / "plan").glob("01_*.txt"), None)
    plan01_text = (_read_quiet(plan01) or "") if plan01 and plan01.is_file() else ""

    for path in sorted(root.rglob("*.txt")):
        rel = str(path.relative_to(root)).replace("\\", "/")
        text = _read_quiet(path)
        if text is None:
            continue
        for number in sorted(set(SPEC_CITATION.findall(text))):
            if number not in spec_numbers:
                report.errors.append(
                    ValidationIssue(6, rel, f"spec/{number}을 인용했지만 그런 spec 파일이 없습니다")
                )
        if path.name == "bank_ideas_draft.txt":
            for item in sorted(set(PLAN_CITATION.findall(text))):
                if item not in plan01_text:
                    report.errors.append(
                        ValidationIssue(6, rel, f"plan {item}을 인용했지만 plan/01에 없습니다")
                    )


def _iter_block_positions(text: str):
    """블록 라벨을 (블록index, 줄번호, 그 줄) 순서대로 흘려보낸다."""
    for lineno, line in enumerate(text.splitlines(), 1):
        for index, label in enumerate(IDEA_BLOCKS):
            if label in line:
                yield index, lineno, line


def _check_bank_ideas_content(root: Path, report: ValidationReport) -> None:
    """규칙 8(오류) + 규칙 7(경고)."""
    path = root / "bank_ideas_draft.txt"
    if not path.is_file():
        return
    text = _read_quiet(path)
    if text is None:
        return

    positions = list(_iter_block_positions(text))
    for order, (index, lineno, line) in enumerate(positions):
        if index != order % 3:
            report.errors.append(
                ValidationIssue(
                    8, "bank_ideas_draft.txt",
                    f"{lineno}행: 3블록 순서가 어긋납니다 "
                    f"(기대: {IDEA_BLOCKS[order % 3]}, 실제: {IDEA_BLOCKS[index]})",
                )
            )
            break  # 한 번 어긋나면 이후는 전부 밀리므로 첫 지점만 보고한다
        if index == 1:  # 구체적 상품/협력 형태 블록에서만 은행명을 본다
            for name in BANNED_BANK_NAMES:
                if name in line:
                    report.warnings.append(
                        ValidationIssue(
                            7, "bank_ideas_draft.txt",
                            f"{lineno}행: 상품/협력 형태 블록에 실존 금융기관명 '{name}'",
                        )
                    )

    if not positions:
        report.errors.append(
            ValidationIssue(8, "bank_ideas_draft.txt", "3블록 라벨을 하나도 찾지 못했습니다")
        )
    elif len(positions) % 3 != 0:
        report.errors.append(
            ValidationIssue(
                8, "bank_ideas_draft.txt",
                f"블록 라벨이 총 {len(positions)}개로 3의 배수가 아닙니다 "
                "(마지막 아이디어 항목의 블록이 불완전합니다)",
            )
        )


def _check_soft_rules(root: Path, report: ValidationReport) -> None:
    """규칙 10·11·12 — 전부 경고."""
    plan05 = next((root / "plan").glob("05_*.txt"), None)
    text = _read_quiet(plan05) if plan05 and plan05.is_file() else None
    if text is not None:
        pairs = [(int(a), int(b)) for a, b in SCORE_PAIR.findall(text)]
        totals = [n for n, d in pairs if d == 100]
        parts = [(n, d) for n, d in pairs if d != 100]
        if len(totals) == 1 and parts and sum(d for _, d in parts) == 100:
            if sum(n for n, _ in parts) != totals[0]:
                report.warnings.append(
                    ValidationIssue(
                        10, "plan/" + plan05.name,
                        f"항목 점수 합 {sum(n for n, _ in parts)}이 총점 {totals[0]}과 다릅니다",
                    )
                )

    homepage = next((root / "spec").glob("*홈페이지검색확인결과*.txt"), None)
    text = _read_quiet(homepage) if homepage and homepage.is_file() else None
    if text is not None:
        if not any(label in text for label in CROSS_CHECK_LABELS):
            report.warnings.append(
                ValidationIssue(
                    11, "spec/" + homepage.name,
                    "확인됨/부분확인/확인안됨 분류값을 찾지 못했습니다",
                )
            )

    spec00 = next((root / "spec").glob("00_*.txt"), None)
    text = _read_quiet(spec00) if spec00 and spec00.is_file() else None
    if text is not None:
        if not SELF_CHECK.search(text):
            report.warnings.append(
                ValidationIssue(12, "spec/" + spec00.name, "자체검산 문장을 찾지 못했습니다")
            )


def validate_corpus(root: Path) -> ValidationReport:
    report = ValidationReport()
    root = Path(root)
    if not root.is_dir():
        report.errors.append(ValidationIssue(1, None, f"디렉터리가 아닙니다: {root}"))
        return report

    spec_numbers = _check_spec_structure(root, report)
    _check_plan_structure(root, report)
    _check_bank_ideas_presence(root, report)
    _check_encoding(root, report)
    _check_citations(root, spec_numbers, report)
    _check_bank_ideas_content(root, report)
    _check_soft_rules(root, report)
    return report


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: py -3 -m backend.corpus_validator <코퍼스 폴더>", file=sys.stderr)
        return 2
    report = validate_corpus(Path(argv[1]))
    for issue in report.errors:
        print(f"[오류 규칙{issue.rule}] {issue.file or '-'}: {issue.message}")
    for issue in report.warnings:
        print(f"[경고 규칙{issue.rule}] {issue.file or '-'}: {issue.message}")
    print(f"\n오류 {len(report.errors)}건 / 경고 {len(report.warnings)}건")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
