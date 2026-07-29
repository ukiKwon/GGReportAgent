"""소스 어댑터 인터페이스 — 사이트마다 다른 것은 전부 어댑터 안에 가둔다.

어댑터는 **판단하지 않는다**: 공고에 없는 값을 유도(예: contract_end = last_bid + term)
하지 않는다. 모르면 None. 확실성은 confirmed로만 말한다 (SCHEMA.md §④ "추측 금지").
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Protocol, runtime_checkable

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SLUG_RE = re.compile(r"^[a-z0-9-]+$")


class SourceError(Exception):
    """어댑터가 낸 레코드가 계약을 위반했다."""


@dataclass(frozen=True)
class AttachmentRef:
    filename: str
    data: bytes


@dataclass(frozen=True)
class CollectedNotice:
    notice_id: str
    title: str
    institution_name_ko: str
    evidence_url: str
    posted_at: str | None = None
    deadline_at: str | None = None
    contract_end: str | None = None
    last_bid: str | None = None
    term: int | None = None
    confirmed: bool = False
    institution_type: str | None = None
    region_code: str | None = None
    sub_region_code: str | None = None
    attachments: tuple[AttachmentRef, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        for name in ("notice_id", "title", "institution_name_ko", "evidence_url"):
            if not str(getattr(self, name)).strip():
                raise SourceError(f"{name}은(는) 비어 있을 수 없습니다")
        for name in ("posted_at", "deadline_at", "contract_end", "last_bid"):
            value = getattr(self, name)
            if value is not None and not DATE_RE.match(value):
                raise SourceError(f"{name}은(는) YYYY-MM-DD여야 합니다: {value!r}")


@runtime_checkable
class Source(Protocol):
    slug: str
    name_ko: str
    base_url: str

    def fetch(self) -> list[CollectedNotice]: ...


SOURCES: dict[str, Source] = {}


def register(source: Source) -> Source:
    if not SLUG_RE.match(source.slug):
        raise SourceError(f"slug은 소문자 ASCII+하이픈만 허용합니다: {source.slug!r}")
    SOURCES[source.slug] = source
    return source


def get_source(slug: str) -> Source:
    return SOURCES[slug]


def list_sources() -> list[dict]:
    return [
        {"slug": s.slug, "name_ko": s.name_ko, "base_url": s.base_url}
        for s in sorted(SOURCES.values(), key=lambda s: s.slug)
    ]
