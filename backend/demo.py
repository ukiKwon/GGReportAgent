"""데모 환경 한 방에 띄우기 — 시딩 + 데모 투입 + 서버 기동.

    py -3 -m backend.demo                  # http://localhost:8000/ 로 바로 접속
    py -3 -m backend.demo --port 8123
    py -3 -m backend.demo --reset          # 데모 자료를 통째로 지우고 새로 만든다
    py -3 -m backend.demo --reset --no-serve   # 지우기만

**운영 자료를 건드리지 않는다.** DB도 산출물도 데모 전용 경로를 쓰고
(backend/demo_paths.py), 그 경로는 `create_app`에 직접 넘긴다 — 환경변수를 거치지
않으므로 운영용 `REGISTRY_DB_PATH`가 설정돼 있어도 영향이 없다. 정리는 파일 삭제
한 번(`--reset`)이면 끝이다.
"""

import argparse
import os
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DEPENDENCY_HINT = """
필요한 패키지가 이 파이썬에 없습니다.
  현재 실행 중: {exe}
  ({version})

둘 중 하나로 해결하세요.
  1) 이 파이썬에 설치:      py -3 -m pip install -r requirements.txt
  2) 패키지가 있는 파이썬으로 실행: py -3.14 -m backend.demo
     (`py -0` 로 설치된 파이썬 목록을 볼 수 있습니다)

원인: {error}
"""


def _force_utf8_stdout() -> None:
    """Windows 기본 콘솔(cp949)에서 '—' 같은 글자를 찍다 UnicodeEncodeError로 죽는 것을 막는다.

    PYTHONIOENCODING을 매번 붙이라고 안내하면 '명령 하나'라는 요점이 무너진다.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")


def _require_dependencies() -> None:
    """의존성이 없으면 traceback 대신 무엇을 하면 되는지 알려주고 멈춘다.

    이 리포는 파이썬이 여러 개 깔린 PC에서 돌아간 이력이 있어(`py -3`가 최신
    버전을 가리키는데 패키지는 옛 버전에만 깔려 있는 상황), ImportError만 보고
    원인을 짐작하기 어렵다.
    """
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
        import langgraph  # noqa: F401
    except ImportError as exc:
        print(DEPENDENCY_HINT.format(
            exe=sys.executable, version=sys.version.split()[0], error=exc,
        ), file=sys.stderr)
        raise SystemExit(1) from exc


def reset() -> list[str]:
    """데모 자료를 통째로 지운다 — 분리해 둔 덕에 파일만 지우면 끝이다."""
    from backend.demo_paths import DEMO_ARTIFACTS

    removed = []
    for rel in DEMO_ARTIFACTS:
        path = REPO_ROOT / rel
        if path.is_dir():
            shutil.rmtree(path); removed.append(rel)
        elif path.is_file():
            path.unlink(); removed.append(rel)
    return removed


def build_app(institution: str = "dobong", stage: int = 9):
    """데모 DB를 만들고 데이터를 넣은 뒤 FastAPI 앱을 돌려준다."""
    from backend.db import init_db
    from backend.demo_paths import (
        DEMO_ARCHIVE_ROOT, DEMO_DB_PATH, DEMO_GRAPH_DB_PATH, DEMO_OUTPUT_ROOT,
    )
    from backend.demo_seed import seed
    from backend.main import create_app
    from backend.repository import seed_giganlist_districts

    db_path = str(REPO_ROOT / DEMO_DB_PATH)
    output_root = str(REPO_ROOT / DEMO_OUTPUT_ROOT)

    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = init_db(db_path)
    try:
        seed_giganlist_districts(conn, REPO_ROOT / "corpus" / "institutions")
    finally:
        conn.close()
    name_ko = seed(db_path, output_root, institution, stage)

    app = create_app(
        db_path,
        output_root=output_root,
        graph_db_path=str(REPO_ROOT / DEMO_GRAPH_DB_PATH),
        archive_root=str(REPO_ROOT / DEMO_ARCHIVE_ROOT),
        static_dir=str(REPO_ROOT / "dashboard"),
    )
    return app, name_ko


def main() -> None:
    parser = argparse.ArgumentParser(description="데모 환경 기동 (운영 자료와 분리)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--institution", default="dobong", help="데모를 넣을 기관 id")
    parser.add_argument("--stage", type=int, default=9, help="기관 진행 단계")
    parser.add_argument("--reset", action="store_true", help="데모 자료를 먼저 통째로 지운다")
    parser.add_argument("--no-serve", action="store_true", help="서버는 띄우지 않는다")
    args = parser.parse_args()

    _force_utf8_stdout()
    _require_dependencies()

    if args.reset:
        removed = reset()
        print("데모 자료 삭제: " + (", ".join(removed) if removed else "(지울 것 없음)"))
        if args.no_serve:
            return

    app, name_ko = build_app(args.institution, args.stage)
    print(
        f"데모 준비 완료 — {name_ko}({args.institution}) stage {args.stage}\n"
        f"  DB      : {REPO_ROOT / 'data' / 'demo.db'}  (운영 registry.db와 별개)\n"
        f"  지우기  : py -3 -m backend.demo --reset --no-serve"
    )
    if args.no_serve:
        return

    import uvicorn

    print(f"\n  → http://localhost:{args.port}/  에서 [워크플로] 탭을 여세요 (Ctrl+C로 종료)\n")
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
