"""인증서(DER) 최소 해석 — 표준 라이브러리만(security 11-12).

pin_sha256 호스트의 직접 검증(지문·호스트명·유효기간)과 ca_extra 파일 검사(중간 CA만)에 쓴다.
서명은 검증하지 않는다(지문 고정은 공개키 지문 일치로 서버를 확인). 해석 실패는 ValueError.
"""

from __future__ import annotations

import datetime
import hashlib
import re
import ssl
from dataclasses import dataclass

_OID_CN = b"\x55\x04\x03"
_OID_SAN = b"\x55\x1d\x11"
_OID_BC = b"\x55\x1d\x13"
_PEM_RE = re.compile(r"-----BEGIN CERTIFICATE-----\s+[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----")
PIN_RE = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class CertInfo:
    spki_sha256: str
    dns_names: tuple[str, ...]
    common_names: tuple[str, ...]
    not_before: datetime.datetime
    not_after: datetime.datetime
    is_ca: bool
    self_issued: bool


def _tlv(buf: bytes, i: int, limit: int | None = None):
    limit = len(buf) if limit is None else limit
    if i + 2 > limit:
        raise ValueError("DER 길이 오류")
    tag, ln, j = buf[i], buf[i + 1], i + 2
    if ln & 0x80:
        n = ln & 0x7F
        if not 1 <= n <= 4 or j + n > limit:
            raise ValueError("DER 길이 오류")
        ln, j = int.from_bytes(buf[j:j + n], "big"), j + n
    if j + ln > limit:
        raise ValueError("DER 길이 오류")
    return tag, j, j + ln


def _children(buf: bytes, start: int, end: int):
    """[(tag, tlv_start, value_start, value_end)]"""
    out, i = [], start
    while i < end:
        tag, vs, ve = _tlv(buf, i, end)
        out.append((tag, i, vs, ve))
        i = ve
    return out


def _time(der: bytes, tag: int, vs: int, ve: int) -> datetime.datetime:
    s = der[vs:ve].decode("ascii")
    if tag == 0x17 and len(s) == 13:                       # UTCTime: 50 미만 20xx(RFC 5280)
        yy = int(s[:2])
        s = f"{2000 + yy if yy < 50 else 1900 + yy}{s[2:]}"
    elif not (tag == 0x18 and len(s) == 15):
        raise ValueError("인증서 시각 형식")
    return datetime.datetime.strptime(s, "%Y%m%d%H%M%SZ").replace(tzinfo=datetime.timezone.utc)


def _text(der: bytes, tag: int, vs: int, ve: int) -> str:
    raw = der[vs:ve]
    return raw.decode("utf-16-be") if tag == 0x1E else raw.decode("utf-8", errors="replace")


def _common_names(der: bytes, vs: int, ve: int) -> tuple[str, ...]:
    out = []
    for _t, _s, rvs, rve in _children(der, vs, ve):            # RDN SET
        for _t2, _s2, avs, ave in _children(der, rvs, rve):     # AttributeTypeAndValue
            kids = _children(der, avs, ave)
            if len(kids) == 2 and der[kids[0][2]:kids[0][3]] == _OID_CN:
                out.append(_text(der, kids[1][0], kids[1][2], kids[1][3]))
    return tuple(out)


def parse_cert(der: bytes) -> CertInfo:
    try:
        tag, cvs, cve = _tlv(der, 0)
        if tag != 0x30 or cve != len(der):
            raise ValueError("인증서 아님")
        ttag, _ts, tvs, tve = _children(der, cvs, cve)[0]
        if ttag != 0x30:
            raise ValueError("TBSCertificate 아님")
        f = _children(der, tvs, tve)
        k = 1 if f[0][0] == 0xA0 else 0
        issuer, validity, subject, spki = f[k + 2], f[k + 3], f[k + 4], f[k + 5]
        times = _children(der, validity[2], validity[3])
        not_before = _time(der, times[0][0], times[0][2], times[0][3])
        not_after = _time(der, times[1][0], times[1][2], times[1][3])
        dns: list[str] = []
        is_ca = False
        for wrap in f[k + 6:]:
            if wrap[0] != 0xA3:
                continue
            seq = _children(der, wrap[2], wrap[3])[0]
            for _t, _s, evs, eve in _children(der, seq[2], seq[3]):
                kids = _children(der, evs, eve)
                oid, val = der[kids[0][2]:kids[0][3]], kids[-1]
                if val[0] != 0x04:
                    raise ValueError("확장 값 형식")
                if oid == _OID_SAN:
                    san = _children(der, val[2], val[3])[0]
                    dns += [der[s:e].decode("ascii") for t, _i, s, e in _children(der, san[2], san[3]) if t == 0x82]
                elif oid == _OID_BC:
                    bc = _children(der, val[2], val[3])[0]
                    inner = _children(der, bc[2], bc[3])
                    is_ca = bool(inner) and inner[0][0] == 0x01 and der[inner[0][2]:inner[0][3]] not in (b"", b"\x00")
        return CertInfo(
            spki_sha256=hashlib.sha256(der[spki[1]:spki[3]]).hexdigest(),
            dns_names=tuple(dns), common_names=_common_names(der, subject[2], subject[3]),
            not_before=not_before, not_after=not_after, is_ca=is_ca,
            self_issued=der[issuer[1]:issuer[3]] == der[subject[1]:subject[3]])
    except (ValueError, IndexError) as exc:
        raise ValueError("인증서를 해석할 수 없습니다") from exc


def host_matches(host: str, names) -> bool:
    host = host.lower().rstrip(".")
    for name in names:
        n = name.strip().lower().rstrip(".")
        if n == host:
            return True
        if n.startswith("*.") and "*" not in n[2:] and n.count(".") >= 2:
            left, _, tail = host.partition(".")
            if left and tail == n[2:]:
                return True
    return False


def check_pinned(der: bytes | None, pins, host: str, now: datetime.datetime | None = None) -> CertInfo:
    """지문 고정 호스트의 직접 검증. 실패는 ssl.SSLCertVerificationError(재시도·http 강등 없음).
    만료 인증서는 지문이 맞아도 거부한다 — 무시 플래그 없음(backend-dev 11-12 판단)."""
    if not der:
        raise ssl.SSLCertVerificationError("서버 인증서가 없습니다")
    try:
        info = parse_cert(der)
    except ValueError:
        raise ssl.SSLCertVerificationError("서버 인증서를 해석할 수 없습니다") from None
    if info.spki_sha256 not in pins:
        raise ssl.SSLCertVerificationError("인증서 지문 불일치(pin_sha256)")
    if not host_matches(host, info.dns_names or info.common_names):
        raise ssl.SSLCertVerificationError("인증서 호스트명 불일치")
    now = now or datetime.datetime.now(datetime.timezone.utc)
    if not info.not_before <= now <= info.not_after:
        raise ssl.SSLCertVerificationError("인증서 유효기간 밖(만료 포함) — 지문 고정도 허용하지 않음")
    return info


def pem_certs(text: str) -> list[bytes]:
    """PEM의 CERTIFICATE 블록만 DER로. 개인키·다른 블록(TRUSTED CERTIFICATE 등)이 있으면 ValueError."""
    if "PRIVATE KEY" in text:
        raise ValueError("개인키가 들어 있습니다")
    blocks = _PEM_RE.findall(text)
    if not blocks or text.count("-----BEGIN ") != len(blocks):
        raise ValueError("인증서 블록만 허용합니다")
    return [ssl.PEM_cert_to_DER_cert(b) for b in blocks]
