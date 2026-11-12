"""eminwon 금고 공고 감시(NEXT 80) — 실측 fixture(2026-11-11 curl 원본)로 파서·추출·증분·배치를 검증한다.
외부 네트워크는 부르지 않는다(가짜 HTTP)."""

import io
import json
import zipfile
from pathlib import Path

import pytest

from collector.cli import main
from collector.extract.classify import classify
from collector.extract.hwpx import ExtractError, hwpx_text
from collector.extract.terms import find_period
from collector.sources.base import RunReport, SourceError
from collector.sources.eminwon import EminwonSource
from collector.sources.eminwon_parse import decode_body, parse_attachments, parse_list
from collector.state import State
from contract.batch_schema import validate_batch

FX = Path(__file__).parent / "fixtures" / "eminwon"


def _list(name):
    return parse_list(decode_body((FX / name).read_bytes())[0])


# ── 파서: 실측 3유형 ────────────────────────────────────────────────────────────
def test_parse_list_gangnam_type():
    rows = {r.number: r for r in _list("list_gangnam.html")}
    r = rows["제2026-2459호"]
    assert r.mgt_no == "65649" and r.posted_at == "2026-10-23" and r.department == "재무과"
    assert "금고지정 공고" in r.title.replace(" ", "") or "금고지정공고" in r.title.replace(" ", "")


def test_parse_list_sunchang_type_all_cells_linked():
    rows = {r.number: r for r in _list("list_sunchang.html")}
    r = rows["제2026-934호"]
    assert r.mgt_no == "32708" and r.posted_at == "2026-09-16" and r.title == "순창군 금고지정 공고"
    assert r.department == "재무과"


def test_parse_list_jemulpo_type_href_id():
    rows = {r.number: r for r in _list("list_jemulpo.html")}
    r = rows["제2026-1088호"]
    assert r.mgt_no == "35120" and r.posted_at == "2026-11-02" and "제물포구 금고 지정 공고" in r.title


def test_parse_attachments_real_detail():
    text, _ = decode_body((FX / "detail_sunchang_32708.html").read_bytes())
    links = parse_attachments(text)
    assert links and links[0].user_file_nm.endswith(".hwpx")
    assert links[0].file_path.startswith("/ntishome/")


def test_hwpx_real_period():
    text = hwpx_text((FX / "sunchang_32708.hwpx").read_bytes())
    start, end, _ = find_period(text)
    assert (start, end) == ("2027-01-01", "2029-12-31")


def test_hwpx_rejects_non_zip_and_bad_dates():
    with pytest.raises(ExtractError):
        hwpx_text(b"not a zip")
    assert find_period("약정기간 : 2027. 13. 1. ~ 2030. 12. 31.") is None


@pytest.mark.parametrize("title,kind", [
    ("정부출연연구기관 주거래은행 선정 계획 공고", "계획"),
    ("서울특별시 강남구 금고 지정 공고", "지정"),
    ("금고 출연금 지원 공고", "제외"),
    ("인천도시공사 지정금융기관 선정 공고", "기타"),
    ("「2027년 상하수도 요금고지서 제작 및 출력(봉합)」수의계약 안내 공고", "제외"),
    ("서울특별시 ○○구 금고 이율 공시", "제외"),
    ("서울특별시 ○○구 금고지정 결과 및 운영현황 공고", "결과"),
    ("서울특별시 마포구 금고지정 계획 공고", "계획"),
    ("서울특별시 용산구 금고지정계획 재공고", "재공고"),
    ("서울특별시 동작구 금고지정 결과 공고", "결과"),
    ("서울특별시 강남구 금고지정 공고", "지정"),
    ("순창군 금고지정 공고", "지정"),
    ("서울특별시 마포구 금고지정 계획 취소 공고", "기타"),
    ("서울특별시 관악구 금고 적용금리 현황 공고", "제외"),
    ("진안군금고 약정에 따른 협력사업비 공고", "제외"),
    ("2026년도 상반기 서울특별시 강북구 금고운용 현황 공고", "제외"),
    ("도로 공사 공고", "무관"),
])
def test_classify(title, kind):
    assert classify(title) == kind


# ── 증분·배치(가짜 HTTP) ─────────────────────────────────────────────────────────
class FakeHttp:
    def __init__(self):
        self.urls = []

    def get(self, url, verify=True):
        self.urls.append(url)
        if "method=selectListOfrNotAncmt" in url:
            return ((FX / "list_sunchang.html").read_bytes() if "pageIndex=1" in url else b""), None
        if "FileDown.jsp" in url:
            return (FX / "sunchang_32708.hwpx").read_bytes(), None
        if "not_ancmt_mgt_no=" in url:
            return (FX / "detail_sunchang_32708.html").read_bytes(), None
        raise AssertionError(url)


def _hosts_file(tmp_path):
    path = tmp_path / "hosts.json"
    path.write_text(json.dumps({"hosts": [{
        "host": "eminwon.sunchang.example", "key": "45|순창군청", "name_ko": "순창군청",
        "region_code": "45", "type": "지자체"}]}, ensure_ascii=False), encoding="utf-8")
    return path


def test_run_end_to_end_incremental(tmp_path, capsys):
    http = FakeHttp()
    hosts_file = _hosts_file(tmp_path)
    out = tmp_path / "out"
    code = main(["run", "--source", "eminwon", "--hosts-file", str(hosts_file),
                 "--out-root", str(out)], http=http)
    assert code == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["collect"]["new"] >= 1
    batch = out / summary["pack"]["batch_id"]
    assert validate_batch(batch) == []
    manifest = json.loads((batch / "manifest.json").read_text(encoding="utf-8"))
    rec = next(r for r in manifest["records"] if r["notice"]["number"] == "제2026-934호")
    assert rec["notice"]["kind"] == "지정" and rec["notice"]["institution_key"] == "45|순창군청"
    cand = rec["candidate"]
    assert cand["status"] == "후보" and cand["role"] == "회차종료"
    assert cand["fields"]["contract_end"] == "2029-12-31" and cand["fields"]["term"] == 3
    assert cand["fields"]["last_bid"] == "2026-09-16"
    assert rec["schedule"]["confidence"] == "예상"
    assert (out / "_raw" / "eminwon" / "eminwon.sunchang.example" / "제2026-934호" / "detail.html").is_file()
    # 금리·협력사업비 공고는 원문을 받지 않는다(skipped)
    assert summary["collect"]["skipped"] >= 1

    # 두 번째 실행: 새 글 없음, 배치 없음
    code = main(["run", "--source", "eminwon", "--hosts-file", str(hosts_file),
                 "--out-root", str(out)], http=http)
    again = json.loads(capsys.readouterr().out)
    assert again["collect"]["new"] == 0 and again["pack"]["batch_id"] is None


def test_failed_host_is_reported(tmp_path, capsys):
    class Down:
        def get(self, url, verify=True):
            from collector.httpclient import FetchError
            raise FetchError("연결 실패")

    out = tmp_path / "out"
    code = main(["run", "--source", "eminwon", "--hosts-file", str(_hosts_file(tmp_path)),
                 "--out-root", str(out)], http=Down())
    assert code == 1
    data = json.loads(capsys.readouterr().out)
    assert "eminwon.sunchang.example" in data["collect"]["hosts_failed"]


def test_usage_errors(tmp_path):
    assert main(["run", "--source", "eminwon", "--since", "2026/01/01", "--out-root", str(tmp_path)]) == 2
    src = EminwonSource().with_config(hosts_file=_hosts_file(tmp_path), http=FakeHttp())
    with pytest.raises(SourceError):
        list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, RunReport(), ["없는호스트"]))


def test_real_host_config_is_valid():
    from collector.sources.eminwon import DEFAULT_HOSTS_FILE, load_hosts
    hosts = load_hosts(DEFAULT_HOSTS_FILE)
    assert len(hosts) >= 73
    assert all("|" in h.key for h in hosts)


# ── 계약: 후보 칸 검증 ───────────────────────────────────────────────────────────
def test_contract_rejects_candidate_without_basis(tmp_path):
    from contract.batch_schema import _validate_notice_candidate
    rec = {"candidate": {"status": "확정", "fields": {"contract_end": "2030/12/31", "term": 4}, "basis": []}}
    errs = " ".join(_validate_notice_candidate(rec, "r"))
    assert "status" in errs and "YYYY-MM-DD" in errs and "basis" in errs


# ── 보안 보강(security 7d2ac90) ─────────────────────────────────────────────────
def _mixed_hosts_file(tmp_path):
    path = tmp_path / "mixed.json"
    path.write_text(json.dumps({"hosts": [{
        "host": "mixed.example", "key": "45|혼합군청", "name_ko": "혼합군청",
        "schemes": ["https", "http"]}]}, ensure_ascii=False), encoding="utf-8")
    return path


def test_mixed_schemes_tls_failure_never_downgrades_to_http(tmp_path):
    """schemes가 ["https","http"]여도 TLS 오류(검증·핸드셰이크)는 http로 내려가지 않는다."""
    from collector.httpclient import FetchTlsError, FetchTlsHandshakeError

    for exc_type in (FetchTlsError, FetchTlsHandshakeError):
        class TlsBroken:
            def __init__(self):
                self.urls = []

            def get(self, url, verify=True):
                self.urls.append(url)
                raise exc_type("TLS 오류")

        http = TlsBroken()
        src = EminwonSource().with_config(hosts_file=_mixed_hosts_file(tmp_path), http=http,
                                          sleep=lambda s: None)
        report = RunReport()
        list(src.list_new(State(tmp_path / f"s_{exc_type.__name__}.json").index("eminwon"), None, report, None))
        assert report.hosts_failed and http.urls and all(u.startswith("https://") for u in http.urls)


def test_mixed_schemes_connection_refused_falls_back_to_http(tmp_path):
    """현재 동작 명시: 연결 거부(FetchConnError)는 혼합 schemes에서 http로 강등한다(혼합 schemes는 현재 설정에 없음)."""
    from collector.httpclient import FetchConnError

    class Refused:
        def __init__(self):
            self.urls = []

        def get(self, url, verify=True):
            self.urls.append(url)
            raise FetchConnError("연결 거부")

    http = Refused()
    src = EminwonSource().with_config(hosts_file=_mixed_hosts_file(tmp_path), http=http,
                                      sleep=lambda s: None, second_pass=False)
    report = RunReport()
    list(src.list_new(State(tmp_path / "s.json").index("eminwon"), None, report, None))
    assert http.urls[0].startswith("https://") and http.urls[1].startswith("http://")
    assert "mixed.example" in report.hosts_failed


def test_attachment_signature_check():
    from collector.sources.eminwon import signature_ok
    assert signature_ok("a.pdf", b"%PDF-1.7 ...") and not signature_ok("a.pdf", b"MZ\x90\x00")
    assert signature_ok("a.hwpx", b"PK\x03\x04...") and not signature_ok("a.hwp", b"PK\x03\x04")


def test_hwpx_bad_zip_variants_raise_extract_error():
    good = (FX / "sunchang_32708.hwpx").read_bytes()
    with pytest.raises(ExtractError):
        hwpx_text(good[: len(good) // 2])         # 잘린 zip
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for i in range(60):
            z.writestr(f"Contents/section{i}.xml", "<hp:p><hp:t>x</hp:t></hp:p>")
    with pytest.raises(ExtractError):
        hwpx_text(buf.getvalue())                  # 구간 과다


def test_stale_lock_is_reclaimed(tmp_path):
    import os
    import time as _t
    from collector import cli
    lock = tmp_path / "_state" / "run.lock"
    lock.parent.mkdir(parents=True)
    lock.write_text("pid=1")
    old = _t.time() - cli.STALE_LOCK_SEC - 10
    os.utime(lock, (old, old))
    fd = cli._lock(lock)
    assert fd is not None
    os.close(fd)


# ── 사용자 결정 11-12: 연락처 마스킹·백신 판정 ──────────────────────────────────────
def test_mask_contacts_keeps_dates_and_numbers():
    from collector.privacy import MASK, mask_contacts
    text, n = mask_contacts("담당: 재무과 063-650-1234, 010-1234-5678, (02)2147-1234, 1588-1234, a.b@x.go.kr / 공고 제2026-934호 2026-09-16")
    assert n == 5 and text.count(MASK) == 5
    assert "제2026-934호" in text and "2026-09-16" in text


def test_mask_hwpx_rewrites_section():
    from collector.privacy import MASK, mask_hwpx
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "application/hwp+zip")
        z.writestr("Contents/section0.xml", "<hp:p><hp:t>문의 063-650-1234</hp:t></hp:p>")
    out, n = mask_hwpx(buf.getvalue())
    assert n == 1 and MASK in hwpx_text(out) and "063-650-1234" not in hwpx_text(out)


def test_vaccine_policy():
    from collector.privacy import vaccine_policy
    assert vaccine_policy("https://eminwon.sunchang.go.kr/x") == "생략"
    assert vaccine_policy("http://eminwon.sunchang.go.kr/x") == "사용자 확인"
    assert vaccine_policy("https://gangnam.eminwon.seoul.kr/x") == "생략"          # 지자체 공식 도메인(11-12 결정)
    assert vaccine_policy("http://nowon.eminwon.seoul.kr/x") == "사용자 확인"      # http는 생략 불가
    assert vaccine_policy("https://example.com/x") == "사용자 확인"
    assert vaccine_policy("eminwon.mapo.go.kr", "https") == "생략"


def test_end_to_end_masks_and_flags(tmp_path, capsys):
    import re as _re
    out = tmp_path / "out"
    main(["run", "--source", "eminwon", "--hosts-file", str(_hosts_file(tmp_path)),
          "--out-root", str(out)], http=FakeHttp())
    summary = json.loads(capsys.readouterr().out)
    raw = (out / "_raw" / "eminwon" / "eminwon.sunchang.example" / "제2026-934호")
    detail = (raw / "detail.html").read_text(encoding="utf-8")
    assert not _re.search(r"0\d{1,2}-\d{3,4}-\d{4}", detail)
    meta = json.loads((raw / "meta.json").read_text(encoding="utf-8"))
    assert meta["vaccine"] == "사용자 확인"        # 시험 호스트는 go.kr이 아니고 https 성공 여부와 무관하게 확인 대상
    batch = out / summary["pack"]["batch_id"]
    manifest = json.loads((batch / "manifest.json").read_text(encoding="utf-8"))
    rec = next(r for r in manifest["records"] if r["notice"]["number"] == "제2026-934호")
    assert rec["notice"]["vaccine"] == "사용자 확인" and rec["notice_id"] in summary["pack"]["vaccine_confirm"]
    assert not _re.search(r"0\d{1,2}-\d{3,4}-\d{4}", json.dumps(rec, ensure_ascii=False))


def test_notice_failure_gives_exit_code_3(tmp_path, capsys):
    from collector.httpclient import FetchError

    class DetailDown(FakeHttp):
        def get(self, url, verify=True):
            if "not_ancmt_mgt_no=" in url and "FileDown.jsp" not in url:
                raise FetchError("연결 실패")
            return super().get(url, verify)

    code = main(["run", "--source", "eminwon", "--hosts-file", str(_hosts_file(tmp_path)),
                 "--out-root", str(tmp_path / "out")], http=DetailDown())
    data = json.loads(capsys.readouterr().out)
    assert data["collect"]["failed"] and not data["collect"]["hosts_failed"]
    assert code == 3


def test_real_host_config_schemes():
    from collector.sources.eminwon import DEFAULT_HOSTS_FILE, load_hosts
    hosts = {h.host: h for h in load_hosts(DEFAULT_HOSTS_FILE)}
    http_ok = {h for h, e in hosts.items() if "http" in e.schemes}
    assert http_ok == {"gwangjin.eminwon.seoul.kr", "eminwon.seo.incheon.kr"}
    assert hosts["eminwon.nowon.kr"].schemes == ("https",)
    assert hosts["eminwon.uiseong.go.kr"].schemes == ("https",)
    assert "nowon.eminwon.seoul.kr" not in hosts and "eminwon.usc.go.kr" not in hosts
    assert "eminwon.bsseogu.go.kr" not in hosts      # 11-12 DNS 없음(본 사이트 www.bsseogu.go.kr만 살아 있음)
