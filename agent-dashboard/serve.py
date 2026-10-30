"""에이전트 대시보드 로컬 서버 (표준 라이브러리만 사용).

실행:  python agent-dashboard/serve.py   →  http://localhost:8090
상태 갱신:  curl -X POST http://localhost:8090/api/state -H "Content-Type: application/json" \
              -d '{"agents":{"qa":{"active":true,"task":"회귀 검증"}},"coach":{"task":"NEXT 31 진행"}}'
POST 본문은 state.json에 병합(merge)되고, 화면이 2초 안에 반영한다.
"""
import json
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "state.json"
HOST, PORT = "127.0.0.1", 8090


DEFAULT = {"coach": {"task": ""}, "agents": {k: {"active": False, "task": ""} for k in ("designer", "qa", "frontend", "backend", "security", "planner", "pm")}}


MAX_BODY = 16 * 1024


def merge(base, patch):
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(base.get(k), dict):
            merge(base[k], v)
        else:
            base[k] = v
    return base


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/state":
            self.send_error(404)
            return
        try:
            if not self.headers.get("Content-Type", "").lower().startswith("application/json"):
                self.send_error(415, "json only")
                return
            host = self.headers.get("Host", "").split(":")[0]
            if host not in ("localhost", "127.0.0.1"):
                self.send_error(403, "bad host")
                return
            n = int(self.headers.get("Content-Length", 0))
            if n < 0 or n > MAX_BODY:
                self.send_error(413, "too large")
                return
            body = self.rfile.read(n)
            patch = json.loads(body.decode("utf-8"))
            if not isinstance(patch, dict):
                raise ValueError("object expected")
            cur = json.loads(STATE.read_text(encoding="utf-8")) if STATE.exists() else {}
            STATE.write_text(json.dumps(merge(cur, patch), ensure_ascii=False, indent=2), encoding="utf-8")
        except (ValueError, OSError) as e:
            self.send_error(400, str(e))
            return
        self.send_response(204)
        self.end_headers()


if __name__ == "__main__":
    if not STATE.exists():
        STATE.write_text(json.dumps(DEFAULT, ensure_ascii=False, indent=2), encoding="utf-8")
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    print(f"agent-dashboard: http://localhost:{port}  (Ctrl+C로 종료)")
    ThreadingHTTPServer((HOST, port), Handler).serve_forever()
