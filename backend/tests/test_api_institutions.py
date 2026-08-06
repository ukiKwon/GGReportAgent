import pytest
from fastapi.testclient import TestClient

from backend.main import create_app


def test_list_institutions_empty(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)

    response = client.get("/institutions")

    assert response.status_code == 200
    assert response.json() == []


def test_import_then_get_detail(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)
    csv_text = (
        "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일\n"
        "테스트구청,지자체,11,4,2022-12-30,\n"
    )
    files = {"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")}

    import_response = client.post("/institutions/import", files=files)

    assert import_response.status_code == 200
    body = import_response.json()
    assert body["imported"] == 1
    institution_id = body["institution_ids"][0]

    detail_response = client.get(f"/institutions/{institution_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["name_ko"] == "테스트구청"


def test_get_institution_404(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)

    response = client.get("/institutions/does-not-exist")

    assert response.status_code == 404


def test_import_malformed_csv_returns_400_not_500(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)
    csv_text = "기관명,입찰주기\n테스트구청,4년\n"
    files = {"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")}

    response = client.post("/institutions/import", files=files)

    assert response.status_code == 400
    assert "row 1" in response.json()["detail"]


def test_import_rolls_back_all_rows_on_partial_failure(tmp_path, monkeypatch):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)

    import backend.routers.institutions as institutions_module

    original_upsert = institutions_module.upsert_institution
    call_count = {"n": 0}

    def flaky_upsert(conn, row, commit=True):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated failure on second row")
        return original_upsert(conn, row, commit=commit)

    monkeypatch.setattr(institutions_module, "upsert_institution", flaky_upsert)

    csv_text = "기관명\n가구청\n나구청\n"
    files = {"file": ("import.csv", csv_text.encode("utf-8-sig"), "text/csv")}

    with pytest.raises(RuntimeError):
        client.post("/institutions/import", files=files)

    list_response = client.get("/institutions")
    assert list_response.json() == []


def test_get_artifacts_returns_paths(tmp_path):
    app = create_app(str(tmp_path / "registry.db"))
    client = TestClient(app)
    files = {
        "file": (
            "import.csv",
            "기관명,기관구분\n테스트구청,지자체\n".encode("utf-8-sig"),
            "text/csv",
        )
    }
    import_response = client.post("/institutions/import", files=files)
    institution_id = import_response.json()["institution_ids"][0]

    response = client.get(f"/institutions/{institution_id}/artifacts")

    assert response.status_code == 200
    assert response.json() == {
        "giganlist_dir": None,
        "rfp_path": None,
        "pptx_path": None,
    }


# ── B 이월 해소: 값을 비우는 것과 안 건드리는 것을 구분한다 ──────────────
# 예전에는 `COALESCE(?, 기존값)`이라 NULL과 "미전송"이 같았다 — `term`은 한 번
# 넣으면 비울 방법이 아예 없었고, 문자열만 ""로 비워지는 비대칭이 있었다.

def _seeded(tmp_path):
    """기관 1건을 넣고 (client, institution_id)를 돌려준다."""
    client = TestClient(create_app(str(tmp_path / "registry.db")))
    csv_text = "\n".join([
        "기관명,기관구분,지역코드,입찰주기,지난입찰일,입찰예상일",
        "테스트구청,지자체,11,4,2022-05-01,",
        "",
    ])
    body = client.post("/institutions/import",
                       files={"file": ("i.csv", csv_text.encode("utf-8-sig"), "text/csv")}).json()
    return client, body["institution_ids"][0]


def test_null을_보내면_term이_지워진다(tmp_path):
    client, iid = _seeded(tmp_path)
    body = client.put(f"/institutions/{iid}", json={"term": None}).json()
    assert body["term"] is None
    assert body["type"] == "지자체"          # 안 보낸 필드는 그대로


def test_안_보낸_필드는_보존된다(tmp_path):
    client, iid = _seeded(tmp_path)
    body = client.put(f"/institutions/{iid}", json={"type": "공공기관"}).json()
    assert body["type"] == "공공기관" and body["term"] == 4


def test_빈_본문은_아무것도_바꾸지_않는다(tmp_path):
    client, iid = _seeded(tmp_path)
    body = client.put(f"/institutions/{iid}", json={}).json()
    assert body["term"] == 4 and body["type"] == "지자체"


def test_빈_문자열도_지움으로_본다(tmp_path):
    """화면에서 입력칸을 비운 것이 곧 지우려는 뜻이다 — 숫자와 같게 동작해야 한다."""
    client, iid = _seeded(tmp_path)
    body = client.put(f"/institutions/{iid}", json={"last_bid": ""}).json()
    assert body["last_bid"] is None
