import json

from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.main import create_app


def _app(tmp_path):
    app = create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                     graph_db_path=str(tmp_path / "g.db"))
    conn = get_connection(str(tmp_path / "r.db"))
    conn.execute("INSERT INTO institutions (institution_id, name_ko, stage) VALUES ('nowon','노원구',6)")
    conn.commit(); conn.close()
    return app


def _write(tmp_path, scoring=None, coverage=None):
    out = tmp_path / "out" / "노원구"
    out.mkdir(parents=True, exist_ok=True)
    if scoring is not None:
        (out / "rfp_scoring.json").write_text(json.dumps(scoring, ensure_ascii=False), encoding="utf-8")
    if coverage is not None:
        (out / "coverage_map.json").write_text(json.dumps(coverage, ensure_ascii=False), encoding="utf-8")


def test_merges_scoring_with_coverage(tmp_path):
    _write(tmp_path,
           scoring={"rfp_title": "공고", "total_score": 30, "criteria": [
               {"category": "사업", "item": "전산 시스템", "score": 20, "description": None},
               {"category": "기타", "item": "지역 기여", "score": 10, "description": None}]},
           coverage={"전산 시스템": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 0}})
    client = TestClient(_app(tmp_path))

    body = client.get("/institutions/nowon/coverage-map").json()
    assert body["total_score"] == 30
    first, second = body["criteria"]
    assert first["item"] == "전산 시스템" and first["team"] == "전산" and first["covered"] is True
    assert second["item"] == "지역 기여" and second["team"] is None and second["covered"] is False


def test_no_scoring_returns_empty(tmp_path):
    client = TestClient(_app(tmp_path))
    body = client.get("/institutions/nowon/coverage-map").json()
    assert body == {"criteria": [], "total_score": 0}


def test_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.get("/institutions/ghost/coverage-map").status_code == 404
