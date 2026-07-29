"""CLI: py -3.14 -m agent.retrieval build|search"""

from __future__ import annotations

import argparse
import sys

from agent.retrieval.indexer import DEFAULT_CORPUS_ROOT, DEFAULT_DB_PATH, build_index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="agent.retrieval")
    sub = parser.add_subparsers(dest="command", required=True)

    build_p = sub.add_parser("build", help="corpus/ 전체를 인덱싱(전체 재빌드)")
    build_p.add_argument("--corpus", default=DEFAULT_CORPUS_ROOT)
    build_p.add_argument("--db", default=DEFAULT_DB_PATH)

    args = parser.parse_args(argv)
    if args.command == "build":
        result = build_index(args.corpus, args.db)
        print(f"인덱스 완료: 파일 {result['files']}개, 청크 {result['chunks']}개 → {args.db}")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
