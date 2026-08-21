import pytest
from fastapi.testclient import TestClient

from agent.retrieval import build_index
from server.main import create_app


@pytest.fixture
def index_db(tmp_path):
    root = tmp_path / "corpus"
    spec = root / "institutions" / "dobong" / "spec"
    spec.mkdir(parents=True)
    (spec / "02_사업목록.txt").write_text("청년 창업 지원 센터 운영", encoding="utf-8")
    plan = root / "institutions" / "dobong" / "plan"
    plan.mkdir(parents=True)
    (plan / "02_IT디지털기획_사업제안.txt").write_text("IT-1 청년 창업 플랫폼", encoding="utf-8")
    db = tmp_path / "corpus_index.db"
    build_index(root, db)
    return db


@pytest.fixture
def client(tmp_path, index_db):
    app = create_app(str(tmp_path / "test.db"), index_db_path=str(index_db))
    with TestClient(app) as test_client:
        yield test_client


def test_search_returns_chunks(client):
    resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["path"].startswith("corpus/institutions/dobong/")
    assert {"chunk_no", "text", "score", "institution_id", "doctype", "filename"} <= set(body[0])


def test_search_doctype_filter(client):
    resp = client.get("/search", params={"q": "청년 창업", "doctype": "plan"})
    assert resp.status_code == 200
    assert [c["doctype"] for c in resp.json()] == ["plan"]


def test_search_no_match_returns_empty_list(client):
    resp = client.get("/search", params={"q": "존재하지않는어휘"})
    assert resp.status_code == 200
    assert resp.json() == []


def test_search_503_when_index_missing(tmp_path):
    app = create_app(str(tmp_path / "test.db"), index_db_path=str(tmp_path / "없음.db"))
    with TestClient(app) as client:
        resp = client.get("/search", params={"q": "청년 창업"})
    assert resp.status_code == 503
    assert "build" in resp.json()["detail"]
