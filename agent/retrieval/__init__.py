"""corpus/ → SQLite FTS5 캐시 인덱스 → 검색. 외부는 이 모듈의 재수출만 import한다.

설계: docs/superpowers/specs/2026-07-29-agent-retrieval-fts-design.md
"""

from agent.retrieval.indexer import build_index
from agent.retrieval.search import IndexNotBuiltError, RetrievedChunk, search

__all__ = ["build_index", "search", "RetrievedChunk", "IndexNotBuiltError"]
