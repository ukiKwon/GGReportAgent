"""소스 어댑터. import 시 기본 어댑터가 레지스트리에 등록된다."""

from collector.sources import eminwon, fixture, g2b  # noqa: F401  (등록 부수효과)
from collector.sources.base import (
    AttachmentRef,
    CollectedNotice,
    IncrementalSource,
    NoticeRef,
    RawNotice,
    RunReport,
    Source,
    SourceError,
    get_source,
    list_sources,
    register,
)

__all__ = [
    "AttachmentRef",
    "CollectedNotice",
    "IncrementalSource",
    "NoticeRef",
    "RawNotice",
    "RunReport",
    "Source",
    "SourceError",
    "get_source",
    "list_sources",
    "register",
]
