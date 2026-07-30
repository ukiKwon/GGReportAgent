"""공고문 PDF에서 텍스트를 뽑는다 — 결정적 부분만.

`.claude/skills/rfp-locate`와 `agent/nodes/rfp_extract.py`가 **같은 구현을 쓴다.**
사본을 두면 이상 판정 임계값이 갈라져, 사람이 스킬로 처리했을 때와 파이프라인이
자동으로 처리했을 때의 판단이 달라진다.

여기까지가 기계가 확실히 할 수 있는 일이고, 배점표를 표로 복원하는 것은 아니다
(추출된 텍스트에서 항목/세부항목/배점 컬럼 경계가 무너진다 — 스킬 SKILL.md 참고).
"""

from __future__ import annotations

import pypdf

# 이상 판정 임계값. 스킬과 노드가 같은 값을 봐야 하므로 여기 한 곳에만 둔다.
MIN_CHARS_PER_PAGE = 50
MAX_REPLACEMENT_RATIO = 0.01


def is_text_abnormal(pages: list[str]) -> tuple[bool, str | None]:
    """추출 결과가 못 믿을 상태인지 판정한다. CID폰트·이미지 PDF가 여기 걸린다."""
    total_chars = sum(len(p) for p in pages)
    avg_chars_per_page = total_chars / len(pages) if pages else 0
    if avg_chars_per_page < MIN_CHARS_PER_PAGE:
        return True, f"avg chars/page {avg_chars_per_page:.1f} is below {MIN_CHARS_PER_PAGE} threshold"

    full_text = "\n".join(pages)
    if full_text:
        replacement_ratio = full_text.count("�") / len(full_text)
        if replacement_ratio > MAX_REPLACEMENT_RATIO:
            return True, (
                f"replacement char (�) ratio {replacement_ratio:.1%} "
                f"exceeds {MAX_REPLACEMENT_RATIO:.0%}"
            )

    return False, None


def extract_pdf_text(pdf_path: str) -> dict:
    reader = pypdf.PdfReader(pdf_path)
    pages = [page.extract_text() or "" for page in reader.pages]
    full_text = "\n".join(pages)
    avg_chars_per_page = (sum(len(p) for p in pages) / len(pages)) if pages else 0
    is_abnormal, abnormal_reason = is_text_abnormal(pages)

    return {
        "pages": pages,
        "full_text": full_text,
        "avg_chars_per_page": avg_chars_per_page,
        "is_abnormal": is_abnormal,
        "abnormal_reason": abnormal_reason,
    }
