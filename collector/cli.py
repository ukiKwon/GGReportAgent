"""python -m collector — 실행 명령은 이것 하나(작업 스케줄러·RPA·에이전트가 같은 명령을 부른다).

종료 코드: 0 정상(알려진 실패 호스트가 표시된 종류로만 실패한 경우 포함), 1 실패(접속된 호스트 없음 포함 — 알려진 실패 호스트만 지정해도 1), 2 사용법, 3 새 호스트·공고 실패 또는 알려진 호스트의 다른 원인 실패(결과는 만들어짐), 4 다른 실행 중.
stdout은 한 줄 JSON(요약). 요청 쿼리·본문은 로그에 찍지 않는다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import secrets
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
    rs = sub.add_parser("results", help="이미 받은 나라장터 공고의 낙찰·개찰 결과 다시 찾기(원문 meta만 갱신 — 후보는 extract --all)")
    rs.add_argument("--source", required=True)
    rs.add_argument("--out-root", default=os.environ.get("COLLECTOR_OUT_ROOT", DEFAULT_OUT_ROOT))
    return p


STALE_LOCK_SEC = 6 * 3600   # 이보다 오래된 잠금은 비정상 종료로 보고 회수(security 7d2ac90)
STALE_RECLAIM_SEC = 600     # 회수 표식이 이보다 오래되면 회수 도중 죽은 것으로 보고 지운다(qa P3-D)


def _unlock(path: Path, token: str) -> None:
    """내용이 내 토큰일 때만 삭제 — 회수된 잠금을 지우고 남의 잠금을 날리지 않는다(qa 11-12)."""
    try:
        mine = f"token={token}" in path.read_text(encoding="ascii", errors="replace").split()
    except OSError:
        return
    if mine:
        try:
            path.unlink(missing_ok=True)
        except OSError:                        # 백신·색인이 잡은 경우 — 원래 종료 코드를 덮지 않는다(다음 실행이 6시간 뒤 회수)
            pass


def _lock(path: Path, token: str = ""):
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"pid={os.getpid()} token={token} at={int(time.time())}\n".encode())
            return fd
        except PermissionError:                # Windows: 방금 지운 잠금이 '삭제 대기'(백신 핸들) — 잠깐 뒤 다시(qa P3-4)
            if attempt == 2:
                return None                    # 끝내 못 만들면 '다른 실행 중'(4)
            time.sleep(1.0)
            continue
        except FileExistsError:
            try:
                seen = path.read_bytes()           # 내용 먼저, 시각은 나중 — 오래됨이 확인된 파일의 내용만 seen이 된다
                age = time.time() - path.stat().st_mtime
            except OSError:
                continue
            if age > STALE_LOCK_SEC and _reclaim(path, seen):
                continue                           # 회수(또는 이미 해제) — O_EXCL로 한 번 더 시도
            return None
    return None


def _reclaim(path: Path, seen: bytes) -> bool:
    """오래된 잠금은 '회수 표식'(O_EXCL)을 쥔 한 실행만, 다시 읽은 내용이 처음 본 것과 같을 때만 지운다(qa P3-D).
    True = 지웠거나 이미 없음, False = 다른 실행이 회수 중·이미 새 잠금·지울 수 없음('다른 실행 중' 4)."""
    mark = path.with_name(path.name + ".reclaim")
    fd = None
    for _ in range(2):
        try:
            fd = os.open(mark, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            break
        except FileExistsError:
            try:
                if time.time() - mark.stat().st_mtime <= STALE_RECLAIM_SEC:
                    return False                   # 다른 실행이 회수 중
                mark.unlink(missing_ok=True)       # 회수 도중 죽은 표식 — 지우고 이번 호출에서 한 번 더(qa P3-3)
            except OSError:
                return False
        except OSError:
            return False
    if fd is None:
        return False
    try:
        os.close(fd)
        try:
            now = path.read_bytes()
        except FileNotFoundError:
            return True                            # 그새 주인이 정상 해제
        except OSError:
            return False
        if now != seen:
            return False                           # 다른 실행이 먼저 회수해 새 잠금을 만들었다 — 지우지 않는다
        try:
            path.unlink(missing_ok=True)
        except OSError:                            # 백신·색인·열린 핸들(Windows)
            return False
        return True
    finally:
        try:
            mark.unlink(missing_ok=True)
        except OSError:
            pass


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
    token = secrets.token_hex(8)
    fd = _lock(lock_path, token)
    if fd is None:
        print(f"다른 실행이 진행 중입니다(비정상 종료였다면 {lock_path} 삭제)", file=sys.stderr)
        return 4
    try:
        state, store = State(root / "_state" / "state.json"), RawStore(root / "_raw")
        out: dict = {}
        code = 0
        if args.cmd == "results":
            if not hasattr(source, "refresh_results"):
                print("결과 다시 찾기를 지원하지 않는 소스입니다(g2b만)", file=sys.stderr)
                return 2
            out["results"] = source.refresh_results(state, store)
            code = 3 if out["results"]["error"] else 0
        if args.cmd in ("run", "collect"):
            hosts = [h.strip() for h in args.hosts.split(",") if h.strip()] if args.hosts else None
            out["collect"] = collect(source, state, store, since=args.since, hosts=hosts,
                                     limit=args.limit, baseline=args.baseline)
            c = out["collect"]
            if c["hosts_failed"] and not c["hosts_ok"]:
                code = 1                     # 접속된 호스트가 하나도 없다
            elif c["hosts_failed_new"] or c["failed"]:
                code = 3                     # 새 호스트·공고 실패 — 결과는 만들어졌다(알려진 실패만이면 0)
        if args.cmd in ("run", "extract") and not getattr(args, "baseline", False):
            out["pack"] = extract_and_pack(source, state, store, root, redo_all=args.all)
        print(json.dumps(out, ensure_ascii=False))
        return code
    except (SourceError, StateError, BatchError) as exc:
        print(f"실패: {exc}", file=sys.stderr)
        return 1
    finally:
        os.close(fd)
        _unlock(lock_path, token)
