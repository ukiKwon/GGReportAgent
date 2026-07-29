"""텍스트 → 청크 목록. 빈 줄 기준 문단 분할 후 MAX_CHUNK_CHARS까지 병합한다.

결정적이어야 한다(같은 입력 → 같은 청크) — 인덱스 재빌드 간 chunk_no가 흔들리면
채팅 답변의 [경로#청크번호] 인용이 무의미해진다.
"""

from __future__ import annotations

import re

MAX_CHUNK_CHARS = 800

_PARAGRAPH_SPLIT = re.compile(r"\n\s*\n")


def chunk_text(text: str) -> list[str]:
    paragraphs = [p.strip() for p in _PARAGRAPH_SPLIT.split(text) if p.strip()]

    chunks: list[str] = []
    current = ""
    for para in paragraphs:
        for piece in _split_oversize(para):
            if not current:
                current = piece
            elif len(current) + 2 + len(piece) <= MAX_CHUNK_CHARS:
                current = f"{current}\n\n{piece}"
            else:
                chunks.append(current)
                current = piece
    if current:
        chunks.append(current)
    return chunks


def _split_oversize(paragraph: str) -> list[str]:
    """단일 문단이 한도를 넘으면 한도 크기로 하드 분할한다."""
    if len(paragraph) <= MAX_CHUNK_CHARS:
        return [paragraph]
    return [
        paragraph[i : i + MAX_CHUNK_CHARS]
        for i in range(0, len(paragraph), MAX_CHUNK_CHARS)
    ]
