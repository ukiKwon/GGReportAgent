"""CLI: py -3.14 -m agent.retrieval build|search"""

from __future__ import annotations

import argparse
import sys

from agent.retrieval.indexer import DEFAULT_CORPUS_ROOT, DEFAULT_DB_PATH, build_index
from agent.retrieval.search import IndexNotBuiltError, search


def main(argv: list[str] | None = None) -> int:
    # Windows 콘솔 기본 cp949는 코퍼스의 일부 문자를 못 담아 크래시한다.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(prog="agent.retrieval")
    sub = parser.add_subparsers(dest="command", required=True)

    build_p = sub.add_parser("build", help="corpus/ 전체를 인덱싱(전체 재빌드)")
    build_p.add_argument("--corpus", default=DEFAULT_CORPUS_ROOT)
    build_p.add_argument("--db", default=DEFAULT_DB_PATH)
    # 라이브러리 기본값은 꺼짐이지만 CLI는 켜짐이다 — 사람이 손으로 부르는 자리에서는
    # 하이브리드 검색이 되는 인덱스가 기본이어야 한다.
    build_p.add_argument(
        "--no-embed",
        action="store_true",
        help="임베딩을 건너뛰고 FTS만 만든다(빠름). 하이브리드 검색은 안 된다.",
    )

    search_p = sub.add_parser("search", help="인덱스에서 질의")
    search_p.add_argument("query")
    search_p.add_argument("--institution", default=None)
    search_p.add_argument("--doctype", action="append", default=None)
    search_p.add_argument("--filename-prefix", default=None)
    search_p.add_argument("--limit", type=int, default=8)
    search_p.add_argument("--db", default=DEFAULT_DB_PATH)

    args = parser.parse_args(argv)

    if args.command == "build":
        embed = not args.no_embed
        if embed:
            print(
                "임베딩을 포함해 빌드합니다 — CPU에서는 청크당 약 1.2초라 오래 걸립니다."
                " (FTS만 필요하면 --no-embed)",
                file=sys.stderr,
            )
        result = build_index(args.corpus, args.db, embed=embed)
        print(
            f"인덱스 완료: 파일 {result['files']}개, 청크 {result['chunks']}개,"
            f" 벡터 {result['embedded']}개 → {args.db}"
        )
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
        if chunks and chunks[0].score_kind == "bm25":
            # 벡터가 없어 FTS로만 찾았다는 사실을 알려야 한다 — 조용히 나빠지는 것이
            # 가장 나쁘다.
            print("(FTS 단독 — 의미 검색은 꺼져 있습니다)", file=sys.stderr)
        for chunk in chunks:
            preview = chunk.text.replace("\n", " ")[:80]
            print(
                f"[{chunk.score_kind} {chunk.score:.4f}]"
                f" {chunk.path}#{chunk.chunk_no} — {preview}"
            )
        if not chunks:
            print("(결과 없음)")
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
