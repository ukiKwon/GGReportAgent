import datetime
import json

import pytest

from collector.batch import BatchError, build_csv, write_batch
from collector.sources.base import AttachmentRef, CollectedNotice
from collector.sources.fixture import FixtureSource

NOW = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)


def _notice(**kwargs):
    base = dict(
        notice_id="20260729-00123",
        title="마포구 금고 지정 공고",
        institution_name_ko="마포구청",
        evidence_url="https://example.invalid/n/1",
    )
    base.update(kwargs)
    return CollectedNotice(**base)


def test_write_batch_creates_schema_compliant_folder(tmp_path):
    result = write_batch(FixtureSource(), FixtureSource().fetch(), tmp_path, now=NOW)

    assert result.batch_id == "2026-07-29_0930_fixture"
    assert result.path == tmp_path / result.batch_id
    assert result.record_count == 2
    assert (result.path / "manifest.json").is_file()
    assert (result.path / "institutions.csv").is_file()
    assert (result.path / "files" / "20260729-00123_공고문.txt").is_file()


def test_manifest_has_no_bom_and_csv_has_bom(tmp_path):
    result = write_batch(FixtureSource(), FixtureSource().fetch(), tmp_path, now=NOW)
    assert not (result.path / "manifest.json").read_bytes().startswith(b"\xef\xbb\xbf")
    assert (result.path / "institutions.csv").read_bytes().startswith(b"\xef\xbb\xbf")


def test_manifest_omits_unknown_values_instead_of_blanks(tmp_path):
    result = write_batch(FixtureSource(), [_notice()], tmp_path, now=NOW)
    manifest = json.loads((result.path / "manifest.json").read_text(encoding="utf-8"))
    schedule = manifest["records"][0]["schedule"]
    assert schedule == {"confidence": "예상"}  # 모르는 날짜 키는 아예 없다
    assert "type" not in manifest["records"][0]["institution"]


def test_batch_id_matches_folder_name(tmp_path):
    result = write_batch(FixtureSource(), [_notice()], tmp_path, now=NOW)
    manifest = json.loads((result.path / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["batch_id"] == result.path.name


def test_unsafe_attachment_filename_rejected_and_nothing_left_behind(tmp_path):
    notice = _notice(attachments=(AttachmentRef("../탈출.txt", b"x"),))
    with pytest.raises(BatchError, match="안전하지 않"):
        write_batch(FixtureSource(), [notice], tmp_path, now=NOW)
    assert list(tmp_path.iterdir()) == []


def test_duplicate_batch_id_rejected(tmp_path):
    write_batch(FixtureSource(), [_notice()], tmp_path, now=NOW)
    with pytest.raises(BatchError, match="이미 있습니다"):
        write_batch(FixtureSource(), [_notice()], tmp_path, now=NOW)


def test_self_check_failure_removes_batch(tmp_path, monkeypatch):
    monkeypatch.setattr("collector.batch.validate_batch", lambda _: ["일부러 실패"])
    with pytest.raises(BatchError, match="자기검사 실패"):
        write_batch(FixtureSource(), [_notice()], tmp_path, now=NOW)
    assert list(tmp_path.iterdir()) == []


def test_csv_merges_records_of_same_institution_confirmed_wins():
    records = [
        {
            "institution": {"name_ko": "마포구청", "type": "지자체"},
            "schedule": {"confidence": "예상", "posted_at": "2026-07-01",
                         "contract_end": "2027-01-01"},
            "evidence": {"url": "https://a.invalid"},
        },
        {
            "institution": {"name_ko": "마포구청", "type": "지자체"},
            "schedule": {"confidence": "확정", "posted_at": "2026-06-01",
                         "contract_end": "2026-09-30"},
            "evidence": {"url": "https://b.invalid"},
        },
    ]
    lines = build_csv(records, collected_at="2026-07-29T09:30:00+00:00").splitlines()
    assert len(lines) == 2  # 헤더 + 1행 (기관당 1행)
    row = lines[1]
    assert "2026-09-30" in row  # 확정 레코드가 이겼다
    assert "https://a.invalid;https://b.invalid" in row
    assert row.endswith("2026-07-29")


def test_csv_tie_breaks_on_latest_posted_at():
    records = [
        {
            "institution": {"name_ko": "종로구청"},
            "schedule": {"confidence": "예상", "posted_at": "2026-05-01",
                         "contract_end": "2027-01-01"},
            "evidence": {"url": "https://a.invalid"},
        },
        {
            "institution": {"name_ko": "종로구청"},
            "schedule": {"confidence": "예상", "posted_at": "2026-07-01",
                         "contract_end": "2027-06-30"},
            "evidence": {"url": "https://b.invalid"},
        },
    ]
    row = build_csv(records, collected_at="2026-07-29T00:00:00+00:00").splitlines()[1]
    assert "2027-06-30" in row


def test_csv_leaves_coordinates_empty():
    records = [
        {
            "institution": {"name_ko": "마포구청"},
            "schedule": {"confidence": "확정"},
            "evidence": {"url": "https://a.invalid"},
        }
    ]
    cells = build_csv(records, collected_at="2026-07-29T00:00:00+00:00").splitlines()[1].split(",")
    assert cells[8] == "" and cells[9] == ""  # 경도/위도
