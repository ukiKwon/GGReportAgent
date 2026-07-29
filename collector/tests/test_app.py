import datetime
import io
import zipfile

import pytest
from fastapi.testclient import TestClient

from collector.app import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(out_root=str(tmp_path / "out"))) as test_client:
        yield test_client


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_sources_lists_fixture(client):
    slugs = [s["slug"] for s in client.get("/sources").json()]
    assert "fixture" in slugs


def test_collect_creates_batch(client):
    resp = client.post("/collect", json={"source": "fixture"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["records"] == 2
    assert body["batch_id"].endswith("_fixture")


def test_collect_unknown_source_404(client):
    resp = client.post("/collect", json={"source": "없는소스"})
    assert resp.status_code == 404


def test_batches_lists_after_collect(client):
    batch_id = client.post("/collect", json={"source": "fixture"}).json()["batch_id"]
    listing = client.get("/batches").json()
    assert [b["batch_id"] for b in listing] == [batch_id]
    assert listing[0]["record_count"] == 2


def test_batch_manifest_roundtrip(client):
    batch_id = client.post("/collect", json={"source": "fixture"}).json()["batch_id"]
    manifest = client.get(f"/batches/{batch_id}").json()
    assert manifest["batch_id"] == batch_id
    assert manifest["schema_version"] == 1
    assert len(manifest["records"]) == 2


def test_unknown_batch_404(client):
    assert client.get("/batches/2026-01-01_0000_nope").status_code == 404


def test_batch_id_traversal_rejected(client):
    assert client.get("/batches/..%2F..%2Fetc").status_code == 404


def test_archive_contains_whole_batch(client):
    batch_id = client.post("/collect", json={"source": "fixture"}).json()["batch_id"]
    resp = client.get(f"/batches/{batch_id}/archive")
    assert resp.status_code == 200

    with zipfile.ZipFile(io.BytesIO(resp.content)) as archive:
        names = set(archive.namelist())
    assert {"manifest.json", "institutions.csv"} <= names
    assert any(n.startswith("files/") for n in names)


def test_collect_twice_in_same_minute_reports_conflict(client, monkeypatch):
    # batch_id는 분 단위라 같은 분의 재수집은 충돌한다 — 조용히 덮지 않고 422로 알린다.
    fixed = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr("collector.batch._now", lambda: fixed)

    assert client.post("/collect", json={"source": "fixture"}).status_code == 200
    resp = client.post("/collect", json={"source": "fixture"})
    assert resp.status_code == 422
    assert "이미 있습니다" in resp.json()["detail"]
