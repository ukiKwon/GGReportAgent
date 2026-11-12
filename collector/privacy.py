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


def mask_hwpx(data: bytes) -> tuple[bytes, int]:
    """hwpx 안 Contents/*.xml의 연락처를 가린 새 hwpx. 읽을 수 없으면 ValueError."""
    try:
        src = zipfile.ZipFile(io.BytesIO(data))
        out = io.BytesIO()
        total = 0
        with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
            for info in src.infolist():
                blob = src.read(info)
                if info.filename.startswith("Contents/") and info.filename.endswith(".xml"):
                    text, n = mask_contacts(blob.decode("utf-8", errors="replace"))
                    total += n
                    blob = text.encode("utf-8")
                ctype = zipfile.ZIP_STORED if info.filename == "mimetype" else zipfile.ZIP_DEFLATED
                dst.writestr(info.filename, blob, compress_type=ctype)
        return out.getvalue(), total
    except (zipfile.BadZipFile, RuntimeError, OSError, EOFError) as exc:
        raise ValueError(f"hwpx 마스킹 실패({type(exc).__name__})") from exc


def vaccine_policy(url_or_host: str, scheme: str | None = None) -> str:
    """'생략' 또는 '사용자 확인'. https + go.kr만 생략."""
    host = url_or_host
    if "://" in url_or_host:
        scheme, rest = url_or_host.split("://", 1)
        host = rest.split("/", 1)[0]
    host = host.lower().split(":")[0]
    if scheme == "https" and host.endswith(GOV_SUFFIXES):
        return "생략"
    return "사용자 확인"
