"""구형 HWP 추출(collector/extract/hwp5.py) — 레코드·문단 해석과 거부 조건. 실제 공고 원본은 연락처가 있어 커밋하지 않는다."""
import zlib

import pytest

from collector.extract.hwp5 import HWPTAG_PARA_TEXT, _inflate, _para_text, _records, hwp5_text
from collector.extract.hwpx import ExtractError


def _rec(tag, payload):
    size = len(payload)
    if size >= 0xFFF:
        return (tag | (0xFFF << 20)).to_bytes(4, "little") + size.to_bytes(4, "little") + payload
    return (tag | (size << 20)).to_bytes(4, "little") + payload


def test_para_text_skips_controls():
    span = (2).to_bytes(2, "little") + b"\x00" * 14          # 확장 제어(16바이트)
    raw = "서울동부".encode("utf-16-le") + span + "지방법원".encode("utf-16-le") + (13).to_bytes(2, "little")
    assert _para_text(raw) == "서울동부지방법원\n"


def test_records_and_long_size():
    body = _rec(HWPTAG_PARA_TEXT, "가".encode("utf-16-le")) + _rec(99, b"x" * 5000)
    recs = list(_records(body))
    assert recs[0] == (HWPTAG_PARA_TEXT, "가".encode("utf-16-le")) and recs[1][0] == 99 and len(recs[1][1]) == 5000
    with pytest.raises(ExtractError):
        list(_records((HWPTAG_PARA_TEXT | (50 << 20)).to_bytes(4, "little") + b"short"))


def test_inflate_raw_deflate_and_cap(monkeypatch):
    c = zlib.compressobj(wbits=-15)
    data = c.compress(b"a" * 1000) + c.flush()
    assert _inflate(data) == b"a" * 1000
    monkeypatch.setattr("collector.extract.hwp5.MAX_SECTION_BYTES", 100)
    with pytest.raises(ExtractError):
        _inflate(data)


def test_rejects_non_ole_and_hwpx():
    with pytest.raises(ExtractError):
        hwp5_text(b"PK\x03\x04 hwpx is zip")
    with pytest.raises(ExtractError):
        hwp5_text(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 100)   # OLE 머리뿐 — 해석 실패
