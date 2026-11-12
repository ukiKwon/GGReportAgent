"""수집기 보강(qa 11-12): 알려진 실패 호스트·요청 전체 마감·잠금 토큰·.bak 잔여물."""

import json
import os
import shutil
import types
from pathlib import Path

import pytest

from collector import cli
from collector.cli import main
from collector.httpclient import (FetchConnError, FetchError, FetchHttpError, FetchTimeoutError, FetchTlsConfigError,
                                  FetchTlsError, FetchTlsHandshakeError, HttpClient, error_kind)
from collector.sources.base import SourceError
from collector.sources.eminwon import load_hosts
from collector.store import RawStore

FX = Path(__file__).parent / "fixtures" / "eminwon"


# ── ① known_failing ─────────────────────────────────────────────────────────────
def _two_hosts(tmp_path):
    path = tmp_path / "hosts.json"
    path.write_text(json.dumps({"hosts": [
        {"host": "eminwon.sunchang.example", "key": "45|순창군청", "name_ko": "순창군청"},
        {"host": "known.example", "key": "11|알려진구청", "name_ko": "알려진구청",
         "known_failing": "만료된 사설 인증서", "known_failing_since": "2026-11-12",
         "known_failing_kind": "tls_verify", "known_failing_review_by": "2027-05-12"},
    ]}, ensure_ascii=False), encoding="utf-8")
    return path


class _Http:
    def __init__(self, failing=("known.example",), exc=None):
        self.failing = failing
        self.exc = exc or FetchTlsError("TLS 오류: certificate verify failed")

    def get(self, url, verify=True):
        if any(h in url for h in self.failing):
            raise self.exc
        if "method=selectListOfrNotAncmt" in url:
            return ((FX / "list_sunchang.html").read_bytes() if "pageIndex=1" in url else b""), None
        if "FileDown.jsp" in url:
            return (FX / "sunchang_32708.hwpx").read_bytes(), None
        return (FX / "detail_sunchang_32708.html").read_bytes(), None


def test_known_failing_only_exit_zero(tmp_path, capsys):
    code = main(["collect", "--source", "eminwon", "--hosts-file", str(_two_hosts(tmp_path)),
                 "--out-root", str(tmp_path / "out")], http=_Http())
    c = json.loads(capsys.readouterr().out)["collect"]
    assert code == 0
    assert list(c["hosts_failed_known"]) == ["known.example"] and c["hosts_failed_new"] == {}
    assert "known.example" in c["hosts_failed"]          # 기존 키 유지
    assert c["hosts_failed_kind"] == {"known.example": "tls_verify"}


def test_all_hosts_down_is_one(tmp_path, capsys):
    code = main(["collect", "--source", "eminwon", "--hosts-file", str(_two_hosts(tmp_path)),
                 "--out-root", str(tmp_path / "out")],
                http=_Http(failing=("known.example", "sunchang")))
    capsys.readouterr()
    assert code == 1                                     # 접속된 호스트가 하나도 없으면 기존대로 1


def test_unknown_host_failure_with_one_ok_is_three(tmp_path, capsys):
    path = tmp_path / "h.json"
    path.write_text(json.dumps({"hosts": [
        {"host": "eminwon.sunchang.example", "key": "45|순창군청", "name_ko": "순창군청"},
        {"host": "bad.example", "key": "11|새실패", "name_ko": "새실패"},
    ]}, ensure_ascii=False), encoding="utf-8")
    code = main(["collect", "--source", "eminwon", "--hosts-file", str(path),
                 "--out-root", str(tmp_path / "out")], http=_Http(failing=("bad.example",)))
    c = json.loads(capsys.readouterr().out)["collect"]
    assert code == 3 and list(c["hosts_failed_new"]) == ["bad.example"] and c["hosts_failed_known"] == {}


def test_known_host_success_warns(tmp_path, capsys):
    code = main(["collect", "--source", "eminwon", "--hosts-file", str(_two_hosts(tmp_path)),
                 "--out-root", str(tmp_path / "out")], http=_Http(failing=()))
    c = json.loads(capsys.readouterr().out)["collect"]
    assert code == 0 and c["hosts_failed_known"] == {}
    assert any("known.example" in w and "표시 해제 검토" in w for w in c["warnings"])


def test_known_failing_requires_since(tmp_path):
    path = tmp_path / "h.json"
    path.write_text(json.dumps({"hosts": [{"host": "k.example", "known_failing": "사유"}]}), encoding="utf-8")
    with pytest.raises(Exception):
        load_hosts(path)


def test_real_config_known_failing_marked():
    from collector.sources.eminwon import DEFAULT_HOSTS_FILE
    known = {h.host for h in load_hosts(DEFAULT_HOSTS_FILE) if h.known_failing}
    assert known == {"dobong.eminwon.seoul.kr", "eminwon.junggu.seoul.kr", "gangnam.eminwon.seoul.kr"}


# ── ② 요청 전체 마감 ────────────────────────────────────────────────────────────
class _Clock:
    t = 0.0

    def __call__(self):
        return self.t


class _Resp:
    headers = types.SimpleNamespace(get_content_charset=lambda: None)

    def __init__(self, data, clock, step):
        self.data, self.clock, self.step = data, clock, step

    def read(self, n):
        self.clock.t += self.step
        out, self.data = self.data[:n], self.data[n:]
        return out

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _patch_opener(monkeypatch, resp):
    class Opener:
        def open(self, req, timeout=None):
            return resp
    monkeypatch.setattr("collector.httpclient.urllib.request.build_opener", lambda *a: Opener())


def test_total_deadline_raises_timeout(monkeypatch):
    clock = _Clock()
    _patch_opener(monkeypatch, _Resp(b"x" * (200 * 1024), clock, step=20.0))
    c = HttpClient(timeout=10, delay=0, sleep=lambda s: None, clock=clock)    # 마감 = 30초
    with pytest.raises(FetchTimeoutError):
        c.get("https://slow.example/x")


def test_fast_body_reads_fully_in_chunks(monkeypatch):
    clock = _Clock()
    _patch_opener(monkeypatch, _Resp(b"y" * (200 * 1024), clock, step=0.1))
    data, _ = HttpClient(timeout=10, delay=0, sleep=lambda s: None, clock=clock).get("https://ok.example/x")
    assert len(data) == 200 * 1024


def test_max_bytes_still_enforced(monkeypatch):
    clock = _Clock()
    _patch_opener(monkeypatch, _Resp(b"z" * 100, clock, step=0.0))
    c = HttpClient(timeout=10, max_bytes=50, delay=0, sleep=lambda s: None, clock=clock)
    with pytest.raises(FetchError, match="너무 큽니다"):
        c.get("https://big.example/x")


# ── ③ 잠금 토큰 ─────────────────────────────────────────────────────────────────
def test_unlock_only_removes_own_token(tmp_path):
    lock = tmp_path / "_state" / "run.lock"
    fd = cli._lock(lock, "aaaa")
    os.close(fd)
    assert "token=aaaa" in lock.read_text()
    lock.write_text("pid=9 token=bbbb at=1\n")          # 회수 후 다른 실행이 새로 만든 잠금
    cli._unlock(lock, "aaaa")
    assert lock.exists()                                 # 남의 잠금은 남긴다
    cli._unlock(lock, "bbbb")
    assert not lock.exists()


def test_main_releases_own_lock(tmp_path, capsys):
    out = tmp_path / "out"
    main(["collect", "--source", "eminwon", "--hosts-file", str(_two_hosts(tmp_path)),
          "--out-root", str(out)], http=_Http())
    capsys.readouterr()
    assert not (out / "_state" / "run.lock").exists()


# ── ⑤ .bak 잔여물 ───────────────────────────────────────────────────────────────
def test_undeletable_bak_raises_clear_error_and_keeps_raw(tmp_path, monkeypatch):
    s = RawStore(tmp_path)
    final = s.write("eminwon", "h", "n1", b"v1", [], {})
    bak = final.parent / ".bak-n1"
    bak.mkdir()
    (bak / "junk").write_text("x")
    monkeypatch.setattr("collector.store.time.sleep", lambda sec: None)
    orig = shutil.rmtree
    monkeypatch.setattr("collector.store.shutil.rmtree",
                        lambda p, *a, **k: None if os.path.basename(str(p)).startswith(".bak-") else orig(p, *a, **k))
    with pytest.raises(OSError, match="잔여물"):
        s.write("eminwon", "h", "n1", b"v2", [], {})
    assert (final / "detail.html").read_bytes() == b"v1"


class _SlowRead1:
    """read1 한 번 = 소켓 한 번(시계 20초). read는 n을 채울 때까지 여러 번 기다리는 실제 동작을 흉내."""
    headers = types.SimpleNamespace(get_content_charset=lambda: None)

    def __init__(self, data, clock):
        self.data, self.clock = data, clock

    def read1(self, n):
        self.clock.t += 20.0
        out, self.data = self.data[:1], self.data[1:]
        return out

    def read(self, n):
        out = b""
        while len(out) < n and self.data:
            out += self.read1(n)
        return out

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def test_deadline_applies_within_small_body(monkeypatch):
    clock = _Clock()
    _patch_opener(monkeypatch, _SlowRead1(b"a" * 100, clock))       # 64KB 미만 본문, 1바이트씩 20초
    with pytest.raises(FetchTimeoutError):
        HttpClient(timeout=10, delay=0, sleep=lambda s: None, clock=clock).get("https://drip.example/x")
    assert clock.t < 100                                             # 마감(30초) 직후 멈춤 — 2000초 기다리지 않음


def test_lock_reclaim_unlink_failure_is_busy(tmp_path, monkeypatch):
    lock = tmp_path / "run.lock"
    lock.write_text("pid=1 token=x at=1\n")
    os.utime(lock, (1, 1))                                           # 아주 오래된 잠금
    monkeypatch.setattr(Path, "unlink", lambda self, missing_ok=False: (_ for _ in ()).throw(PermissionError("locked")))
    assert cli._lock(lock, "y") is None                              # traceback 대신 '다른 실행 중'



# ── hwpx 마스킹 보강(security 11-12) ───────────────────────────────────────────
def _hwpx(entries):
    import io, zipfile
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name, blob in entries:
            z.writestr(name, blob)
    return buf.getvalue()


def test_mask_hwpx_preview_text_masked_and_image_dropped():
    import io, zipfile
    from collector.privacy import mask_hwpx
    data = _hwpx([("mimetype", b"application/hwp+zip"),
                  ("Contents/section0.xml", "<hp:t>문의 02-2147-1234</hp:t>".encode()),
                  ("Preview/PrvText.txt", "담당 063-650-1234".encode()),
                  ("Preview/PrvImage.png", b"PNG fake")])
    out, n = mask_hwpx(data)
    z = zipfile.ZipFile(io.BytesIO(out))
    assert n == 2 and "Preview/PrvImage.png" not in z.namelist()
    assert "1234" not in z.read("Preview/PrvText.txt").decode() and "1234" not in z.read("Contents/section0.xml").decode()


def test_mask_hwpx_bomb_and_corrupt_are_value_errors(monkeypatch):
    from collector import privacy
    from collector.extract import hwpx
    monkeypatch.setattr(hwpx, "MAX_SECTION_BYTES", 1000)
    big = _hwpx([("Contents/section0.xml", b"a" * 5000)])          # 압축은 작지만 풀면 상한 초과
    with pytest.raises(ValueError):
        privacy.mask_hwpx(big)
    with pytest.raises(ValueError):
        privacy.mask_hwpx(b"PK broken")
    many = _hwpx([(f"x/{i}", b"") for i in range(privacy.MAX_HWPX_ENTRIES + 1)])
    with pytest.raises(ValueError):
        privacy.mask_hwpx(many)


def test_vaccine_policy_userinfo_trick():
    from collector.privacy import vaccine_policy
    assert vaccine_policy("https://x.go.kr:p@evil.com/a.hwpx") == "사용자 확인"
    assert vaccine_policy("https://www.g2b.go.kr/x") == "생략"


# ── 실패 요청 기록(사용자 11-12) ────────────────────────────────────────────────
def test_fetch_failures_record_url_purpose_attempts(tmp_path, capsys):
    from collector.httpclient import FetchTimeoutError as T
    from collector.sources.eminwon import EminwonConfig, EminwonSource, HostEntry
    from collector.sources.base import RunReport
    from collector.state import State

    class Slow:
        def get(self, url, verify=True):
            raise T("연결 실패: timed out")

    report = RunReport()
    src = EminwonSource(EminwonConfig(second_pass=False), Slow(), (HostEntry("e.test.go.kr", "45|시험", "시험"),),
                        sleep=lambda s: None)
    list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, report, None))
    f = report.fetch_failures
    assert len(f) == 1 and f[0]["attempts"] == 3 and f[0]["purpose"] == "목록 1쪽"
    assert f[0]["url"].startswith("https://e.test.go.kr/") and "timed out" in f[0]["error"] and f[0]["host"] == "e.test.go.kr"


def test_fetch_failures_in_summary_and_key_redacted(tmp_path, capsys):
    import datetime
    from collector.httpclient import FetchError as FE, redact_url
    from collector.sources.g2b import G2bSource
    secret = "f" * 64

    class Down:
        def get(self, url, verify=True):
            raise FE("연결 실패")

    src = G2bSource().with_config(http=Down(), env={"G2B_ENDPOINT_URL": "https://apis.example.invalid/x",
                                                    "G2B_SERVICE_KEY": secret},
                                  today=datetime.date(2026, 11, 11), keywords=("주거래",))
    import collector.cli as c
    orig = c.get_source
    c.get_source = lambda slug: src
    try:
        main(["collect", "--source", "g2b", "--since", "2026-11-09", "--out-root", str(tmp_path / "out")])
    finally:
        c.get_source = orig
    out = capsys.readouterr().out
    assert secret not in out
    ff = json.loads(out)["collect"]["fetch_failures"]
    assert ff and ff[0]["attempts"] == 1 and "serviceKey=***" in ff[0]["url"] and "주거래" in ff[0]["purpose"]
    assert redact_url("https://h/x?serviceKey=abc&a=1") == "https://h/x?serviceKey=***&a=1"



# ── P3-B 실패 종류·만료 ──────────────────────────────────────────────────────────
def test_error_kind_by_class():
    import ssl
    from collector.httpclient import _tls_error
    excs = (FetchTlsError("x"), FetchTlsHandshakeError("x"), FetchTlsConfigError("x"), FetchHttpError("x"),
            FetchTimeoutError("x"), FetchConnError("x"), FetchError("x"))
    assert [error_kind(e) for e in excs] == ["tls_verify", "tls_handshake", "tls_config", "http", "timeout", "conn", "other"]
    assert error_kind(_tls_error(ssl.SSLCertVerificationError(1, "certificate has expired"))) == "tls_verify"
    assert error_kind(_tls_error(ssl.SSLError(1, "handshake failure"))) == "tls_handshake"
    with pytest.raises(FetchTlsConfigError):
        HttpClient(delay=0).get("https://x.example/", verify=False)


@pytest.mark.parametrize("exc,kind", [(FetchHttpError("HTTP 500"), "http"), (FetchConnError("연결 실패: gaierror"), "conn")])
def test_known_host_other_cause_is_new(tmp_path, capsys, exc, kind):
    code = main(["collect", "--source", "eminwon", "--hosts-file", str(_two_hosts(tmp_path)),
                 "--out-root", str(tmp_path / "out")], http=_Http(exc=exc))
    c = json.loads(capsys.readouterr().out)["collect"]
    assert code == 3 and list(c["hosts_failed_new"]) == ["known.example"] and c["hosts_failed_known"] == {}
    assert c["hosts_failed_kind"] == {"known.example": kind}
    assert any("known.example" in w and "다른 원인" in w for w in c["warnings"])


@pytest.mark.parametrize("extra,ok", [
    ({}, False),
    ({"known_failing_kind": "tls_verify", "known_failing_review_by": "2027-05-12"}, True),
    ({"known_failing_kind": "dns", "known_failing_review_by": "2027-05-12"}, False),
    ({"known_failing_kind": "tls_verify", "known_failing_review_by": "2027-11-14"}, False),
    ({"known_failing_kind": "tls_verify", "known_failing_review_by": "2026-11-12"}, False),
])
def test_known_failing_fields_validated(tmp_path, extra, ok):
    path = tmp_path / "h.json"
    item = {"host": "k.example", "known_failing": "사유", "known_failing_since": "2026-11-12", **extra}
    path.write_text(json.dumps({"hosts": [item]}, ensure_ascii=False), encoding="utf-8")
    if ok:
        assert load_hosts(path)[0].known_failing_kind == "tls_verify"
    else:
        with pytest.raises(SourceError):
            load_hosts(path)


def test_known_failing_kind_without_reason_rejected(tmp_path):
    path = tmp_path / "h.json"
    path.write_text(json.dumps({"hosts": [{"host": "k.example", "known_failing_kind": "tls_verify"}]}), encoding="utf-8")
    with pytest.raises(SourceError):
        load_hosts(path)


def test_known_failing_review_expired_warns(tmp_path):
    import datetime
    from collector.sources.base import RunReport
    from collector.sources.eminwon import EminwonConfig, EminwonSource, HostEntry
    from collector.state import State
    e = HostEntry("known.example", "11|알려진구청", "알려진구청", known_failing="사유", known_failing_since="2026-11-12",
                  known_failing_kind="tls_verify", known_failing_review_by="2027-05-12")
    report = RunReport()
    src = EminwonSource(EminwonConfig(second_pass=False), _Http(), (e,), sleep=lambda s: None,
                        today=datetime.date(2027, 5, 13))
    list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, report, None))
    assert any("재검토일(2027-05-12)" in w for w in report.warnings)
    assert report.hosts_failed_kind == {"known.example": "tls_verify"}


def test_real_config_known_failing_kind_and_review():
    from collector.sources.eminwon import DEFAULT_HOSTS_FILE
    hs = [h for h in load_hosts(DEFAULT_HOSTS_FILE) if h.known_failing]
    assert {h.known_failing_kind for h in hs} == {"tls_verify"}
    assert all(h.known_failing_review_by == "2027-05-12" for h in hs)


# ── P3-D 잠금 회수 경쟁 ──────────────────────────────────────────────────────────
def _stale(lock, text):
    lock.parent.mkdir(parents=True, exist_ok=True)
    lock.write_text(text)
    os.utime(lock, (1, 1))


def test_reclaim_race_keeps_other_runs_new_lock(tmp_path, monkeypatch):
    lock = tmp_path / "_state" / "run.lock"
    _stale(lock, "pid=1 token=old at=1\n")
    orig = cli._reclaim

    def racing(path, seen):
        path.write_text("pid=2 token=bbbb at=2\n")      # 다른 실행이 먼저 회수하고 새 잠금을 만듦
        return orig(path, seen)
    monkeypatch.setattr(cli, "_reclaim", racing)
    assert cli._lock(lock, "aaaa") is None
    assert "token=bbbb" in lock.read_text()
    assert not lock.with_name("run.lock.reclaim").exists()


def test_reclaim_mark_held_is_busy(tmp_path):
    lock = tmp_path / "_state" / "run.lock"
    _stale(lock, "pid=1 token=old at=1\n")
    lock.with_name("run.lock.reclaim").write_text("")    # 다른 실행이 회수 중
    assert cli._lock(lock, "aaaa") is None
    assert "token=old" in lock.read_text()


def test_stale_reclaim_mark_cleared_then_next_run_proceeds(tmp_path):
    lock = tmp_path / "_state" / "run.lock"
    _stale(lock, "pid=1 token=old at=1\n")
    mark = lock.with_name("run.lock.reclaim")
    mark.write_text("")
    os.utime(mark, (1, 1))
    assert cli._lock(lock, "aaaa") is None and not mark.exists()
    fd = cli._lock(lock, "aaaa")
    assert fd is not None
    os.close(fd)
    assert "token=aaaa" in lock.read_text()


# ── P3-E run_weekly.cmd 최종 종료 코드 ───────────────────────────────────────────
CMD = Path(__file__).resolve().parents[1] / "run_weekly.cmd"


def test_run_weekly_cmd_is_ascii():
    CMD.read_bytes().decode("ascii")


@pytest.mark.skipif(os.name != "nt" or not shutil.which("powershell"), reason="Windows cmd 배치")
@pytest.mark.parametrize("e,g,want", [(0, 0, 0), (3, 0, 3), (0, 3, 3), (1, 3, 1), (3, 1, 1), (4, 0, 4),
                                      (0, 4, 4), (4, 3, 3), (2, 0, 2), (1, 4, 1)])
def test_run_weekly_exit_is_worst(tmp_path, e, g, want):
    import subprocess
    text = CMD.read_text(encoding="ascii")
    py_e = '"C:\dev\python\python.exe" -m collector run --source eminwon --since %SINCE%'
    py_g = '"C:\dev\python\python.exe" -m collector run --source g2b'
    assert text.count(py_e) == 1 and text.count(py_g) == 1
    d = tmp_path / "collector"
    d.mkdir()
    (d / "run_weekly.cmd").write_text(text.replace(py_e, "cmd /c exit %FAKE_E%").replace(py_g, "cmd /c exit %FAKE_G%"),
                                      encoding="ascii")
    r = subprocess.run(["cmd", "/c", str(d / "run_weekly.cmd")], env=dict(os.environ, FAKE_E=str(e), FAKE_G=str(g)),
                       capture_output=True, timeout=120)
    assert r.returncode == want
    log = next((tmp_path / "data" / "collector" / "_logs").glob("*_weekly.log")).read_text(encoding="ascii")
    assert f"final exit={want}" in log
