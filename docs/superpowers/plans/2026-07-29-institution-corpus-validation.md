# 신규 기관 코퍼스 검증·반입 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사람이 DMZ에서 만든 기관 코퍼스(`giganlist/{기관}/`)를 기계적으로 검증하고, 통과분만 시스템에 반입하며, 코퍼스가 없는 기관은 Task가 아예 생성되지 않게 막는다.

**Architecture:** FastAPI 비의존 순수 파이썬 검증기(`backend/corpus_validator.py`)를 만들고, CLI와 2개의 신규 엔드포인트가 같은 함수를 호출한다. `bid_cases`에 `research_status` 컬럼을 추가해 3차 참여 결재가 끝나도 코퍼스가 없으면 Task를 만들지 않고, 코퍼스 등록이 성공하는 순간 밀려 있던 BidCase의 Task를 생성한다.

**Tech Stack:** Python 3.14 (`py -3`), FastAPI, Pydantic, SQLite(`sqlite3` 표준 라이브러리), pytest. **신규 의존성 없음.**

**설계 근거:** `docs/superpowers/specs/2026-07-29-institution-corpus-validation-design.md`

## Global Constraints

- 이 머신에서 맨 `python`/`pip`는 Windows Store 스텁이라 실패한다. **항상 `py -3`을 쓴다.**
- **신규 서드파티 의존성을 추가하지 않는다.** `requirements.txt`를 건드리지 않는다.
- `backend/corpus_validator.py`는 **FastAPI/Pydantic에 의존하지 않는다** — DMZ 쪽에서 백엔드 없이 CLI로 돌려야 하기 때문. 표준 라이브러리만 쓴다.
- 모든 코퍼스 파일은 **UTF-8**로 읽는다. 디코딩 실패는 예외를 전파하지 말고 규칙 9 오류로 보고한다.
- **베이스라인 원칙**: `giganlist/` 아래 기존 25개 기관 폴더는 전부 **오류 0건**이어야 한다. 경고는 허용된다. 규칙이 이보다 엄격해지면 규칙을 고친다(단, Task 1에서 수정하는 오타 2건은 예외 — 그건 데이터 결함이다).
- 완료 조건은 **기존 백엔드 테스트 스위트 전건 통과**다. **계획 작성 시점(커밋 `8e335ad`) 기준선은 `py -3 -m pytest backend/tests -q` → 72 passed.** 착수 시 이 명령을 먼저 돌려 현재 기준선을 다시 확인하고(다른 세션이 계속 테스트를 추가 중), 그 수가 줄지 않는지 본다.
- `backend.main.create_app`의 현재 시그니처는 `create_app(db_path: str, output_root: str = "report_new")`이다. 두 번째 인자에 기본값이 있으므로 **`create_app(db_path)` 호출은 그대로 유효**하다. 착수 시 바뀌었으면 같은 폴더의 기존 테스트 픽스처를 따라간다.
- 커밋 시 다른 세션이 같은 리포에서 작업 중일 수 있다. **경로를 명시한 커밋**(`git commit -- <paths>`)만 사용하고, `git add -A`/`git commit -a`를 쓰지 않는다.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `backend/corpus_validator.py` | 신규 | 코퍼스 폴더 → `ValidationReport`. 규칙 1~12 전부. CLI 진입점(`__main__`) 포함 |
| `backend/tests/test_corpus_validator.py` | 신규 | 규칙별 위반 케이스 + 25개 폴더 베이스라인 |
| `backend/tests/test_api_corpus.py` | 신규 | validate/register 엔드포인트 |
| `backend/db.py` | 수정 | `bid_cases`에 `research_status` 컬럼 |
| `backend/models.py` | 수정 | `BidCase.research_status`, `CorpusPathIn` |
| `backend/bidcase_repository.py` | 수정 | 생성 시 상태 판정, Task 생성 게이트, 밀린 BidCase 활성화 |
| `backend/routers/institutions.py` | 수정 | 엔드포인트 2개 |
| `backend/tests/test_api_bidcases.py`<br>`backend/tests/test_api_tasks.py`<br>`backend/tests/test_bidcase_repository.py` | 수정 | 시드에 `giganlist_dir` 추가(게이트 도입에 따른 필수 보정) |
| `giganlist/dongjak/bank_ideas_draft.txt`<br>`giganlist/gangbuk/bank_ideas_draft.txt` | 수정 | 오타 각 1건 |

---

### Task 1: 검증기 코어 — 구조 규칙과 CLI

**Files:**
- Create: `backend/corpus_validator.py`
- Test: `backend/tests/test_corpus_validator.py`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces:
  - `ValidationIssue(rule: int, file: str | None, message: str)` — dataclass
  - `ValidationReport(errors: list[ValidationIssue], warnings: list[ValidationIssue])` — dataclass, `ok` 프로퍼티(`not self.errors`)
  - `validate_corpus(root: pathlib.Path) -> ValidationReport`
  - Task 4가 이 셋을 그대로 import 한다.

이 태스크는 **규칙 1~5, 9**(구조·인코딩)만 구현한다. 내용 규칙(6~8, 10~12)은 Task 2.

- [ ] **Step 1: 테스트 파일을 만들고 첫 실패 테스트를 쓴다**

`backend/tests/test_corpus_validator.py`:

```python
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
```

주의: `_make_corpus`의 기본값(`spec_count=9`)은 규칙 5를 만족하도록 7·8번에
홈페이지·민원 파일을 배치한다. `spec_count`를 8로 낮추면 `08_민원…`이 사라져
규칙 5를 어기게 되므로, 개수만 바꾸는 테스트는 쓰지 않는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.corpus_validator'`

- [ ] **Step 3: 검증기의 자료구조와 구조 규칙을 구현한다**

`backend/corpus_validator.py`:

```python
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
```

- [ ] **Step 4: 통과를 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v`
Expected: PASS

- [ ] **Step 5: 규칙 1~5·9의 위반 테스트를 추가한다**

`backend/tests/test_corpus_validator.py`에 이어붙인다:

```python
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
```

- [ ] **Step 6: 전부 통과하는지 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v`
Expected: PASS (8건)

- [ ] **Step 7: CLI가 동작하는지 실제로 확인한다**

Run: `py -3 -m backend.corpus_validator giganlist/dobong`
Expected: `오류 0건 / 경고 N건`이 출력되고 종료코드 0. 확인:
`py -3 -m backend.corpus_validator giganlist/dobong; echo $?` → `0`

- [ ] **Step 8: 커밋**

```bash
git add -- backend/corpus_validator.py backend/tests/test_corpus_validator.py
git commit -m "feat(backend): add corpus structure validator with CLI" -- backend/corpus_validator.py backend/tests/test_corpus_validator.py
```

---

### Task 2: 내용 규칙과 25개 폴더 베이스라인

**Files:**
- Modify: `backend/corpus_validator.py`
- Modify: `backend/tests/test_corpus_validator.py`
- Modify: `giganlist/dongjak/bank_ideas_draft.txt` (107행)
- Modify: `giganlist/gangbuk/bank_ideas_draft.txt` (57행)

**Interfaces:**
- Consumes: Task 1의 `validate_corpus`, `ValidationIssue`, `ValidationReport`
- Produces: 시그니처 변화 없음. 규칙 6·7·8·10·11·12가 추가로 보고된다.

규칙 8의 판정 알고리즘은 **25개 폴더에 미리 대조해 검증됐다** — 블록 라벨을 문서
순서대로 뽑아 `A→B→C` 순환인지 보면, 23개는 이탈 0건이고 아래 오타 2건만 정확히
잡힌다. `songpa`/`gangdong`이 `① 연계 구청사업/근거` 형태의 다른 표기를 쓰는데도
라벨 문자열이 같아 그대로 동작한다.

- [ ] **Step 1: 데이터 오타 2건을 먼저 고친다**

이것 없이는 베이스라인 테스트가 통과할 수 없다. 각각 1글자 수정이다.

- `giganlist/dongjak/bank_ideas_draft.txt` 107행: `- 은행 기대효도:` → `- 은행 기대효과:`
- `giganlist/gangbuk/bank_ideas_draft.txt` 57행: `- 은행 기대효대과:` → `- 은행 기대효과:`

확인:

```bash
grep -rn "은행 기대효도\|은행 기대효대과" giganlist/ || echo "오타 0건"
```

Expected: `오타 0건`

- [ ] **Step 2: 실패하는 내용 규칙 테스트를 쓴다**

`backend/tests/test_corpus_validator.py`에 이어붙인다. `_make_corpus`가 만드는
최소 코퍼스는 내용이 비어 있으므로, 내용 규칙 테스트는 파일에 본문을 직접 써넣는다.

```python
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
```

- [ ] **Step 3: 실패를 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v -k "rule6 or rule7 or rule8"`
Expected: FAIL — 규칙 6·7·8이 아직 보고되지 않으므로 assert가 깨진다.

- [ ] **Step 4: 내용 규칙을 구현한다**

`backend/corpus_validator.py` 상단 상수에 추가:

```python
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
```

`validate_corpus`에 내용 검사 호출을 추가하고 아래 함수들을 구현한다:

```python
def _check_citations(root: Path, spec_numbers: list[str], report: ValidationReport) -> None:
    """규칙 6. spec/NN은 실재 번호여야 하고, plan XX-N은 plan/01에 등장해야 한다."""
    plan01 = next((root / "plan").glob("01_*.txt"), None)
    plan01_text = plan01.read_text(encoding="utf-8") if plan01 and plan01.is_file() else ""

    for path in sorted(root.rglob("*.txt")):
        rel = str(path.relative_to(root)).replace("\\", "/")
        text = _read_text(path, report, rel)
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
    text = _read_text(path, report, "bank_ideas_draft.txt")
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


def _check_soft_rules(root: Path, report: ValidationReport) -> None:
    """규칙 10·11·12 — 전부 경고."""
    plan05 = next((root / "plan").glob("05_*.txt"), None)
    if plan05 and plan05.is_file():
        text = plan05.read_text(encoding="utf-8")
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
    if homepage and homepage.is_file():
        text = homepage.read_text(encoding="utf-8")
        if not any(label in text for label in CROSS_CHECK_LABELS):
            report.warnings.append(
                ValidationIssue(
                    11, "spec/" + homepage.name,
                    "확인됨/부분확인/확인안됨 분류값을 찾지 못했습니다",
                )
            )

    spec00 = next((root / "spec").glob("00_*.txt"), None)
    if spec00 and spec00.is_file():
        if not SELF_CHECK.search(spec00.read_text(encoding="utf-8")):
            report.warnings.append(
                ValidationIssue(12, "spec/" + spec00.name, "자체검산 문장을 찾지 못했습니다")
            )
```

`validate_corpus` 본문을 다음으로 바꾼다:

```python
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
```

> 규칙 12는 스펙의 "숫자 대조" 대신 **자체검산 문장의 존재 여부**만 본다. 장별 건수는
> 기관마다 서술 형식이 달라 숫자 파싱이 오탐을 낳는다. 경고 등급이므로 반입에는
> 영향이 없고, 사람이 `spec/00`을 열어볼 계기만 만들어 주면 목적을 달성한다.

- [ ] **Step 5: 통과를 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v`
Expected: PASS (15건)

- [ ] **Step 6: 25개 폴더 베이스라인 테스트를 추가한다**

`backend/tests/test_corpus_validator.py` 상단에 `pytest` import를 추가하고 이어붙인다:

```python
import pytest

GIGANLIST = Path(__file__).resolve().parents[2] / "giganlist"
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
```

- [ ] **Step 7: 베이스라인이 통과하는지 확인한다**

Run: `py -3 -m pytest backend/tests/test_corpus_validator.py -v`
Expected: PASS. 25개 파라미터 케이스 전부 초록.
**하나라도 실패하면** 실패 메시지의 규칙 번호를 보고 — 표기 변형이면 규칙을 완화하고,
명백한 데이터 결함이면 데이터를 고친다(스펙 §④ 베이스라인 원칙).

- [ ] **Step 8: 커밋**

```bash
git add -- backend/corpus_validator.py backend/tests/test_corpus_validator.py \
  giganlist/dongjak/bank_ideas_draft.txt giganlist/gangbuk/bank_ideas_draft.txt
git commit -m "feat(backend): add corpus content rules and 25-corpus baseline test" -- \
  backend/corpus_validator.py backend/tests/test_corpus_validator.py \
  giganlist/dongjak/bank_ideas_draft.txt giganlist/gangbuk/bank_ideas_draft.txt
```

---

### Task 3: `research_status` 컬럼과 Task 생성 게이트

**Files:**
- Modify: `backend/db.py` (SCHEMA의 `bid_cases`)
- Modify: `backend/models.py` (`BidCase`)
- Modify: `backend/bidcase_repository.py`
- Modify: `backend/tests/test_bidcase_repository.py`
- Modify: `backend/tests/test_api_bidcases.py`
- Modify: `backend/tests/test_api_tasks.py`

**Interfaces:**
- Consumes: 없음 (Task 1·2와 독립)
- Produces:
  - `bid_cases.research_status` 컬럼 (`'대기'` | `'완료'`, 기본값 `'대기'`)
  - `BidCase.research_status: str = "대기"`
  - `backend.bidcase_repository.create_tasks_for_bid_case(conn, bid_case_id) -> list[str]`
  - `backend.bidcase_repository.activate_pending_bid_cases(conn, institution_id) -> list[str]`
  - Task 4가 `activate_pending_bid_cases`를 호출한다.

> **주의**: 기존 `registry.db`는 `CREATE TABLE IF NOT EXISTS`라 컬럼이 자동으로 추가되지
> 않는다. 로컬에서 서버를 띄워 확인할 때는 `registry.db`를 지우고 `py -3 -m backend.seed`로
> 다시 시드한다(이 파일은 git에 없다). 테스트는 `tmp_path`에 새 DB를 만들므로 영향 없다.

- [ ] **Step 1: 실패하는 게이트 테스트를 쓴다**

`backend/tests/test_bidcase_repository.py`에 이어붙인다. 이 파일의 기존 시드 헬퍼는
`giganlist_dir`를 넣지 않으므로, 새 헬퍼를 하나 더 만든다:

```python
def _seed_institution_without_corpus(db_path):
    from backend.db import get_connection

    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('newinst', '신규기관', 1)"
    )
    conn.commit()
    return conn


def test_bid_case_without_corpus_starts_in_대기(tmp_path):
    from backend.bidcase_repository import create_bid_case
    from backend.db import init_db

    db_path = str(tmp_path / "t.db")
    init_db(db_path).close()
    conn = _seed_institution_without_corpus(db_path)
    bid_case = create_bid_case(conn, "newinst")
    assert bid_case.research_status == "대기"
    conn.close()


def test_participation_confirmed_without_corpus_creates_no_tasks(tmp_path):
    from backend.bidcase_repository import (
        create_bid_case,
        list_task_summaries,
        submit_participation_decision,
    )
    from backend.db import init_db
    from backend.models import ParticipationDecisionIn

    db_path = str(tmp_path / "t.db")
    init_db(db_path).close()
    conn = _seed_institution_without_corpus(db_path)
    bid_case = create_bid_case(conn, "newinst")

    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        result = submit_participation_decision(
            conn,
            bid_case.bid_case_id,
            ParticipationDecisionIn(tier=tier, role=role, by=by, choice="참여"),
        )

    assert result.participation_status == "참여확정"
    assert list_task_summaries(conn, bid_case.bid_case_id) == []
    conn.close()
```

- [ ] **Step 2: 실패를 확인한다**

Run: `py -3 -m pytest backend/tests/test_bidcase_repository.py -v -k "대기 or without_corpus"`
Expected: FAIL — 첫 테스트는 `research_status` 속성이 없어서, 둘째는 Task 3개가 생겨서 깨진다.

- [ ] **Step 3: 스키마와 모델에 컬럼을 추가한다**

`backend/db.py`의 `bid_cases` 정의에서 `participation_decision` 줄 다음에 추가:

```sql
    research_status        TEXT NOT NULL DEFAULT '대기',
```

`backend/models.py`의 `BidCase`에 `participation_decision` 다음 줄로 추가:

```python
    research_status: str = "대기"
```

- [ ] **Step 4: 생성 시 판정과 Task 게이트를 구현한다**

`backend/bidcase_repository.py`의 `create_bid_case`에서 INSERT를 바꾼다 — 기관의
`giganlist_dir`가 채워져 있으면 `완료`로 시작한다:

```python
def _research_status_for(conn: sqlite3.Connection, institution_id: str) -> str:
    row = conn.execute(
        "SELECT giganlist_dir FROM institutions WHERE institution_id = ?", (institution_id,)
    ).fetchone()
    return "완료" if row and row["giganlist_dir"] else "대기"
```

`create_bid_case`의 INSERT 문과 파라미터를 다음으로 교체한다:

```python
    conn.execute(
        """INSERT INTO bid_cases
           (bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, last_synced_at, participation_status, participation_decision,
            research_status)
           VALUES (?, ?, ?, ?, ?, ?, '검토중', '[]', ?)""",
        (
            bid_case_id, institution_id, schedule_confidence, expected_date,
            confirmed_date, _now(), _research_status_for(conn, institution_id),
        ),
    )
```

Task 생성 로직을 함수로 빼고 게이트를 건다. `submit_participation_decision`의
마지막 블록(3차 참여 확정)에서 `for team in TEAMS:` 루프를 지우고 다음으로 바꾼다:

```python
    conn.execute(
        "UPDATE bid_cases SET participation_decision = ?, participation_status = '참여확정' "
        "WHERE bid_case_id = ?",
        (decisions_json, bid_case_id),
    )
    if bid_case.research_status == "완료":
        create_tasks_for_bid_case(conn, bid_case_id, commit=False)
    conn.commit()
    return get_bid_case(conn, bid_case_id)
```

그리고 새 함수 2개를 파일 끝에 추가한다:

```python
def create_tasks_for_bid_case(
    conn: sqlite3.Connection, bid_case_id: str, commit: bool = True
) -> list[str]:
    """팀별 Task를 만든다. 이미 있는 팀은 건너뛴다(멱등)."""
    existing = {
        row["team"]
        for row in conn.execute("SELECT team FROM tasks WHERE bid_case_id = ?", (bid_case_id,))
    }
    created = []
    for team in TEAMS:
        if team in existing:
            continue
        task_id = f"task-{secrets.token_hex(4)}"
        conn.execute(
            """INSERT INTO tasks (task_id, bid_case_id, team, status, progress_pct, draft_content)
               VALUES (?, ?, ?, '대기', 0, '')""",
            (task_id, bid_case_id, team),
        )
        created.append(task_id)
    if commit:
        conn.commit()
    return created


def activate_pending_bid_cases(
    conn: sqlite3.Connection, institution_id: str, commit: bool = True
) -> list[str]:
    """코퍼스가 반입된 기관에서, 참여확정됐지만 코퍼스 때문에 밀려 있던 BidCase를 푼다."""
    rows = conn.execute(
        """SELECT bid_case_id FROM bid_cases
           WHERE institution_id = ? AND participation_status = '참여확정'
             AND research_status = '대기'""",
        (institution_id,),
    ).fetchall()
    activated = []
    for row in rows:
        bid_case_id = row["bid_case_id"]
        conn.execute(
            "UPDATE bid_cases SET research_status = '완료' WHERE bid_case_id = ?",
            (bid_case_id,),
        )
        create_tasks_for_bid_case(conn, bid_case_id, commit=False)
        activated.append(bid_case_id)
    if commit:
        conn.commit()
    return activated
```

- [ ] **Step 5: 새 테스트가 통과하는지 확인한다**

Run: `py -3 -m pytest backend/tests/test_bidcase_repository.py -v`
Expected: 새 테스트 2건 PASS

- [ ] **Step 6: 게이트 때문에 깨진 기존 테스트를 고친다**

기존 테스트들은 기관을 `giganlist_dir` 없이 시딩해 왔다. 그 테스트들은 **코퍼스가
있는 기관의 흐름**을 검증하려는 것이므로, 시드에 `giganlist_dir`를 넣는 것이 옳은
수정이다. 아래 3개 파일의 시드 SQL을 각각 바꾼다:

- `backend/tests/test_api_bidcases.py`
- `backend/tests/test_api_tasks.py`
- `backend/tests/test_bidcase_repository.py`

```python
# 변경 전
"INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('mapo', '마포구', 1)"
# 변경 후
"INSERT INTO institutions (institution_id, name_ko, stage, giganlist_dir) "
"VALUES ('mapo', '마포구', 1, 'giganlist/mapo')"
```

- [ ] **Step 7: 전체 스위트를 돌린다**

Run: `py -3 -m pytest backend/tests -q`
Expected: 전건 PASS. 착수 시점에 기록해 둔 통과 건수보다 줄지 않아야 한다.
실패가 남으면 그 테스트가 코퍼스 없는 기관을 의도한 것인지 확인하고, 의도한 것이면
테스트의 기대값을 게이트에 맞춰 고친다.

- [ ] **Step 8: 커밋**

```bash
git add -- backend/db.py backend/models.py backend/bidcase_repository.py \
  backend/tests/test_bidcase_repository.py backend/tests/test_api_bidcases.py \
  backend/tests/test_api_tasks.py
git commit -m "feat(backend): gate task creation on corpus availability" -- \
  backend/db.py backend/models.py backend/bidcase_repository.py \
  backend/tests/test_bidcase_repository.py backend/tests/test_api_bidcases.py \
  backend/tests/test_api_tasks.py
```

---

### Task 4: 코퍼스 검증·등록 엔드포인트

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/routers/institutions.py`
- Test: `backend/tests/test_api_corpus.py` (신규)

**Interfaces:**
- Consumes: Task 1·2의 `validate_corpus`/`ValidationReport`, Task 3의 `activate_pending_bid_cases`
- Produces: `POST /institutions/{id}/corpus/validate`, `POST /institutions/{id}/corpus`

- [ ] **Step 1: 실패하는 API 테스트를 쓴다**

`backend/tests/test_api_corpus.py` (신규). 픽스처는 **같은 폴더의 `test_api_bidcases.py`가
쓰는 `create_app` 호출 형태를 그대로 복사한다** — 다른 세션이 시그니처에 인자를
추가했을 수 있으므로, 이 파일을 열어 현재 형태를 확인하고 맞춘다.

```python
import pytest
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


@pytest.fixture
def client(tmp_path):
    db_path = str(tmp_path / "test.db")
    app = create_app(db_path)  # test_api_bidcases.py의 현재 호출 형태에 맞출 것
    with TestClient(app) as test_client:
        yield test_client, db_path


def _seed(db_path, institution_id="newinst"):
    conn = get_connection(db_path)
    conn.execute(
        "INSERT INTO institutions (institution_id, name_ko, stage) VALUES (?, '신규기관', 1)",
        (institution_id,),
    )
    conn.commit()
    conn.close()


def test_validate_reports_ok_for_existing_corpus(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post(
        "/institutions/newinst/corpus/validate", json={"path": "giganlist/dobong"}
    )
    assert resp.status_code == 200
    assert resp.json()["ok"] is True
    assert resp.json()["errors"] == []


def test_validate_does_not_change_state(client):
    test_client, db_path = client
    _seed(db_path)
    test_client.post("/institutions/newinst/corpus/validate", json={"path": "giganlist/dobong"})
    detail = test_client.get("/institutions/newinst").json()
    assert detail["giganlist_dir"] is None


def test_register_rejects_absolute_path(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": "C:/windows"})
    assert resp.status_code == 400


def test_register_rejects_parent_traversal(client):
    test_client, db_path = client
    _seed(db_path)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/../.."})
    assert resp.status_code == 400


def test_register_404_for_unknown_institution(client):
    test_client, _ = client
    resp = test_client.post("/institutions/nope/corpus", json={"path": "giganlist/dobong"})
    assert resp.status_code == 404


def test_register_422_when_validation_fails(client, tmp_path):
    test_client, db_path = client
    _seed(db_path)
    broken = tmp_path / "broken"
    (broken / "spec").mkdir(parents=True)
    resp = test_client.post("/institutions/newinst/corpus", json={"path": str(broken)})
    assert resp.status_code in (400, 422)
    assert test_client.get("/institutions/newinst").json()["giganlist_dir"] is None


def test_register_sets_dir_and_activates_pending_bid_case(client):
    test_client, db_path = client
    _seed(db_path)
    bid_case_id = test_client.post(
        "/bidcases", json={"institution_id": "newinst"}
    ).json()["bid_case_id"]
    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
    assert test_client.get(f"/bidcases/{bid_case_id}").json()["tasks"] == []

    resp = test_client.post(
        "/institutions/newinst/corpus", json={"path": "giganlist/dobong"}
    )
    assert resp.status_code == 200
    assert resp.json()["activated_bid_cases"] == [bid_case_id]

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert detail["research_status"] == "완료"
    assert len(detail["tasks"]) == 3


def test_register_is_idempotent(client):
    test_client, db_path = client
    _seed(db_path)
    bid_case_id = test_client.post(
        "/bidcases", json={"institution_id": "newinst"}
    ).json()["bid_case_id"]
    for tier, role, by in [(1, "실무자", "a"), (2, "팀장", "b"), (3, "부장", "c")]:
        test_client.post(
            f"/bidcases/{bid_case_id}/participation-decisions",
            json={"tier": tier, "role": role, "by": by, "choice": "참여"},
        )
    test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/dobong"})
    test_client.post("/institutions/newinst/corpus", json={"path": "giganlist/dobong"})

    detail = test_client.get(f"/bidcases/{bid_case_id}").json()
    assert len(detail["tasks"]) == 3
```

- [ ] **Step 2: 실패를 확인한다**

Run: `py -3 -m pytest backend/tests/test_api_corpus.py -v`
Expected: FAIL — 엔드포인트가 없어 전부 404.

- [ ] **Step 3: 요청 모델을 추가한다**

`backend/models.py` 끝에:

```python
class CorpusPathIn(BaseModel):
    path: str
```

- [ ] **Step 4: 엔드포인트를 구현한다**

`backend/routers/institutions.py` 상단 import에 추가:

```python
from pathlib import Path

from backend.bidcase_repository import activate_pending_bid_cases
from backend.corpus_validator import validate_corpus
from backend.models import CorpusPathIn

REPO_ROOT = Path(__file__).resolve().parents[2]


def _safe_corpus_path(raw: str) -> Path:
    """리포 루트 기준 상대경로만 허용한다. 위반 시 400."""
    candidate = Path(raw)
    if candidate.is_absolute():
        raise HTTPException(status_code=400, detail="상대경로만 허용됩니다")
    resolved = (REPO_ROOT / candidate).resolve()
    if not resolved.is_relative_to(REPO_ROOT):
        raise HTTPException(status_code=400, detail="리포지토리 밖 경로는 허용되지 않습니다")
    if not resolved.is_dir():
        raise HTTPException(status_code=400, detail="디렉터리가 아닙니다")
    return resolved


def _issues(items) -> list[dict]:
    return [{"rule": i.rule, "file": i.file, "message": i.message} for i in items]
```

파일 끝에 엔드포인트 2개를 추가한다:

```python
@router.post("/{institution_id}/corpus/validate")
def post_corpus_validate(
    institution_id: str, body: CorpusPathIn, request: Request
) -> dict:
    conn = _conn(request)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")
    finally:
        conn.close()

    report = validate_corpus(_safe_corpus_path(body.path))
    return {
        "ok": report.ok,
        "errors": _issues(report.errors),
        "warnings": _issues(report.warnings),
    }


@router.post("/{institution_id}/corpus")
def post_corpus_register(
    institution_id: str, body: CorpusPathIn, request: Request
) -> dict:
    conn = _conn(request)
    try:
        if get_institution(conn, institution_id) is None:
            raise HTTPException(status_code=404, detail="institution not found")

        resolved = _safe_corpus_path(body.path)
        report = validate_corpus(resolved)
        if not report.ok:
            raise HTTPException(status_code=422, detail={"errors": _issues(report.errors)})

        relative = resolved.relative_to(REPO_ROOT).as_posix()
        conn.execute(
            "UPDATE institutions SET giganlist_dir = ? WHERE institution_id = ?",
            (relative, institution_id),
        )
        activated = activate_pending_bid_cases(conn, institution_id, commit=False)
        conn.commit()
    finally:
        conn.close()

    return {
        "giganlist_dir": relative,
        "activated_bid_cases": activated,
        "warnings": _issues(report.warnings),
    }
```

- [ ] **Step 5: 통과를 확인한다**

Run: `py -3 -m pytest backend/tests/test_api_corpus.py -v`
Expected: PASS (8건)

- [ ] **Step 6: 전체 스위트 회귀를 확인한다**

Run: `py -3 -m pytest backend/tests -q`
Expected: 전건 PASS

- [ ] **Step 7: 실제 서버로 스모크 테스트한다**

```bash
rm -f registry.db
py -3 -m backend.seed
py -3 -m uvicorn backend.main:app --port 8901
```

다른 셸에서 (한글 본문은 git-bash의 `-d`로 보내면 깨지므로 ASCII만 쓴다):

```bash
curl -s -X POST http://127.0.0.1:8901/institutions/dobong/corpus/validate \
  -H "Content-Type: application/json" -d '{"path":"giganlist/dobong"}'
```

Expected: `{"ok":true,"errors":[],"warnings":[...]}`. 확인 후 서버를 종료한다.

- [ ] **Step 8: 커밋**

```bash
git add -- backend/models.py backend/routers/institutions.py backend/tests/test_api_corpus.py
git commit -m "feat(backend): add corpus validate and register endpoints" -- \
  backend/models.py backend/routers/institutions.py backend/tests/test_api_corpus.py
```

---

## Self-Review

**스펙 커버리지**

| 스펙 항목 | 담당 |
|---|---|
| §③ 검증기(FastAPI 비의존, CLI 공용) | Task 1 |
| §④ 규칙 1~5·9 | Task 1 |
| §④ 규칙 6·7·8·10·11·12 | Task 2 |
| §④ 오타 2건 수정 | Task 2 Step 1 |
| §④ 베이스라인 원칙 | Task 2 Step 6·7 |
| §⑤ `research_status` 컬럼·모델·판정 기준 | Task 3 |
| §⑥ 엔드포인트 2개·경로 안전·CLI | Task 4(엔드포인트), Task 1(CLI) |
| §⑦ 등록 시 ①②③ 원자 처리 | Task 4 Step 4(`commit=False` + 단일 `commit()`) |
| §⑧ 400/404/422·멱등·UTF-8 | Task 4 테스트, Task 3 `create_tasks_for_bid_case` |
| §⑨ 테스트 3종 + 회귀 | Task 1·2·3·4 각 마지막 단계 |

**남는 차이 1건**: 규칙 12를 "숫자 대조" 대신 "자체검산 문장 존재 확인"으로 구현한다
(Task 2 Step 4의 인용 블록에 근거를 적어 두었다). 경고 등급이라 반입 판정에는 영향이 없다.

**타입 일관성**: `ValidationIssue`/`ValidationReport`/`validate_corpus`(Task 1 정의) →
Task 2가 같은 이름으로 확장 → Task 4가 그대로 import. `create_tasks_for_bid_case`,
`activate_pending_bid_cases`(Task 3 정의) → Task 4가 `activate_pending_bid_cases`만 사용.
`CorpusPathIn`은 Task 4에서 정의·사용.
