"""소스 어댑터 인터페이스 — 사이트마다 다른 것은 전부 어댑터 안에 가둔다.

어댑터는 **판단하지 않는다**: 공고에 없는 값을 유도(예: contract_end = last_bid + term)
하지 않는다. 모르면 None. 확실성은 confirmed로만 말한다 (SCHEMA.md §④ "추측 금지").
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Protocol, runtime_checkable

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
    notice_info: dict | None = None   # manifest records[].notice (공고 사실: 종류·번호·호스트·원문 경로)
    candidate: dict | None = None     # manifest records[].candidate (기관 일정 '후보' — 사람이 확정)
    evidence_note: str | None = None

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


# ── 증분 소스(NEXT 80): 수집(원문 보관) → 추출(재실행 가능) → 포장을 나눈다 ──────────────


@dataclass(frozen=True)
class NoticeRef:
    """목록에서 본 공고 한 건(원문 받기 전). 증분 키 = (source, host, number)."""
    source: str
    host: str                      # 발행처. eminwon=호스트, 단일 사이트면 ""
    number: str                    # 공고번호 원문("제2026-1729호"), 없으면 "mgt<id>"
    title: str
    detail_url: str
    posted_at: str | None = None   # YYYY-MM-DD
    department: str | None = None
    native_id: str | None = None   # 소스 내부 상세 id(eminwon: not_ancmt_mgt_no)

    @property
    def key(self) -> str:
        return f"{self.host}|{self.number}"


@dataclass(frozen=True)
class RawNotice:
    ref: NoticeRef
    raw_dir: Path
    rel: str                       # 원문 루트 기준 상대경로(posix) — state에 기록


@dataclass
class RunReport:
    hosts_ok: list[str] = field(default_factory=list)
    hosts_failed: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)      # TLS 예외 재검토일 지남 등(실행은 계속)
    known_failing: dict[str, str] = field(default_factory=dict)   # 이번 실행 대상 중 '늘 실패' 표시 호스트 → 사유
    # 실패한 요청 하나하나(사용자 11-12): 어느 URL로 무엇을 하다가 몇 번 시도 끝에 실패했는지. URL의 키 값은 가린다.
    fetch_failures: list[dict] = field(default_factory=list)

    def record_failure(self, url: str, purpose: str, attempts: int, error: BaseException | str, host: str = "") -> None:
        from collector.httpclient import redact_url
        import datetime as _dt
        self.fetch_failures.append({
            "host": host, "purpose": purpose, "url": redact_url(url), "attempts": attempts,
            "error": f"{type(error).__name__}: {error}"[:200] if isinstance(error, BaseException) else str(error)[:200],
            "at": _dt.datetime.now().astimezone().isoformat(timespec="seconds")})


class SeenIndex(Protocol):
    def is_seen(self, key: str) -> bool: ...


@runtime_checkable
class IncrementalSource(Protocol):
    """증분 소스. 사이트 차이는 설정(with_config)으로, 판단은 하지 않는다."""
    slug: str
    name_ko: str
    base_url: str

    def with_config(self, **options) -> "IncrementalSource": ...
    def list_new(self, seen: SeenIndex, since: str | None = None,
                 report: RunReport | None = None,
                 hosts: list[str] | None = None) -> Iterator[NoticeRef]: ...
    def accepts(self, ref: NoticeRef) -> bool: ...
    def fetch_raw(self, ref: NoticeRef, store) -> RawNotice: ...


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
