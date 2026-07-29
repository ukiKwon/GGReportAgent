import datetime
import json

import pytest

from collector.batch import write_batch
from collector.schema import validate_batch
from collector.sources.fixture import FixtureSource

NOW = datetime.datetime(2026, 7, 29, 9, 30, tzinfo=datetime.timezone.utc)


@pytest.fixture
def batch(tmp_path):
    return write_batch(FixtureSource(), FixtureSource().fetch(), tmp_path, now=NOW).path


def _rewrite_manifest(batch_dir, mutate):
    path = batch_dir / "manifest.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    mutate(manifest)
    path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")


def test_generated_batch_passes(batch):
    assert validate_batch(batch) == []


def test_missing_directory(tmp_path):
    assert validate_batch(tmp_path / "없음") == ["배치 디렉터리가 아닙니다: " + str(tmp_path / "없음")]


def test_missing_manifest(tmp_path):
    (tmp_path / "2026-07-29_0930_fixture").mkdir()
    assert validate_batch(tmp_path / "2026-07-29_0930_fixture") == ["manifest.json이 없습니다"]


def test_unsupported_schema_version_stops_immediately(batch):
    _rewrite_manifest(batch, lambda m: m.update(schema_version=99))
    errors = validate_batch(batch)
    assert errors == ["지원하지 않는 schema_version입니다: 99"]


def test_batch_id_folder_mismatch(batch):
    _rewrite_manifest(batch, lambda m: m.update(batch_id="2026-07-29_0930_other"))
    assert any("폴더명" in e for e in validate_batch(batch))


def test_bad_date_format_reported(batch):
    def mutate(manifest):
        manifest["records"][0]["schedule"]["contract_end"] = "2026/09/30"

    _rewrite_manifest(batch, mutate)
    assert any("YYYY-MM-DD가 아닙니다" in e for e in validate_batch(batch))


def test_bad_confidence_value_reported(batch):
    def mutate(manifest):
        manifest["records"][0]["schedule"]["confidence"] = "아마도"

    _rewrite_manifest(batch, mutate)
    assert any("confidence" in e for e in validate_batch(batch))


def test_duplicate_notice_id_reported(batch):
    def mutate(manifest):
        manifest["records"][1]["notice_id"] = manifest["records"][0]["notice_id"]

    _rewrite_manifest(batch, mutate)
    assert any("중복" in e for e in validate_batch(batch))


@pytest.mark.parametrize(
    "attachment", ["../탈출.txt", "/etc/passwd", "C:/windows/x.txt", "files/../../x.txt"]
)
def test_attachment_path_escape_reported(batch, attachment):
    def mutate(manifest):
        manifest["records"][0]["attachments"] = [attachment]

    _rewrite_manifest(batch, mutate)
    assert any("attachments" in e for e in validate_batch(batch))


def test_attachment_must_exist(batch):
    def mutate(manifest):
        manifest["records"][0]["attachments"] = ["files/없는파일.txt"]

    _rewrite_manifest(batch, mutate)
    assert any("파일이 없습니다" in e for e in validate_batch(batch))


def test_missing_csv_reported(batch):
    (batch / "institutions.csv").unlink()
    assert any("institutions.csv" in e for e in validate_batch(batch))


def test_missing_required_record_field(batch):
    def mutate(manifest):
        del manifest["records"][0]["evidence"]

    _rewrite_manifest(batch, mutate)
    assert any("evidence" in e for e in validate_batch(batch))
