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
