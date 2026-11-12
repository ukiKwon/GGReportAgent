"""연락처 마스킹·반입 백신 판정(사용자 결정 2026-11-12, NEXT 80).

- 담당자 연락처는 **모두 가린다**: 원문 보관본(상세 HTML)·hwpx 첨부 본문·배치 텍스트·근거 문장.
  안을 고칠 수 없는 PDF·구형 HWP는 원문 보관소(망 밖)에만 두고, 망 안으로 가는 배치에는 싣지 않는다.
- 첨부 반입 백신: **https + 국가기관(go.kr)·광역 지자체 공식 도메인(seoul.kr·incheon.kr·gwangju.kr·ulsan.kr)**이면
  생략, 그 외(목록 밖 도메인이거나 http)는 반입 전에 사용자 확인.
"""

from __future__ import annotations

import io
import re
import zipfile
import zlib
from urllib.parse import urlsplit

MASK = "[연락처 가림]"
# 전화(지역번호·휴대전화·대표번호), 괄호형 지역번호, 이메일. 날짜(2026-11-12)·공고번호(제2026-123호)는 건드리지 않는다.
_PHONE = re.compile(
    r"(?<![\d-])(?:\(?0(?:2|[3-6][1-5]|70|50\d?|1[016789])\)?[\s.\-~]?\d{3,4}[\s.\-]\d{4}"
    r"|1[5-9]\d{2}[\s.\-]\d{4})(?![\d-])")
_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# 국가기관(go.kr) + 광역 지자체 공식 도메인(사용자 결정 11-12: https면 백신 생략 — 지자체 공식 고시공고 시스템).
GOV_SUFFIXES = (".go.kr", ".seoul.kr", ".incheon.kr", ".gwangju.kr", ".ulsan.kr")


def mask_contacts(text: str) -> tuple[str, int]:
    """(가린 글, 가린 개수)."""
    n = 0

    def sub(_m):
        nonlocal n
        n += 1
        return MASK

    text = _EMAIL.sub(sub, text)
    text = _PHONE.sub(sub, text)
    return text, n


MAX_HWPX_ENTRIES = 500          # zip 폭탄 방어 — 항목 수·합계는 extract/hwpx.py와 같은 상한(security 11-12)


def mask_hwpx(data: bytes) -> tuple[bytes, int]:
    """hwpx 안 Contents/*.xml·Preview/PrvText.txt의 연락처를 가린 새 hwpx. 첫 쪽 미리보기 그림(Preview/PrvImage.*)은
    가릴 수 없어 뺀다(한글은 미리보기 없이도 연다). 읽을 수 없거나 너무 크면 ValueError."""
    from collector.extract.hwpx import MAX_TOTAL_BYTES, ExtractError, _read_capped
    try:
        src = zipfile.ZipFile(io.BytesIO(data))
        infos = src.infolist()
        if len(infos) > MAX_HWPX_ENTRIES:
            raise ExtractError("hwpx 항목이 너무 많습니다")
        out = io.BytesIO()
        total, budget = 0, MAX_TOTAL_BYTES
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in infos:
                name = info.filename
                if name.startswith("Preview/PrvImage"):
                    continue                       # 그림 속 연락처는 가릴 수 없다
                blob = _read_capped(src, info, budget)
                budget -= len(blob)
                if (name.startswith("Contents/") and name.endswith(".xml")) or name == "Preview/PrvText.txt":
                    text, n = mask_contacts(blob.decode("utf-8", errors="replace"))
                    total += n
                    blob = text.encode("utf-8")
                ctype = zipfile.ZIP_STORED if name == "mimetype" else zipfile.ZIP_DEFLATED
                dst.writestr(name, blob, compress_type=ctype)
        return out.getvalue(), total
    except (zipfile.BadZipFile, zipfile.LargeZipFile, zlib.error, NotImplementedError, ExtractError,
            RuntimeError, OSError, EOFError) as exc:
        raise ValueError(f"hwpx 마스킹 실패({type(exc).__name__})") from exc


def vaccine_policy(url_or_host: str, scheme: str | None = None, *, relaxed: bool = False) -> str:
    """'생략' 또는 '사용자 확인'. https + 공식 도메인만 생략.
    TLS 예외(ca_extra·ciphers·pin_sha256) 호스트는 도메인과 무관하게 '사용자 확인'(security 11-12)."""
    if relaxed:
        return "사용자 확인"
    host = url_or_host
    if "://" in url_or_host:
        p = urlsplit(url_or_host)               # 사용자 정보(x.go.kr:p@evil.com)에 속지 않게 표준 해석(security 11-12)
        scheme, host = p.scheme, p.hostname or ""
    host = host.lower().split(":")[0]
    if scheme == "https" and host.endswith(GOV_SUFFIXES):
        return "생략"
    return "사용자 확인"
