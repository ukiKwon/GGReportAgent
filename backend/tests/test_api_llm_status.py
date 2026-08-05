from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

import agent.llm as llm_mod
from backend.main import create_app


@pytest.fixture(autouse=True)
def _clean_cache():
    """auto 판정 캐시는 **프로세스 전역**이라 테스트를 넘어 샌다.

    앞뒤로 모두 비운다 — 앞만 비우면 이 파일이 남긴 캐시(`llama3.2:3b` 등)를 다른
    파일의 테스트가 물려받아, 실행 순서에 따라서만 깨지는 종류의 실패가 된다.
    """
    llm_mod.reset_model_cache()
    yield
    llm_mod.reset_model_cache()


def _client(tmp_path):
    return TestClient(create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                                 graph_db_path=str(tmp_path / "g.db")))


@patch("agent.llm.installed_models", lambda url: ["llama3.2:3b"])
@patch("agent.llm.detect_resources", lambda: (7.6, 2))
def test_status_reports_resolved_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "auto")
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "llama3.2:3b"
    assert body["auto"] is True and body["cpu_count"] == 2


def test_status_with_explicit_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "gpt-oss-120b" and body["auto"] is False


# ── reachable은 ?probe=1일 때만 (후속 정리) ────────────────────────────
# 프런트가 안 쓰는 필드 때문에 대화 탭을 열 때마다 Ollama 왕복이 붙던 것을 없앤다.

def test_reachable은_기본_응답에_없다(tmp_path, monkeypatch):
    """없는 것과 false는 다르다 — 조회하지 않았을 뿐인데 '못 닿는다'로 보이면 오진이다."""
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    called = []
    monkeypatch.setattr("backend.routers.llm_status.installed_models",
                        lambda url: called.append(url) or [])

    body = _client(tmp_path).get("/llm/status").json()
    assert "reachable" not in body
    assert called == []                      # 왕복이 아예 없어야 한다


def test_probe를_켜면_reachable을_판정한다(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    monkeypatch.setattr("backend.routers.llm_status.installed_models",
                        lambda url: ["gpt-oss-120b"])

    body = _client(tmp_path).get("/llm/status?probe=1").json()
    assert body["reachable"] is True


def test_probe로_못_닿으면_false다(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    monkeypatch.setattr("backend.routers.llm_status.installed_models", lambda url: [])

    assert _client(tmp_path).get("/llm/status?probe=1").json()["reachable"] is False


def test_auto면_probe도_목록을_다시_조회하지_않는다(tmp_path, monkeypatch):
    """auto 판정이 이미 본 목록이 응답에 실려 온다 — 같은 것을 두 번 묻지 않는다."""
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b"])
    called = []
    monkeypatch.setattr("backend.routers.llm_status.installed_models",
                        lambda url: called.append(url) or [])

    body = _client(tmp_path).get("/llm/status?probe=1").json()
    assert body["reachable"] is True and called == []
