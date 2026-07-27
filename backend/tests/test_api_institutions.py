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
