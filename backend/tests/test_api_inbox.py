"""반입 API — collector/SCHEMA.md §⑥ 2·4·5·6단계.

배치 픽스처는 collector의 배치 생성기로 만든다. **테스트가 계약의 양쪽을 실제로
잇는 유일한 지점**이라 손으로 쓴 manifest보다 낫다 — 수집기가 만들 수 없는 배치를
반입 테스트가 통과시키는 일이 생기지 않는다.

세 루트(inbox/rfp/batches)는 전부 tmp_path로 격리한다. 반입은 파일을 실제로
옮기므로 격리하지 않으면 테스트가 리포를 오염시킨다.
"""

import dataclasses
import datetime
import json

import pytest
from fastapi.testclient import TestClient

from backend.db import get_connection
from backend.inbox_import import InboxBatchError, resolve_batch_dir
from backend.main import create_app
from collector.batch import write_batch
from collector.sources.fixture import FixtureSource

NOW = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)
BATCH_ID = "2026-07-29_0930_fixture"


@pytest.fixture
def env(tmp_path):
    """앱 + 배치가 놓인 inbox. (client, db_path, inbox, rfp, batches)를 돌려준다."""
    inbox = tmp_path / "inbox"
    rfp = tmp_path / "rfp"
    batches = tmp_path / "batches"
    db_path = str(tmp_path / "test.db")
    app = create_app(
        db_path,
        output_root=str(tmp_path / "out"),
        inbox_root=str(inbox),
        rfp_root=str(rfp),
        batches_root=str(batches),
    )
    write_batch(FixtureSource(), FixtureSource().fetch(), inbox, now=NOW)
    with TestClient(app) as client:
        yield client, db_path, inbox, rfp, batches


def _rows(db_path, sql, params=()):
    conn = get_connection(db_path)
    try:
        return [dict(r) for r in conn.execute(sql, params)]
    finally:
        conn.close()


def test_validate_ok(env):
    client, *_ = env
    resp = client.post(f"/inbox/{BATCH_ID}/validate")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "errors": [], "batch_id": BATCH_ID}


def test_validate_does_not_change_state(env):
    client, db_path, inbox, _, _ = env
    client.post(f"/inbox/{BATCH_ID}/validate")
    assert _rows(db_path, "SELECT * FROM institutions") == []
    assert (inbox / BATCH_ID / "manifest.json").is_file()


@pytest.mark.parametrize("bad", ["not-a-batch", "2026-07-29_0930_FIXTURE", "배치"])
def test_rejects_bad_batch_id(env, bad):
    client, *_ = env
    assert client.post(f"/inbox/{bad}/validate").status_code == 400
    assert client.post(f"/inbox/{bad}/import").status_code == 400


@pytest.mark.parametrize("bad", ["../../etc", "C:/windows", "..", "", "a/b", "x\\y"])
def test_traversal_batch_ids_never_resolve(tmp_path, bad):
    """경로 이탈은 형식 검사(허용 목록)에서 구조적으로 막힌다.

    이 값들은 HTTP로 보내면 라우팅 단계에서 URL 정규화에 먼저 걸려 핸들러까지
    오지도 못한다(404). 그래서 실제 방어선인 resolve_batch_dir을 직접 부른다 —
    라우터가 바뀌어도 이 보장은 유지돼야 한다.
    """
    with pytest.raises(InboxBatchError) as exc:
        resolve_batch_dir(bad, tmp_path)
    assert exc.value.status == 400


def test_404_for_missing_batch(env):
    client, *_ = env
    missing = "2026-07-30_1200_fixture"
    assert client.post(f"/inbox/{missing}/validate").status_code == 404
    assert client.post(f"/inbox/{missing}/import").status_code == 404


def test_import_422_on_invalid_batch(env):
    client, db_path, inbox, _, batches = env
    (inbox / BATCH_ID / "manifest.json").write_text('{"schema_version": 99}', encoding="utf-8")

    resp = client.post(f"/inbox/{BATCH_ID}/import")
    assert resp.status_code == 422
    assert _rows(db_path, "SELECT * FROM institutions") == []
    assert (inbox / BATCH_ID).is_dir()  # 배치는 inbox에 남아 있어야 재시도할 수 있다
    assert not batches.exists()


def test_import_422_when_institution_unresolved(env):
    client, db_path, inbox, _, _ = env
    # manifest의 기관명만 CSV에 없는 값으로 바꾼다 — 배치가 계약(§④)을 어긴 상태.
    manifest_path = inbox / BATCH_ID / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["records"][1]["institution"]["name_ko"] = "없는구청"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")

    resp = client.post(f"/inbox/{BATCH_ID}/import")
    assert resp.status_code == 422
    # 첫 레코드까지 진행됐더라도 전부 롤백돼야 한다
    assert _rows(db_path, "SELECT * FROM institutions") == []
    assert _rows(db_path, "SELECT * FROM bid_cases") == []


def test_import_full_path(env):
    client, db_path, inbox, rfp, batches = env
    resp = client.post(f"/inbox/{BATCH_ID}/import")
    assert resp.status_code == 200
    body = resp.json()

    # ① 기관 upsert — 픽스처는 마포구청·종로구청 2건
    assert body["imported_institutions"] == 2
    names = {r["name_ko"] for r in _rows(db_path, "SELECT name_ko FROM institutions")}
    assert names == {"마포구청", "종로구청"}

    # ② bid_case 생성 — 공고 2건, 확정/예상이 각각 다른 컬럼에 들어간다
    assert len(body["bid_cases"]["created"]) == 2
    assert body["bid_cases"]["updated"] == []
    cases = {r["notice_id"]: r for r in _rows(db_path, "SELECT * FROM bid_cases")}
    mapo = cases["20260729-00123"]
    assert mapo["source_slug"] == "fixture"
    assert mapo["schedule_confidence"] == "확정"
    assert mapo["confirmed_date"] == "2026-08-19"  # deadline_at 우선
    assert mapo["expected_date"] is None
    assert mapo["participation_status"] == "검토중"
    assert mapo["notice_url"].endswith("20260729-00123")

    jongno = cases["20260729-00124"]
    assert jongno["schedule_confidence"] == "예상"
    assert jongno["expected_date"] == "2027-06-30"  # deadline_at 없음 → contract_end
    assert jongno["confirmed_date"] is None

    # ③ 첨부 이동 + rfp_path 기록 (첨부가 있는 것은 마포 공고뿐)
    assert (rfp / "20260729-00123_공고문.txt").is_file()
    assert len(body["rfp_files"]) == 1
    paths = {
        r["name_ko"]: r["rfp_path"]
        for r in _rows(db_path, "SELECT name_ko, rfp_path FROM institutions")
    }
    assert paths["마포구청"].endswith("20260729-00123_공고문.txt")
    assert paths["종로구청"] is None

    # ④ 배치 보관 — inbox는 "미처리만"이 문자 그대로 성립해야 한다
    assert not (inbox / BATCH_ID).exists()
    assert (batches / BATCH_ID / "manifest.json").is_file()

    # Task는 만들지 않는다 — 참여확정 + 코퍼스 완료라는 기존 규칙을 그대로 탄다
    assert _rows(db_path, "SELECT * FROM tasks") == []


def test_reimport_updates_same_bid_case(env, tmp_path):
    client, db_path, inbox, _, _ = env
    client.post(f"/inbox/{BATCH_ID}/import")
    before = {r["notice_id"]: r["bid_case_id"] for r in _rows(db_path, "SELECT * FROM bid_cases")}

    # 같은 공고를 다시 수집한다 — 종로 공고가 예상에서 확정으로 승격된 배치
    notices = FixtureSource().fetch()
    notices[1] = dataclasses.replace(notices[1], confirmed=True)
    later = write_batch(
        FixtureSource(), notices, inbox, now=NOW + datetime.timedelta(days=1)
    )

    resp = client.post(f"/inbox/{later.batch_id}/import")
    assert resp.status_code == 200
    assert resp.json()["bid_cases"]["created"] == []
    assert len(resp.json()["bid_cases"]["updated"]) == 2

    after = _rows(db_path, "SELECT * FROM bid_cases")
    assert len(after) == 2, "재수집이 새 bid_case를 만들면 안 된다"
    assert {r["notice_id"]: r["bid_case_id"] for r in after} == before

    jongno = next(r for r in after if r["notice_id"] == "20260729-00124")
    assert jongno["schedule_confidence"] == "확정"
    assert jongno["confirmed_date"] == "2027-06-30"
    # 예상값은 지우지 않는다 — "언제 예상했었나"가 남아야 한다
    assert jongno["expected_date"] == "2027-06-30"


def test_import_twice_is_404(env):
    client, *_ = env
    assert client.post(f"/inbox/{BATCH_ID}/import").status_code == 200
    # 성공하면 배치가 inbox에서 치워지므로 재호출은 404다 — 멱등성이 공짜로 따라온다
    assert client.post(f"/inbox/{BATCH_ID}/import").status_code == 404
