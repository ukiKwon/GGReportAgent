"""확장자별 코퍼스 파서 레지스트리.

v1은 .txt(UTF-8)만 지원한다. rfp(PDF)·reports(HTML/DOCX)는 여기에 확장자 항목을
추가하는 것으로 확장한다 — 스펙 §④·§⑦ 참조.
"""

from __future__ import annotations

from pathlib import Path


def _parse_txt(path: Path) -> str | None:
    """UTF-8로 읽되, 실패는 조용히 None — 인코딩 검증은 corpus_validator의 몫이다."""
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return None


PARSERS = {
    ".txt": _parse_txt,
}


def parse_file(path: Path) -> str | None:
    """지원 확장자면 본문 텍스트를, 아니면(또는 디코딩 실패면) None을 돌려준다."""
    parser = PARSERS.get(path.suffix.lower())
    if parser is None:
        return None
    return parser(path)
