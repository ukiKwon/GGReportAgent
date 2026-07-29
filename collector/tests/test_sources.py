import json

import pytest

from collector.sources import CollectedNotice, SourceError, get_source, list_sources
from collector.sources.fixture import FixtureSource


def test_default_fixture_source_is_registered():
    assert get_source("fixture").slug == "fixture"
    assert any(s["slug"] == "fixture" for s in list_sources())


def test_unknown_source_raises_keyerror():
    with pytest.raises(KeyError):
        get_source("없는소스")


def test_default_fixture_parses():
    notices = FixtureSource().fetch()
    assert len(notices) == 2
    first = notices[0]
    assert first.notice_id == "20260729-00123"
    assert first.institution_name_ko == "마포구청"
    assert first.confirmed is True
    assert first.attachments[0].filename == "공고문.txt"


def test_missing_fixture_file_raises_source_error(tmp_path):
    with pytest.raises(SourceError):
        FixtureSource(tmp_path / "없음.json").fetch()


def test_invalid_json_raises_source_error(tmp_path):
    path = tmp_path / "bad.json"
    path.write_text("{not json", encoding="utf-8")
    with pytest.raises(SourceError):
        FixtureSource(path).fetch()


def test_non_list_fixture_rejected(tmp_path):
    path = tmp_path / "obj.json"
    path.write_text('{"notice_id": "x"}', encoding="utf-8")
    with pytest.raises(SourceError):
        FixtureSource(path).fetch()


def test_bad_date_format_rejected(tmp_path):
    path = tmp_path / "baddate.json"
    path.write_text(
        json.dumps(
            [
                {
                    "notice_id": "1",
                    "title": "t",
                    "institution_name_ko": "구청",
                    "evidence_url": "https://x.invalid",
                    "posted_at": "2026/07/29",
                }
            ]
        ),
        encoding="utf-8",
    )
    with pytest.raises(SourceError, match="YYYY-MM-DD"):
        FixtureSource(path).fetch()


def test_blank_required_field_rejected():
    with pytest.raises(SourceError):
        CollectedNotice(
            notice_id="  ", title="t", institution_name_ko="구청",
            evidence_url="https://x.invalid",
        )
