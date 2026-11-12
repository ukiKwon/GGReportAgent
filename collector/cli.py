"""python -m collector — 실행 명령은 이것 하나(작업 스케줄러·RPA·에이전트가 같은 명령을 부른다).

종료 코드: 0 정상, 1 실패(접속된 호스트 없음 포함), 2 사용법, 3 일부 호스트·공고 실패(결과는 만들어짐), 4 다른 실행 중.
stdout은 한 줄 JSON(요약). 요청 쿼리·본문은 로그에 찍지 않는다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

from collector.batch import DEFAULT_OUT_ROOT, BatchError
from collector.pipeline import collect, extract_and_pack
from collector.preview import PreviewError, run_preview
from collector.sources import get_source, list_sources
from collector.sources.base import SourceError
from collector.state import State, StateError
from collector.store import RawStore

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="python -m collector")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sources", help="등록된 소스 목록")
    pv = sub.add_parser("preview", help="수집 배치를 화면 데이터와 견준 미리보기 보고서(preview.html·csv) 만들기")
    pv.add_argument("--batch", required=True, help="배치 ID(<out-root> 아래 폴더 이름)")
    pv.add_argument("--out-root", default=os.environ.get("COLLECTOR_OUT_ROOT", DEFAULT_OUT_ROOT))
    pv.add_argument("--institutions-js", help="기본: frontend/data/institutions.js")
    pv.add_argument("--nonmuni-js", help="기본: frontend/data/institutions_nonmuni.js")
    pv.add_argument("--screen-json", help="화면 최종 배열을 덤프한 JSON(주면 두 js 해석 대신 사용)")
    for name, helptext in (("run", "수집+추출+포장"), ("collect", "수집(원문 보관)만"),
                           ("extract", "보관된 원문에서 추출+포장(네트워크 없음)")):
        s = sub.add_parser(name, help=helptext)
        s.add_argument("--source", required=True)
        s.add_argument("--out-root", default=os.environ.get("COLLECTOR_OUT_ROOT", DEFAULT_OUT_ROOT))
        if name != "extract":
            s.add_argument("--since", help="YYYY-MM-DD 이후 게시글만")
            s.add_argument("--hosts", help="쉼표로 구분한 호스트 또는 기관 key(region|name)")
            s.add_argument("--hosts-file")
            s.add_argument("--limit", type=int)
            s.add_argument("--baseline", action="store_true", help="현재 목록을 본 것으로만 표시")
        if name != "collect":
            s.add_argument("--all", action="store_true", help="포장 끝난 원문도 다시 추출(새 배치)")
    return p


STALE_LOCK_SEC = 6 * 3600   # 이보다 오래된 잠금은 비정상 종료로 보고 회수(security 7d2ac90)


def _lock(path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    for _ in range(2):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"pid={os.getpid()} at={int(time.time())}\n".encode())
            return fd
        except FileExistsError:
            try:
                age = time.time() - path.stat().st_mtime
            except OSError:
                continue
            if age > STALE_LOCK_SEC:
                path.unlink(missing_ok=True)       # 오래된 잠금 회수 후 한 번 더 시도
                continue
            return None
    return None


def main(argv=None, http=None) -> int:
    args = _parser().parse_args(argv)
    if args.cmd == "sources":
        print(json.dumps(list_sources(), ensure_ascii=False))
        return 0
    if args.cmd == "preview":
        try:
            out = run_preview(args.batch, args.out_root, institutions_js=args.institutions_js,
                              nonmuni_js=args.nonmuni_js, screen_json=args.screen_json)
        except PreviewError as exc:
            print(f"실패: {exc}", file=sys.stderr)
            return 1
        print(json.dumps(out, ensure_ascii=False))
        return 0
    if getattr(args, "since", None) and not DATE_RE.match(args.since):
        print("--since는 YYYY-MM-DD여야 합니다", file=sys.stderr)
        return 2
    try:
        source = get_source(args.source)
    except KeyError:
        print(f"등록되지 않은 소스: {args.source}", file=sys.stderr)
        return 2
    if not hasattr(source, "list_new"):
        print("증분 소스가 아닙니다(웹 API /collect 사용)", file=sys.stderr)
        return 2
    opts = {k: v for k, v in (("hosts_file", getattr(args, "hosts_file", None)), ("http", http)) if v}
    source = source.with_config(**opts)

    root = Path(args.out_root)
    lock_path = root / "_state" / "run.lock"
    fd = _lock(lock_path)
    if fd is None:
        print(f"다른 실행이 진행 중입니다(비정상 종료였다면 {lock_path} 삭제)", file=sys.stderr)
        return 4
    try:
        state, store = State(root / "_state" / "state.json"), RawStore(root / "_raw")
        out: dict = {}
        code = 0
        if args.cmd in ("run", "collect"):
            hosts = [h.strip() for h in args.hosts.split(",") if h.strip()] if args.hosts else None
            out["collect"] = collect(source, state, store, since=args.since, hosts=hosts,
                                     limit=args.limit, baseline=args.baseline)
            c = out["collect"]
            if c["hosts_failed"] and not c["hosts_ok"]:
                code = 1                     # 접속된 호스트가 하나도 없다
            elif c["hosts_failed"] or c["failed"]:
                code = 3                     # 일부 호스트·공고 실패 — 결과는 만들어졌다
        if args.cmd in ("run", "extract") and not getattr(args, "baseline", False):
            out["pack"] = extract_and_pack(source, state, store, root, redo_all=args.all)
        print(json.dumps(out, ensure_ascii=False))
        return code
    except (SourceError, StateError, BatchError) as exc:
        print(f"실패: {exc}", file=sys.stderr)
        return 1
    finally:
        os.close(fd)
        lock_path.unlink(missing_ok=True)
