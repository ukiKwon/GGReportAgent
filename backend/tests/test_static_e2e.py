"""서버 모드 스모크 — 실제 dashboard/ 정적 자산을 마운트해 한 앱에서
정적 서빙·기관 API·PUT이 함께 동작하는지 확인한다(브라우저 없는 최소 E2E)."""

import pathlib

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app

DASHBOARD_DIR = str(pathlib.Path(__file__).resolve().parents[2] / "dashboard")


def test_dashboard_and_api_coexist(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"), static_dir=DASHBOARD_DIR)
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('dobong','도봉구',2)")
    conn.commit(); conn.close()
    client = TestClient(app)

    assert "<title>" in client.get("/").text                       # 실제 index.html
    assert client.get("/js/serverdata.js").status_code == 200      # 신규 스크립트 서빙
    assert client.get("/institutions").json()[0]["name_ko"] == "도봉구"
    assert client.put("/institutions/dobong", json={"term": 4}).json()["term"] == 4
