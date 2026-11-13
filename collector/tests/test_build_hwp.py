import json
import sys

from collector.extract import build
from collector.extract.hwpx import ExtractError


def _raw(tmp_path, name="공고.hwp", blob=bytes.fromhex("d0cf11e0a1b11ae1") + b"xx"):
    d = tmp_path / "n"
    (d / "attachments").mkdir(parents=True)
    (d / "attachments" / "a1.hwp").write_bytes(blob)
    (d / "detail.html").write_text("<p>본문</p>", encoding="utf-8")
    (d / "meta.json").write_text(json.dumps({
        "source": "eminwon", "host": "h", "number": "1", "title": "서울특별시 마포구 금고지정 계획 공고",
        "posted_at": "2026-11-03", "detail_url": "https://x/1", "encoding": "utf-8",
        "attachments": [{"name": name, "stored": "attachments/a1.hwp"}],
        "unmaskable_attachments": [name],
        "institution": {"key": None, "name_ko": "기관", "region_code": None, "type": "지자체"}},
        ensure_ascii=False), encoding="utf-8")
    return d


def test_hwp_text_masked_and_used_but_file_not_shipped(tmp_path, monkeypatch):
    monkeypatch.setattr(build, "hwp5_text", lambda b: "문의 02-1234-5678 / 계약기간 3년")
    seen = {}
    real = build.build_candidate

    def spy(kind, posted_at, texts, *rest):
        seen["texts"] = texts
        return real(kind, posted_at, texts, *rest)
    monkeypatch.setattr(build, "build_candidate", spy)
    n = build.notice_from_raw(_raw(tmp_path), "r")
    assert n.attachments == () or list(n.attachments) == []
    origins = [o for o, _ in seen["texts"]]
    assert origins[0] == "hwp:공고.hwp" and origins[-1] == "상세 본문"
    assert all("1234-5678" not in t for _, t in seen["texts"])
    assert "첨부 미포함" in n.evidence_note


def test_hwp_failure_goes_to_notes_not_crash(tmp_path, monkeypatch):
    def boom(b):
        raise ExtractError("HWP를 읽을 수 없습니다(OSError)")
    monkeypatch.setattr(build, "hwp5_text", boom)
    n = build.notice_from_raw(_raw(tmp_path), "r")
    assert "HWP를 읽을 수 없습니다" in n.evidence_note


def test_hwp_without_olefile_goes_to_notes(tmp_path, monkeypatch):
    monkeypatch.setitem(sys.modules, "olefile", None)      # import olefile -> ImportError
    n = build.notice_from_raw(_raw(tmp_path), "r")
    assert "olefile" in n.evidence_note
