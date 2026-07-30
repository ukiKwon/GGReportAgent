import datetime
import io
import zipfile

import httpx
import pytest

from collector.batch import write_batch
from collector.bridge import BridgeError, carry_batch
from collector.sources.fixture import FixtureSource

NOW = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)
BATCH_ID = "2026-07-29_0930_fixture"


@pytest.fixture
def dmz_batch(tmp_path):
    return write_batch(FixtureSource(), FixtureSource().fetch(), tmp_path / "dmz", now=NOW).path


def _zip_of(batch_dir) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for path in sorted(batch_dir.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(batch_dir).as_posix())
    return buffer.getvalue()


IMPORT_PATH = f"/inbox/{BATCH_ID}/import"
IMPORT_RESULT = {
    "batch_id": BATCH_ID,
    "imported_institutions": 2,
    "institution_ids": ["a", "b"],
    "bid_cases": {"created": ["bc-1"], "updated": []},
    "rfp_files": [],
    "archived_to": f"data/batches/{BATCH_ID}",
}


def _client(archive: bytes, *, import_status=200, calls=None):
    def handler(request: httpx.Request) -> httpx.Response:
        if calls is not None:
            calls.append(request)
        if request.url.path.endswith("/archive"):
            return httpx.Response(200, content=archive)
        if request.url.path == IMPORT_PATH:
            return httpx.Response(import_status, json=IMPORT_RESULT)
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_carry_batch_places_and_imports(dmz_batch, tmp_path):
    calls = []
    inbox = tmp_path / "inbox"
    with _client(_zip_of(dmz_batch), calls=calls) as client:
        result = carry_batch(BATCH_ID, inbox=inbox, client=client)

    assert (inbox / BATCH_ID / "manifest.json").is_file()
    assert (inbox / BATCH_ID / "institutions.csv").is_file()
    assert (inbox / BATCH_ID / "files" / "20260729-00123_공고문.txt").is_file()
    assert result["imported"] == IMPORT_RESULT

    # DMZ(8001)에서 받아 망 안(8000)으로 던진다 — 포트만 다른 같은 호스트
    paths = [c.url.path for c in calls]
    assert f"/batches/{BATCH_ID}/archive" in paths
    assert IMPORT_PATH in paths

    # 반입 요청에는 batch_id만 실린다 — 파일을 다시 올리지 않는다(망 안이 자기
    # 파일시스템의 inbox를 읽는다). 본문이 있으면 경계 모델이 깨진 것이다.
    import_call = next(c for c in calls if c.url.path == IMPORT_PATH)
    assert import_call.content == b""


def test_no_import_flag_stops_after_inbox(dmz_batch, tmp_path):
    calls = []
    inbox = tmp_path / "inbox"
    with _client(_zip_of(dmz_batch), calls=calls) as client:
        result = carry_batch(BATCH_ID, inbox=inbox, do_import=False, client=client)

    assert result["imported"] is None
    assert (inbox / BATCH_ID / "manifest.json").is_file()
    assert IMPORT_PATH not in [c.url.path for c in calls]


def test_existing_batch_in_inbox_is_refused(dmz_batch, tmp_path):
    inbox = tmp_path / "inbox"
    (inbox / BATCH_ID).mkdir(parents=True)
    with _client(_zip_of(dmz_batch)) as client:
        with pytest.raises(BridgeError, match="이미 inbox에"):
            carry_batch(BATCH_ID, inbox=inbox, client=client)


def test_dmz_error_is_reported(tmp_path):
    def handler(request):
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BridgeError, match="받지 못했습니다"):
            carry_batch(BATCH_ID, inbox=tmp_path / "inbox", client=client)


def test_invalid_batch_is_not_left_in_inbox(dmz_batch, tmp_path):
    # manifest를 망가뜨린 배치를 내려보내면 inbox에 남기지 않아야 한다.
    (dmz_batch / "manifest.json").write_text('{"schema_version": 99}', encoding="utf-8")
    inbox = tmp_path / "inbox"
    with _client(_zip_of(dmz_batch)) as client:
        with pytest.raises(BridgeError, match="검증 실패"):
            carry_batch(BATCH_ID, inbox=inbox, client=client)
    assert not (inbox / BATCH_ID).exists()


def test_zip_path_escape_is_refused(tmp_path):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("../탈출.txt", "x")
    inbox = tmp_path / "inbox"
    with _client(buffer.getvalue()) as client:
        with pytest.raises(BridgeError, match="경로 이탈"):
            carry_batch(BATCH_ID, inbox=inbox, client=client)
    assert not (inbox / BATCH_ID).exists()


def test_backend_import_failure_is_reported(dmz_batch, tmp_path):
    with _client(_zip_of(dmz_batch), import_status=400) as client:
        with pytest.raises(BridgeError, match="반입 실패"):
            carry_batch(BATCH_ID, inbox=tmp_path / "inbox", client=client)
