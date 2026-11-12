"""TLS 정책(security 11-12): 로더 거부·ca_extra 경로·지문 고정·재시도·2nd pass·백신 강제. 네트워크 없음."""

import datetime
import hashlib
import http.client
import io
import json
import ssl
from pathlib import Path

import pytest

from collector.cli import main
from collector.httpclient import (CIPHERS_DHE_SHA, CIPHERS_RSA_GCM, FetchConnError, FetchTimeoutError, FetchHttpError, FetchTlsError, FetchTlsHandshakeError,
                                  HttpClient, TlsPolicy, _tls_error)
from collector.privacy import vaccine_policy
from collector.sources.base import RunReport, SourceError
from collector.sources.eminwon import EminwonConfig, EminwonSource, HostEntry, load_hosts
from collector.state import State
from collector.tlscert import check_pinned, host_matches, parse_cert, pem_certs

FX = Path(__file__).parent / "fixtures" / "eminwon"
REC = {"tls_reason": "시험", "tls_measured": "2026-11-12", "tls_review_by": "2027-05-12"}


# ── 가상 인증서(DER) 생성 — 서명은 가짜, 구조만 맞춘다 ─────────────────────────────
def _len(n):
    if n < 0x80:
        return bytes([n])
    b = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return bytes([0x80 | len(b)]) + b


def _d(tag, *parts):
    body = b"".join(parts)
    return bytes([tag]) + _len(len(body)) + body


def _name(cn):
    return _d(0x30, _d(0x31, _d(0x30, _d(0x06, b"\x55\x04\x03"), _d(0x0C, cn.encode()))))


def make_cert(cn="pinned.example.go.kr", sans=("pinned.example.go.kr",), issuer_cn="Test CA",
              not_before="20000101000000Z", not_after="20991231235959Z", ca=False, key=b"k1"):
    rsa = _d(0x06, b"\x2a\x86\x48\x86\xf7\x0d\x01\x01\x01")
    sha = _d(0x30, _d(0x06, b"\x2a\x86\x48\x86\xf7\x0d\x01\x01\x0b"))
    spki = _d(0x30, _d(0x30, rsa, b"\x05\x00"), _d(0x03, b"\x00" + key))
    exts = []
    if sans:
        exts.append(_d(0x30, _d(0x06, b"\x55\x1d\x11"), _d(0x04, _d(0x30, *[_d(0x82, s.encode()) for s in sans]))))
    exts.append(_d(0x30, _d(0x06, b"\x55\x1d\x13"), _d(0x01, b"\xff"),
                   _d(0x04, _d(0x30, *([_d(0x01, b"\xff")] if ca else [])))))
    tbs = _d(0x30, _d(0xA0, _d(0x02, b"\x02")), _d(0x02, b"\x01"), sha, _name(issuer_cn),
             _d(0x30, _d(0x18, not_before.encode()), _d(0x18, not_after.encode())),
             _name(cn), spki, _d(0xA3, _d(0x30, *exts)))
    return _d(0x30, tbs, sha, _d(0x03, b"\x00sig")), hashlib.sha256(spki).hexdigest()


# ── 해석·지문 ──────────────────────────────────────────────────────────────────
def test_parse_cert_fields():
    der, pin = make_cert()
    info = parse_cert(der)
    assert info.spki_sha256 == pin and info.dns_names == ("pinned.example.go.kr",)
    assert not info.is_ca and not info.self_issued
    root, _ = make_cert(cn="Root", sans=(), issuer_cn="Root", ca=True)
    assert parse_cert(root).is_ca and parse_cert(root).self_issued
    with pytest.raises(ValueError):
        parse_cert(der[:-3])


def test_check_pinned():
    der, pin = make_cert()
    assert check_pinned(der, (pin,), "pinned.example.go.kr")
    for pins, host, word in (((("0" * 64),), "pinned.example.go.kr", "지문"),
                             ((pin,), "other.example.go.kr", "호스트명")):
        with pytest.raises(ssl.SSLCertVerificationError, match=word):
            check_pinned(der, pins, host)
    expired, epin = make_cert(not_after="20201231235959Z")
    with pytest.raises(ssl.SSLCertVerificationError, match="유효기간"):
        check_pinned(expired, (epin,), "pinned.example.go.kr")     # 만료는 지문이 맞아도 거부(무시 플래그 없음)
    cn_only, cpin = make_cert(sans=())
    assert check_pinned(cn_only, (cpin,), "pinned.example.go.kr")    # SAN 없을 때만 CN


def test_host_matches_wildcard_one_label():
    assert host_matches("a.example.go.kr", ["*.example.go.kr"])
    assert not host_matches("a.b.example.go.kr", ["*.example.go.kr"])
    assert not host_matches("example.go.kr", ["*.example.go.kr"])
    assert not host_matches("a.go.kr", ["*.kr"])


def test_pem_certs_rejects_keys_and_other_blocks():
    der, _ = make_cert()
    pem = ssl.DER_cert_to_PEM_cert(der)
    assert pem_certs(pem) == [der]
    for bad in (pem + "-----BEGIN PRIVATE KEY-----\nAA==\n-----END PRIVATE KEY-----\n",
                pem.replace("CERTIFICATE", "TRUSTED CERTIFICATE"), ""):
        with pytest.raises(ValueError):
            pem_certs(bad)


def test_tls_error_classification_and_length():
    e = _tls_error(ssl.SSLError("x" * 500))
    assert isinstance(e, FetchTlsHandshakeError) and len(str(e)) <= len("TLS 오류: ") + 160
    v = _tls_error(ssl.SSLCertVerificationError("certificate verify failed"))
    assert isinstance(v, FetchTlsError) and not isinstance(v, FetchTlsHandshakeError)


# ── 로더 ──────────────────────────────────────────────────────────────────────
@pytest.fixture
def ca_dir(tmp_path):
    d = tmp_path / "ca"
    d.mkdir()
    inter, _ = make_cert(cn="Test Intermediate", sans=(), issuer_cn="Test Root", ca=True)
    (d / "inter.pem").write_text(ssl.DER_cert_to_PEM_cert(inter), encoding="ascii")
    root, _ = make_cert(cn="Test Root", sans=(), issuer_cn="Test Root", ca=True)
    (d / "root.pem").write_text(ssl.DER_cert_to_PEM_cert(root), encoding="ascii")
    leaf, _ = make_cert()
    (d / "leaf.pem").write_text(ssl.DER_cert_to_PEM_cert(leaf), encoding="ascii")
    (tmp_path / "outside.pem").write_text(ssl.DER_cert_to_PEM_cert(inter), encoding="ascii")
    return d


def _load(tmp_path, extra, ca_dir):
    item = {"host": "eminwon.test.go.kr", "key": "45|시험군청", "name_ko": "시험군청", **extra}
    p = tmp_path / "hosts.json"
    p.write_text(json.dumps({"hosts": [item]}, ensure_ascii=False), encoding="utf-8")
    return load_hosts(p, ca_dir=ca_dir)[0]


def test_loader_defaults_https_only(tmp_path, ca_dir):
    e = _load(tmp_path, {}, ca_dir)
    assert e.schemes == ("https",) and e.tls is None and not e.tls_relaxed


@pytest.mark.parametrize("value", [False, "false", 0, None])
def test_loader_rejects_tls_verify_off(tmp_path, ca_dir, value):
    with pytest.raises(SourceError, match="tls_verify"):
        _load(tmp_path, {"tls_verify": value}, ca_dir)


def test_loader_accepts_ca_extra(tmp_path, ca_dir):
    for name in ("inter.pem", "collector/config/ca/inter.pem"):
        e = _load(tmp_path, {"ca_extra": name, **REC}, ca_dir)
        assert e.tls.ca_file == (ca_dir / "inter.pem").resolve() and e.tls_relaxed


@pytest.mark.parametrize("name", ["../outside.pem", "..\\outside.pem", "C:\\inter.pem", "/etc/inter.pem",
                                  "sub/inter.pem", "inter.crt", "", "INTER.pem", "missing.pem",
                                  "root.pem", "leaf.pem"])
def test_loader_rejects_bad_ca_extra(tmp_path, ca_dir, name):
    with pytest.raises(SourceError):
        _load(tmp_path, {"ca_extra": name, **REC}, ca_dir)


@pytest.mark.parametrize("extra", [
    {"ciphers": "DEFAULT:@SECLEVEL=0", **REC},
    {"ciphers": "DEFAULT:@SECLEVEL=1", **REC},                               # 넓은 목록은 거부(security 11-12)
    {"ciphers": "ALL", **REC},
    {"min_tls": "TLSv1", **REC},
    {"pin_sha256": ["a" * 64, "b" * 64, "c" * 64], **REC},
    {"pin_sha256": ["xyz"], **REC},
    {"pin_sha256": "a" * 64, **REC},
    {"pin_sha256": ["a" * 64], "ca_extra": "inter.pem", **REC},
    {"ciphers": CIPHERS_DHE_SHA},                                     # 기록 필드 없음
    {"ciphers": CIPHERS_DHE_SHA, **REC, "tls_review_by": "2026-11-01"},  # 측정일보다 앞
    {"ciphers": CIPHERS_DHE_SHA, **REC, "tls_review_by": "2028-11-12"},  # 1년 초과
    {"ciphers": CIPHERS_DHE_SHA, **REC, "schemes": ["https", "http"]},
])
def test_loader_rejects_bad_tls(tmp_path, ca_dir, extra):
    with pytest.raises(SourceError):
        _load(tmp_path, extra, ca_dir)


def test_loader_accepts_pins_and_ciphers(tmp_path, ca_dir):
    e = _load(tmp_path, {"pin_sha256": ["A" * 64], "ciphers": CIPHERS_DHE_SHA, **REC}, ca_dir)
    assert e.tls.pins == ("a" * 64,) and e.tls.ciphers == CIPHERS_DHE_SHA and e.tls_relaxed


# ── HttpClient: 검증 끄기 불가·지문 고정은 요청 전에 대조 ─────────────────────────
def test_http_client_refuses_verify_false():
    with pytest.raises(FetchTlsError):
        HttpClient().get("https://example.invalid/", verify=False)


class _FakeSock:
    def __init__(self, der):
        self.der, self.sent = der, []

    def getpeercert(self, binary_form=False):
        return self.der if binary_form else {}

    def sendall(self, data):
        self.sent.append(data)

    def makefile(self, mode, *a, **k):
        return io.BytesIO(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")

    def close(self):
        pass


def _patch_connect(monkeypatch, der):
    socks = []

    def connect(self):
        self.sock = _FakeSock(der)
        socks.append(self.sock)

    monkeypatch.setattr(http.client.HTTPSConnection, "connect", connect)
    return socks


def test_pinned_match_reads_body(monkeypatch):
    der, pin = make_cert()
    _patch_connect(monkeypatch, der)
    data, _ = HttpClient().get("https://pinned.example.go.kr/x", tls=TlsPolicy(pins=(pin,)))
    assert data == b"ok"


def test_pinned_mismatch_fails_before_request(monkeypatch):
    der, _ = make_cert()
    socks = _patch_connect(monkeypatch, der)
    with pytest.raises(FetchTlsError) as ei:
        HttpClient().get("https://pinned.example.go.kr/x", tls=TlsPolicy(pins=("0" * 64,)))
    assert not isinstance(ei.value, FetchTlsHandshakeError) and "지문" in str(ei.value)
    assert socks and socks[0].sent == []          # 요청 한 바이트도 보내지 않음


# ── eminwon 재시도·2nd pass ──────────────────────────────────────────────────────
class Scripted:
    def __init__(self, errors):
        self.errors, self.calls = list(errors), []

    def get(self, url, verify=True, tls=None):
        self.calls.append(url)
        if self.errors:
            err = self.errors.pop(0)
            if err:
                raise err
        return ((FX / "list_sunchang.html").read_bytes() if "pageIndex=1" in url else b""), None


ENTRY = HostEntry("eminwon.test.go.kr", "45|시험군청", "시험군청")
C, H = FetchTimeoutError("연결 실패: timed out"), FetchTlsHandshakeError("TLS 오류: handshake failure")
R = FetchConnError("연결 실패: refused")


def _run(tmp_path, errors, entry=ENTRY, today=None):
    http, sleeps, report = Scripted(errors), [], RunReport()
    src = EminwonSource(EminwonConfig(), http, (entry,), sleep=sleeps.append, today=today)
    refs = list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, report, None))
    first_pages = sum("pageIndex=1&" in u or u.endswith("pageIndex=1") for u in http.calls)
    return refs, report, sleeps, first_pages


@pytest.mark.parametrize("errors,sleeps_exp,ok,pages", [
    ([C, C], [30.0, 90.0], True, 3),           # 2회 재시도 후 성공
    ([C, C, C], [30.0, 90.0], True, 4),        # 1차 실패 → 2nd pass 성공
    ([C, C, C, C], [30.0, 90.0], False, 4),    # 2nd pass도 실패
    ([H], [30.0], True, 2),                    # 핸드셰이크 1회 재시도
    ([H, H, H], [30.0], False, 3),             # 핸드셰이크 재시도 1회 + 2nd pass 1회
    ([FetchTlsError("TLS 오류: certificate verify failed")], [], False, 1),   # 검증 오류: 재시도·2nd pass 없음
    ([FetchHttpError("HTTP 404")], [], False, 1),
    ([R], [], True, 2),                        # 연결 거부·DNS: 재시도(대기) 없이 2nd pass에서 1회
    ([R, R], [], False, 2),
])
def test_retry_and_second_pass(tmp_path, errors, sleeps_exp, ok, pages):
    refs, report, sleeps, first_pages = _run(tmp_path, errors)
    assert sleeps == sleeps_exp and first_pages == pages
    assert (report.hosts_ok == ["eminwon.test.go.kr"]) is ok
    assert ("eminwon.test.go.kr" in report.hosts_failed) is (not ok)
    assert bool(refs) is ok


def test_review_date_warning(tmp_path):
    entry = HostEntry("eminwon.test.go.kr", "45|시험군청", "시험군청", tls_reason="시험",
                      tls_measured="2025-11-01", tls_review_by="2026-05-01")
    _, report, _, _ = _run(tmp_path, [], entry, today=datetime.date(2026, 11, 12))
    assert report.warnings and "eminwon.test.go.kr" in report.warnings[0]


# ── 백신: 완화 호스트는 go.kr+https여도 '사용자 확인' ─────────────────────────────
def test_vaccine_policy_relaxed():
    assert vaccine_policy("eminwon.sunchang.go.kr", "https") == "생략"
    assert vaccine_policy("eminwon.sunchang.go.kr", "https", relaxed=True) == "사용자 확인"


class TlsFake:
    def __init__(self):
        self.tls = []

    def get(self, url, verify=True, tls=None):
        self.tls.append(tls)
        if "method=selectListOfrNotAncmt" in url:
            return ((FX / "list_sunchang.html").read_bytes() if "pageIndex=1" in url else b""), None
        if "FileDown.jsp" in url:
            return (FX / "sunchang_32708.hwpx").read_bytes(), None
        return (FX / "detail_sunchang_32708.html").read_bytes(), None


@pytest.mark.parametrize("extra,vaccine", [({}, "생략"),
                                           ({"ciphers": CIPHERS_RSA_GCM, **REC}, "사용자 확인")])
def test_end_to_end_relaxed_host_forces_vaccine(tmp_path, capsys, extra, vaccine):
    hosts = tmp_path / "hosts.json"
    hosts.write_text(json.dumps({"hosts": [{"host": "eminwon.sunchang.go.kr", "key": "45|순창군청",
                                            "name_ko": "순창군청", "region_code": "45", "type": "지자체",
                                            **extra}]}, ensure_ascii=False), encoding="utf-8")
    http, out = TlsFake(), tmp_path / "out"
    main(["run", "--source", "eminwon", "--hosts-file", str(hosts), "--out-root", str(out)], http=http)
    capsys.readouterr()
    meta = json.loads((out / "_raw" / "eminwon" / "eminwon.sunchang.go.kr" / "제2026-934호" / "meta.json")
                      .read_text(encoding="utf-8"))
    assert meta["vaccine"] == vaccine
    assert all((t is not None) is bool(extra) for t in http.tls)


# ── 실제 설정 ──────────────────────────────────────────────────────────────────
def test_real_host_config_tls_exceptions():
    from collector.sources.eminwon import DEFAULT_HOSTS_FILE
    hosts = {h.host: h for h in load_hosts(DEFAULT_HOSTS_FILE)}
    ca = {h: e.tls.ca_file.name for h, e in hosts.items() if e.tls and e.tls.ca_file}
    assert ca == {
        "eminwon.cwg.go.kr": "rapidssl_tls_rsa_ca_g1.pem", "eminwon.sunchang.go.kr": "rapidssl_tls_rsa_ca_g1.pem",
        "eminwon.gokseong.go.kr": "thawte_tls_rsa_ca_g1.pem",
        "eminwon.inje.go.kr": "sectigo_public_server_auth_ca_dv_r36.pem",
        "eminwon.sd.go.kr": "sectigo_public_server_auth_ca_dv_r36.pem",
        "eminwon.sokcho.go.kr": "sectigo_public_server_auth_ca_dv_r36.pem"}
    assert not any(e.tls and e.tls.pins for e in hosts.values())
    assert {h for h, e in hosts.items() if e.tls and e.tls.ciphers} == {
        "eminwon.cheongju.go.kr", "eminwon.jeongeup.go.kr", "eminwon.sokcho.go.kr", "eminwon.uiseong.go.kr",
        "eminwon.yd21.go.kr"}                                   # SHA1 CBC만 받는 서버(11-12 실측)
    for h in ("dobong.eminwon.seoul.kr", "eminwon.junggu.seoul.kr", "gangnam.eminwon.seoul.kr"):
        assert hosts[h].tls is None and hosts[h].tls_reason      # 만료 사설 인증서: 예외 없이 실패 유지


def test_run_deadline_skips_backoff_and_second_pass(tmp_path):
    http, sleeps, report = Scripted([C, C, C, C]), [], RunReport()
    src = EminwonSource(EminwonConfig(max_run_sec=-1), http, (ENTRY,), sleep=sleeps.append)
    list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, report, None))
    assert sleeps == [] and "eminwon.test.go.kr" in report.hosts_failed
    assert any("2nd pass 생략" in w for w in report.warnings)


def test_timeout_vs_connection_error_classification():
    from collector.httpclient import _conn_error
    assert isinstance(_conn_error(TimeoutError("x"), "m"), FetchTimeoutError)
    assert isinstance(_conn_error(OSError("The read operation timed out"), "m"), FetchTimeoutError)
    e = _conn_error(ConnectionRefusedError("refused"), "m")
    assert isinstance(e, FetchConnError) and not isinstance(e, FetchTimeoutError)
