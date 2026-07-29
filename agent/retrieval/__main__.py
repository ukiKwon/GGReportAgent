"""CLI: py -3.14 -m agent.retrieval build|search"""

from __future__ import annotations

import argparse
import sys

from agent.retrieval.indexer import DEFAULT_CORPUS_ROOT, DEFAULT_DB_PATH, build_index
from agent.retrieval.search import IndexNotBuiltError, search


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agent.retrieval")
    sub = parser.add_subparsers(dest="command", required=True)

    build_p = sub.add_parser("build", help="corpus/ 전체를 인덱싱(전체 재빌드)")
    build_p.add_argument("--corpus", default=DEFAULT_CORPUS_ROOT)
    build_p.add_argument("--db", default=DEFAULT_DB_PATH)

    search_p = sub.add_parser("search", help="인덱스에서 질의")
    search_p.add_argument("query")
    search_p.add_argument("--institution", default=None)
    search_p.add_argument("--doctype", action="append", default=None)
    search_p.add_argument("--filename-prefix", default=None)
    search_p.add_argument("--limit", type=int, default=8)
    search_p.add_argument("--db", default=DEFAULT_DB_PATH)

    args = parser.parse_args(argv)

    if args.command == "build":
        result = build_index(args.corpus, args.db)
        print(f"인덱스 완료: 파일 {result['files']}개, 청크 {result['chunks']}개 → {args.db}")
        return 0

    if args.command == "search":
        try:
            chunks = search(
                args.query,
                institution_id=args.institution,
                doctypes=args.doctype,
                filename_prefix=args.filename_prefix,
                limit=args.limit,
                db_path=args.db,
            )
        except IndexNotBuiltError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        for chunk in chunks:
            preview = chunk.text.replace("\n", " ")[:80]
            print(f"[{chunk.score:.2f}] {chunk.path}#{chunk.chunk_no} — {preview}")
        if not chunks:
            print("(결과 없음)")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
