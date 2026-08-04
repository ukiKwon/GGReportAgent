from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import create_app


def _client(tmp_path):
    return TestClient(create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                                 graph_db_path=str(tmp_path / "g.db")))


@patch("agent.llm.installed_models", lambda url: ["llama3.2:3b"])
@patch("agent.llm.detect_resources", lambda: (7.6, 2))
def test_status_reports_resolved_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "auto")
    import agent.llm as m; m.reset_model_cache()
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "llama3.2:3b"
    assert body["auto"] is True and body["cpu_count"] == 2


def test_status_with_explicit_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    import agent.llm as m; m.reset_model_cache()
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "gpt-oss-120b" and body["auto"] is False
