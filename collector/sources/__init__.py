"""소스 어댑터. import 시 기본 어댑터가 레지스트리에 등록된다."""

from collector.sources import fixture  # noqa: F401  (등록 부수효과)
from collector.sources.base import (
    AttachmentRef,
    CollectedNotice,
    Source,
    SourceError,
    get_source,
    list_sources,
    register,
)

__all__ = [
    "AttachmentRef",
    "CollectedNotice",
    "Source",
    "SourceError",
    "get_source",
    "list_sources",
    "register",
]
