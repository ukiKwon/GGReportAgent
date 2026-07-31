from fastapi.testclient import TestClient

from backend.main import create_app


def _app(tmp_path, static=True):
    static_dir = None
    if static:
        d = tmp_path / "web"; d.mkdir()
        (d / "index.html").write_text("<title>기관인텔리</title>", encoding="utf-8")
        static_dir = str(d)
    return create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                      graph_db_path=str(tmp_path / "g.db"), static_dir=static_dir)


def test_serves_index_at_root(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.get("/")
    assert r.status_code == 200
    assert "기관인텔리" in r.text


def test_api_routes_win_over_static(tmp_path):
    client = TestClient(_app(tmp_path))
    r = client.get("/institutions")
    assert r.status_code == 200
    assert r.json() == []           # 정적이 아니라 API가 응답


def test_without_static_dir_root_404(tmp_path):
    client = TestClient(_app(tmp_path, static=False))
    assert client.get("/").status_code == 404
