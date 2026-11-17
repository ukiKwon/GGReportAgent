"""checks[] 형식 검사(SCHEMA.md ④-2) — BatchSchemaChecksTest.java 와 같은 입력·기대. NEXT 90 1단계."""
import json

import pytest

from contract.batch_schema import validate_batch

BATCH_ID = "2026-11-17_0700_extcheck-daily"
SHA = "a" * 64


def _check(**over):
    c = {"check_id": "c-0001", "institution": {"name_ko": "가구청", "region_code": "11"},
         "status": "found", "checked_at": "2026-11-17T07:02:11+09:00", "source_kind": "notice",
         "source_slug": "eminwon", "match": {"confidence": "high", "basis": ["domain_match"]},
         "notice": {"title": "금고 공고", "deadline_at": "2026-12-02"},
         "attachments": [{"path": "files/c-0001_1.pdf", "sha256": SHA, "size": 10}]}
    c.update(over)
    return {k: v for k, v in c.items() if v is not None}


def _batch(tmp_path, checks, minor=1, files=("c-0001_1.pdf",), records=None, slug="extcheck-daily", batch_id=BATCH_ID):
    d = tmp_path / batch_id
    (d / "files").mkdir(parents=True)
    (d / "institutions.csv").write_text("h\n", encoding="utf-8")
    for name in files:
        (d / "files" / name).write_bytes(b"x")
    m = {"schema_version": 1, "batch_id": batch_id, "collected_at": "2026-11-17T07:00:05+09:00",
         "source": {"slug": slug}, "records": records or []}
    if minor is not None:
        m["schema_minor"] = minor
    if checks is not None:
        m["checks"] = checks
    (d / "manifest.json").write_text(json.dumps(m, ensure_ascii=False), encoding="utf-8")
    return d


def test_valid_checks_pass(tmp_path):
    assert validate_batch(_batch(tmp_path, [_check()])) == []


def test_not_found_and_error_need_no_notice(tmp_path):
    cs = [_check(check_id="c-2", status="not_found", match=None, notice=None, attachments=None),
          _check(check_id="c-3", status="error", error_code="timeout", match=None, notice=None, attachments=None)]
    assert validate_batch(_batch(tmp_path, cs, files=())) == []


@pytest.mark.parametrize("minor", [None, 0, 2, "1", True])
def test_checks_without_supported_minor_is_rejected(tmp_path, minor):
    errors = validate_batch(_batch(tmp_path, [_check()], minor=minor))
    assert len(errors) == 1 and errors[0].startswith("UNSUPPORTED_MINOR")


def test_no_checks_and_unknown_minor_is_fine(tmp_path):
    assert validate_batch(_batch(tmp_path, None, minor=9)) == []


@pytest.mark.parametrize("cid", ["../x", "a/b", "한글", "", "a" * 41, "a b"])
def test_bad_check_id(tmp_path, cid):
    errors = validate_batch(_batch(tmp_path, [_check(check_id=cid)]))
    assert any("check_id" in e for e in errors)
    assert not any(cid and cid in e for e in errors)      # 받은 값이 문구에 없다


def test_duplicate_check_id_case_insensitive(tmp_path):
    cs = [_check(), _check(check_id="C-0001", attachments=None)]
    assert any("중복" in e for e in validate_batch(_batch(tmp_path, cs)))


@pytest.mark.parametrize("path,token", [
    ("files/한글.pdf", "한글"), ("files/a:b.pdf", "a:b"), ("files/CON.pdf", "CON"), ("files/a.exe", "a.exe"),
    ("files/../zzq.pdf", "zzq"), ("/etc/zzq.pdf", "zzq"), ("files/a b.pdf", "a b"),
    ("files/.hid.pdf", ".hid"), ("files/x.PDF", "x.PDF"), ("files/" + "a" * 90 + ".pdf", "a" * 90)])
def test_bad_attachment_path(tmp_path, path, token):
    c = _check(attachments=[{"path": path, "sha256": SHA, "size": 10}])
    errors = validate_batch(_batch(tmp_path, [c]))
    assert any(".path" in e for e in errors)
    assert not any(token in e for e in errors)


def test_missing_attachment_file(tmp_path):
    errors = validate_batch(_batch(tmp_path, [_check()], files=()))
    assert any("파일이 없습니다" in e for e in errors)


def test_bad_sha_size_and_count(tmp_path):
    bad = _check(attachments=[{"path": "files/c-0001_1.pdf", "sha256": "ZZ", "size": 0}])
    errors = validate_batch(_batch(tmp_path, [bad]))
    assert any("sha256" in e for e in errors) and any(".size" in e for e in errors)
    many = _check(attachments=[{"path": f"files/c-0001_{i}.pdf", "sha256": SHA, "size": 1} for i in range(6)])
    assert any("건수 상한" in e for e in validate_batch(_batch(tmp_path / "x", [many], files=())))


def test_records_attachment_message_has_no_received_value(tmp_path):
    rec = {"notice_id": "N-1", "title": "t", "institution": {"name_ko": "구청"}, "evidence": {"url": "u"},
           "attachments": ["files/../../zzq/passwd"]}
    errors = validate_batch(_batch(tmp_path, None, minor=None, records=[rec]))
    assert any("상위 경로 참조" in e for e in errors)
    assert not any("zzq" in e or "passwd" in e for e in errors)


@pytest.mark.parametrize("slug", ["lofin365", "xextcheck", "Extcheck", 123])
def test_checks_batch_needs_extcheck_slug(tmp_path, slug):
    errors = validate_batch(_batch(tmp_path, [_check()], slug=slug))
    assert any("source.slug" in e for e in errors)
    assert not any(str(slug) in e for e in errors)


def test_checks_batch_id_must_contain_extcheck(tmp_path):
    errors = validate_batch(_batch(tmp_path, [_check()], batch_id="2026-11-17_0700_lofin365"))
    assert any("batch_id" in e for e in errors) and not any("lofin365" in e for e in errors)


def test_batch_without_checks_keeps_any_slug(tmp_path):
    d = _batch(tmp_path, None, minor=None, files=(), slug="lofin365", batch_id="2026-11-17_0700_lofin365")
    assert validate_batch(d) == []


def test_unreadable_manifest_message_is_fixed(tmp_path):
    d = tmp_path / BATCH_ID
    d.mkdir()
    (d / "manifest.json").write_text('{"zzq": ', encoding="utf-8")
    assert validate_batch(d) == ["manifest.json을 읽을 수 없습니다"]
