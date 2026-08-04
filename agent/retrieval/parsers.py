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


def _parse_pptx(path: Path) -> str | None:
    """제안서 슬라이드의 글자를 뽑는다 — 도형 텍스트 + 표 셀.

    계획 F Task 5에서 추가했다. 아카이브에 남는 진짜 산출물이 제안서 `.pptx`인데,
    파서가 없으면 "완료 후 산출물이 지식 탭에서 검색된다"(스펙 §② 17)가 `rfp_text.txt`
    한 건짜리 약속이 돼버린다. python-pptx는 이미 의존성에 있다(pptx_builder).

    깨진 파일 하나로 색인 전체가 멈추면 안 되므로 실패는 조용히 None이다 —
    `.txt`의 인코딩 실패와 같은 취급.
    """
    try:
        from pptx import Presentation
    except ImportError:      # pragma: no cover - 의존성이 빠진 환경
        return None

    try:
        presentation = Presentation(str(path))
    except Exception:
        return None

    parts: list[str] = []
    for slide in presentation.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                text = shape.text_frame.text.strip()
                if text:
                    parts.append(text)
            if getattr(shape, "has_table", False):
                for row in shape.table.rows:
                    cells = [c.text.strip() for c in row.cells if c.text.strip()]
                    if cells:
                        parts.append(" | ".join(cells))
    # 문단 경계를 빈 줄로 — chunker가 빈 줄 기준으로 나눈다.
    return "\n\n".join(parts) if parts else None


PARSERS = {
    ".txt": _parse_txt,
    ".pptx": _parse_pptx,
}


def parse_file(path: Path) -> str | None:
    """지원 확장자면 본문 텍스트를, 아니면(또는 디코딩 실패면) None을 돌려준다."""
    parser = PARSERS.get(path.suffix.lower())
    if parser is None:
        return None
    return parser(path)
