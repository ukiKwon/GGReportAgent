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
