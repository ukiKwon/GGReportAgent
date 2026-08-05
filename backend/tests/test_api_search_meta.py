"""GET /search 응답 헤더(X-Search-Mode·X-Embed-Model) — 계획 F 후속(Task 4).

검색 자체(FTS·임베딩)는 이미 agent/retrieval/tests에서 검증했으므로 여기서는
`search()`를 목으로 갈아끼워 라우터가 결과의 score_kind를 보고 헤더를 **정확히**
싣는지만 본다. 실제 인덱스는 필요 없다.
"""

import pytest
from fastapi.testclient import TestClient

import backend.routers.search as search_router
from agent.retrieval.search import RetrievedChunk
from backend.main import create_app


def _chunk(score_kind: str) -> RetrievedChunk:
    return RetrievedChunk(
        path="corpus/institutions/dobong/spec/02.txt",
        chunk_no=1,
        text="청년 창업 지원",
        score=1.0,
        institution_id="dobong",
        doctype="spec",
        filename="02.txt",
        score_kind=score_kind,
    )


@pytest.fixture
def client(tmp_path):
    app = create_app(str(tmp_path / "test.db"), index_db_path=str(tmp_path / "index.db"))
    with TestClient(app) as test_client:
        yield test_client


def test_rrf_result_sets_mode_and_model_headers(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [_chunk("rrf")])
    monkeypatch.setattr(search_router.embedder, "model_name", lambda: "bge-m3")
    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.status_code == 200
    assert resp.headers["x-search-mode"] == "rrf"
    assert resp.headers["x-embed-model"] == "bge-m3"
    # 헤더만 늘었을 뿐 배열 형태는 그대로다 — 프런트 호환.
    assert isinstance(resp.json(), list)


def test_bm25_result_sets_mode_header_without_model(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [_chunk("bm25")])
    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.headers["x-search-mode"] == "bm25"
    assert "x-embed-model" not in resp.headers


def test_empty_result_omits_both_headers(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [])
    resp = client.get("/search", params={"q": "존재하지않는어휘"})
    assert resp.json() == []
    assert "x-search-mode" not in resp.headers
    assert "x-embed-model" not in resp.headers


# ── 헤더 값 위생 (후속 정리) ────────────────────────────────────────────
# EMBED_MODEL은 환경변수라 무엇이든 들어올 수 있다. HTTP 헤더는 latin-1만 실을 수
# 있어서, 한글이 섞이면 응답을 내보내는 단계에서 터져 **검색 전체가 500이 됐다**.
# 모델명은 부가 표시일 뿐이므로 표시를 포기할지언정 검색을 죽이지 않는다.

def test_한글_임베딩_모델명이어도_검색이_죽지_않는다(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [_chunk("rrf")])
    monkeypatch.setattr(search_router.embedder, "model_name", lambda: "한글모델")

    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.status_code == 200
    assert len(resp.json()) == 1                       # 결과는 온전하다
    assert resp.headers["X-Search-Mode"] == "rrf"


def test_ascii_모델명은_그대로_실린다(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [_chunk("rrf")])
    monkeypatch.setattr(search_router.embedder, "model_name", lambda: "bge-m3:latest")

    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.headers["X-Embed-Model"] == "bge-m3:latest"


def test_섞여_있으면_실을_수_있는_부분만_남긴다(client, monkeypatch):
    monkeypatch.setattr(search_router, "search", lambda *a, **k: [_chunk("rrf")])
    monkeypatch.setattr(search_router.embedder, "model_name", lambda: "bge-m3-한글")

    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.status_code == 200
    assert resp.headers["X-Embed-Model"] == "bge-m3-"
