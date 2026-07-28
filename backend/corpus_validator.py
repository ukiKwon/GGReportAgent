"""기관 코퍼스(giganlist/{기관}/)가 institution-corpus-format 규격을 지키는지 검사한다.

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


def validate_corpus(root: Path) -> ValidationReport:
    report = ValidationReport()
    root = Path(root)
    if not root.is_dir():
        report.errors.append(ValidationIssue(1, None, f"디렉터리가 아닙니다: {root}"))
        return report

    _check_spec_structure(root, report)
    _check_plan_structure(root, report)
    _check_bank_ideas_presence(root, report)
    _check_encoding(root, report)
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
