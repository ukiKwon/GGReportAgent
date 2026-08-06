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
    # 키는 다 채워 보낸다 — 화면이 "있을 때/없을 때"로 분기하지 않게 모양을 하나로 둔다.
    assert body == {"criteria": [], "total_score": 0, "teams": [], "pii_total": 0}


def test_unknown_institution_404(tmp_path):
    client = TestClient(_app(tmp_path))
    assert client.get("/institutions/ghost/coverage-map").status_code == 404


# ── PII는 항목이 아니라 팀 단위로 내려간다 (NEXT.md 항목 7의 근본 수정) ───

_SCORING = {"rfp_title": "공고", "total_score": 30, "criteria": [
    {"category": "사업", "item": "a", "score": 10, "description": None},
    {"category": "사업", "item": "b", "score": 10, "description": None},
    {"category": "기타", "item": "c", "score": 10, "description": None}]}


def test_팀별_pii와_합계를_준다(tmp_path):
    _write(tmp_path, scoring=_SCORING, coverage={"version": 2, "items": {
        "a": {"team": "전산", "covered": True, "gap_note": None},
        "b": {"team": "전산", "covered": True, "gap_note": None},
        "c": {"team": "예산", "covered": False, "gap_note": "부족"},
    }, "teams": {"전산": {"pii_count": 3}, "예산": {"pii_count": 1}}})

    body = TestClient(_app(tmp_path)).get("/institutions/nowon/coverage-map").json()

    assert body["teams"] == [{"team": "예산", "pii_count": 1}, {"team": "전산", "pii_count": 3}]
    # 항목이 2개인 전산팀이 3건 그대로 — 예전에는 항목 수만큼 부풀었다.
    assert body["pii_total"] == 4


def test_항목에는_pii가_실리지_않는다(tmp_path):
    """실리면 읽는 쪽이 또 합산한다 — 그게 3건·12항목 → 36건의 원인이었다."""
    _write(tmp_path, scoring=_SCORING, coverage={"version": 2, "items": {
        "a": {"team": "전산", "covered": True, "gap_note": None}},
        "teams": {"전산": {"pii_count": 3}}})

    body = TestClient(_app(tmp_path)).get("/institutions/nowon/coverage-map").json()
    assert all("pii_count" not in c for c in body["criteria"])


def test_배점표에서_사라진_팀은_싣지_않는다(tmp_path):
    """배점표를 다시 뽑아 그 팀 배정이 없어지면 stale 값이 남는다 — 화면에
    유령 팀으로 뜨지 않게 현재 배정된 팀만 내려준다."""
    _write(tmp_path, scoring=_SCORING, coverage={"version": 2, "items": {
        "a": {"team": "전산", "covered": True, "gap_note": None}},
        "teams": {"전산": {"pii_count": 3}, "영업": {"pii_count": 9}}})

    body = TestClient(_app(tmp_path)).get("/institutions/nowon/coverage-map").json()
    assert [t["team"] for t in body["teams"]] == ["전산"]
    assert body["pii_total"] == 3


def test_옛_형식_파일도_그대로_열린다(tmp_path):
    """이미 만들어진 산출물이 있는 배포를 깨지 않는다 — 읽을 때 v2로 올린다."""
    _write(tmp_path, scoring=_SCORING, coverage={
        "a": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 3},
        "b": {"team": "전산", "covered": True, "gap_note": None, "pii_count": 3}})

    body = TestClient(_app(tmp_path)).get("/institutions/nowon/coverage-map").json()
    assert body["criteria"][0]["team"] == "전산"
    assert body["pii_total"] == 3          # 복제값 2개가 1건으로
