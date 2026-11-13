"""대법원 새소식(S5) 소스 — 목록 POST·cp949·첨부 검사·법원별 후보·읽기 불가. hwp 바이너리 대신 hwp5_text를 monkeypatch."""

import json
import types
from urllib.parse import parse_qs, quote_plus

import pytest

from collector import httpclient
from collector.batch import write_batch
from collector.cli import main
from collector.extract import court
from collector.extract.build import notices_from_raw
from collector.extract.classify import classify, classify_court
from collector.httpclient import FetchHttpError, HttpClient
from collector.pipeline import extract_and_pack
from collector.sources.base import RunReport
from collector.sources.scourt import ScourtSource, parse_list
from collector.state import State
from collector.store import RawStore
from contract.batch_schema import validate_batch

OLE = bytes.fromhex("d0cf11e0a1b11ae1") + bytes(16)
VIEW = "https://www.scourt.go.kr/portal/news/NewsViewAction.work?pageIndex=1&searchWord=&searchOption=&seqnum={}&gubun=3"

TEXT_2025 = """법원행정처 공고 제2025-197호
공탁금 보관은행 지정계획 공고
공탁법 및 「공탁금 보관은행 지정절차 등에 관한 예규」에 따라 아래와 같이 공고합니다.
2025. 7. 29.
법원행정처장
1. 지정 대상
【공개경쟁 대상법원】
광주지방법원 순천지원, 광주지방법원 목포지원
2. 지정기간
5년(2026. 1. 1. ~ 2030. 12. 31.)
다만, 새로운 은행이 지정되는 경우 업무 개시일은 2026. 4. 4.부터로 한다.
3. 문의 : 법원행정처 공탁법인과 02-3480-1234
"""

ROWS_2021 = [("서울중앙지방법원", "2022.3.5."), ("서울서부지방법원", "2022.3.5."), ("의정부지방법원 남양주지원", "2022.3.1."),
             ("춘천지방법원", "2022.3.5."), ("춘천지방법원 강릉지원", "2022.3.12."), ("춘천지방법원 원주지원", "2022.3.19."),
             ("대전지방법원 홍성지원", "2022.3.26."), ("대전지방법원 공주지원", "2022.4.2."), ("대구지방법원 상주지원", "2022.4.9."),
             ("창원지방법원", "2022.4.16."), ("창원지방법원 통영지원", "2022.4.23."), ("창원지방법원 김해시법원", "2022.3.1."),
             ("창원지방법원 통영지원 거제시법원", "2022.3.1."), ("전주지방법원", "2022.4.30."), ("전주지방법원 정읍지원", "2022.5.7."),
             ("전주지방법원 남원지원", "2022.5.14."), ("전주지방법원 군산지원 익산시법원", "2022.3.1.")]
TEXT_2021 = ("법원행정처 공고 제2021-203호\n공탁금 보관은행 지정계획 공고\n【공개경쟁 대상법원】\n별지 참조\n2. 지정기간\n별지와 같음\n"
             "별지 2021년도 공개경쟁 대상법원 약정기간\n"
             + "".join(f"{i}\n{n}\n{d} ~ 2026.12.31.\n비고\n" for i, (n, d) in enumerate(ROWS_2021, 1)))
TEXT_RESULT = ("법원행정처 공고 제2026-250호\n공탁금 보관은행 지정 결과 공고\n【공개경쟁 대상법원】\n서울동부지방법원, 서울남부지방법원\n"
               "2. 지정기간\n5년(2027. 1. 1. ~ 2031. 12. 31.)\n")


def _raw(tmp_path, title, posted, with_hwp=True, body="<p>본문</p>", number="seq2622"):
    d = tmp_path / "n"
    (d / "attachments").mkdir(parents=True)
    atts = []
    if with_hwp:
        (d / "attachments" / "01_a.hwp").write_bytes(OLE)
        atts = [{"name": "공고.hwp", "stored": "attachments/01_a.hwp"}]
    (d / "detail.html").write_text(body, encoding="utf-8")
    (d / "meta.json").write_text(json.dumps({
        "source": "scourt", "host": "scourt.go.kr", "number": number, "title": title, "posted_at": posted,
        "detail_url": VIEW.format(number[3:]), "encoding": "utf-8", "native_id": number[3:],
        "attachments": atts, "attachment_errors": [], "vaccine": "생략",
        "institution": {"key": None, "name_ko": "법원행정처", "region_code": None, "type": "법원"}},
        ensure_ascii=False), encoding="utf-8")
    return d


def _row(seq, title, date):
    return (f'<tr><td>1</td><td class="tit"><a href="/portal/news/NewsViewAction.work?pageIndex=1&amp;searchWord='
            f'&amp;searchOption=&amp;seqnum={seq}&amp;gubun=3">{title}</a></td><td>{date}</td><td>12</td></tr>')


class FakeScourt:
    def __init__(self, pages=None, details=None, files=None):
        self.pages, self.details, self.files = pages or {}, details or {}, files or {}
        self.calls = []

    def get(self, url, verify=True):
        self.calls.append(("GET", url, None))
        seq = parse_qs(url.split("?", 1)[1])["seqnum"][0]
        if seq not in self.details:
            raise FetchHttpError("HTTP 404")
        return self.details[seq].encode("cp949"), None

    def post(self, url, data, verify=True):
        self.calls.append(("POST", url, data))
        if "NewsListAction" in url:
            page = int(parse_qs(data.decode("ascii"))["pageIndex"][0])
            return ("<table>" + "".join(self.pages.get(page, [])) + "</table>").encode("cp949"), None
        fid = parse_qs(data.decode("ascii"))["file"][0]
        return self.files[fid], None


def test_classify_court_rules_and_general_rule_untouched():
    assert classify_court("공탁금 보관은행 지정계획 공고(제2025-197호)") == "계획"
    assert classify_court("공탁금 보관은행 지정 결과 공고") == "지정"
    assert classify_court("공탁금 보관업무 담당은행 변경 안내") == "기타"
    assert classify_court("법원보관금 취급은행 지정 공고") == "제외"
    assert classify_court("법원 청사 방호 용역 입찰 공고") == "무관"
    assert classify("공탁금 보관은행 지정계획 공고") == "무관"          # 일반 규칙은 그대로


def test_parse_list_rows():
    rows = parse_list("<table>" + _row(2838, "공탁금 보관은행 지정계획 공고(제2026-184호)", "2026.07.30")
                      + _row(2622, "공탁금 보관은행 지정계획 공고", "2025-07-29") + "</table>")
    assert [(r.seqnum, r.posted_at) for r in rows] == [("2838", "2026-07-30"), ("2622", "2025-07-29")]
    assert rows[0].title.endswith("(제2026-184호)")


def test_list_new_cp949_post_paging_since_and_seen(tmp_path):
    api = FakeScourt(pages={1: [_row(2838, "공탁금 보관은행 지정계획 공고", "2026.07.30"),
                                _row(2622, "공탁금 보관은행 지정계획 공고", "2025.07.29")],
                            2: [_row(2360, "공탁금 보관은행 지정계획 공고", "2024.07.24")]})
    src = ScourtSource().with_config(http=api, sleep=lambda s: None, page_size=2)
    state = State(tmp_path / "s.json")
    state.mark_seen("scourt", "scourt.go.kr|seq2622", skipped=True)
    report = RunReport()
    refs = list(src.list_new(state.index("scourt"), None, report, None))
    assert [r.number for r in refs] == ["seq2838", "seq2360"]            # 본 것은 건너뜀, 2쪽까지 이어 읽음
    posts = [c for c in api.calls if c[0] == "POST"]
    assert len(posts) == 2 and all(c[1].startswith("https://www.scourt.go.kr/") for c in posts)
    assert quote_plus("공탁금 보관은행", encoding="cp949").encode() in posts[0][2] and b"%EA%B3%B5" not in posts[0][2]
    assert b"pageSize=2" in posts[0][2] and b"pageIndex=2" in posts[1][2]
    assert report.hosts_ok == ["scourt.go.kr"] and refs[0].detail_url == VIEW.format("2838")
    api2 = FakeScourt(pages=api.pages)                                    # since: 오래된 글은 거르고 거기서 멈춤
    src2 = ScourtSource().with_config(http=api2, sleep=lambda s: None, page_size=2)
    assert [r.number for r in src2.list_new(State(tmp_path / "t.json").index("scourt"), "2025-01-01", RunReport(), None)] \
        == ["seq2838", "seq2622"]


def test_empty_first_page_warns_not_silent(tmp_path):
    src = ScourtSource().with_config(http=FakeScourt(pages={1: []}), sleep=lambda s: None)
    report = RunReport()
    assert list(src.list_new(State(tmp_path / "s.json").index("scourt"), None, report, None)) == []
    assert report.warnings and "형식" in report.warnings[0]


def test_list_failure_is_recorded_without_body():
    class Down:
        def post(self, url, data, verify=True):
            raise FetchHttpError("HTTP 500")
    src = ScourtSource().with_config(http=Down(), sleep=lambda s: None)
    report = RunReport()
    assert list(src.list_new(types.SimpleNamespace(is_seen=lambda k: False), None, report, None)) == []
    assert "scourt.go.kr" in report.hosts_failed and report.fetch_failures[0]["purpose"] == "목록 1쪽"
    assert "searchWord" not in json.dumps(report.fetch_failures, ensure_ascii=False)


def test_fetch_raw_attachment_checks_and_masking(tmp_path):
    detail = ("<html><body>공탁금 보관은행 지정계획 공고 문의 02-3480-1234"
              "<a href=\"javascript:download('FID001','공고문.hwp')\">a</a>"
              "<a href=\"javascript:download('FID002','악성.exe')\">b</a>"
              "<a href=\"javascript:download('../x','나쁜.hwp')\">c</a>"
              "<a href=\"javascript:download('FID003','가짜.hwp')\">d</a></body></html>")
    api = FakeScourt(details={"2622": detail}, files={"FID001": OLE, "FID003": b"MZ not hwp"})
    src = ScourtSource().with_config(http=api, sleep=lambda s: None)
    ref = types.SimpleNamespace(source="scourt", host="scourt.go.kr", number="seq2622", native_id="2622",
                                title="공탁금 보관은행 지정계획 공고(제2025-197호)", posted_at="2025-07-29")
    raw = src.fetch_raw(ref, RawStore(tmp_path / "raw"))
    meta = json.loads((raw.raw_dir / "meta.json").read_text(encoding="utf-8"))
    assert [a["name"] for a in meta["attachments"]] == ["공고문.hwp"] and meta["unmaskable_attachments"] == ["공고문.hwp"]
    assert len(meta["attachment_errors"]) == 3 and meta["notice_no"] == "제2025-197호" and meta["vaccine"] == "생략"
    assert "3480-1234" not in (raw.raw_dir / "detail.html").read_text(encoding="utf-8")
    posts = [c for c in api.calls if c[0] == "POST"]
    assert [c[1] for c in posts].count("https://file.scourt.go.kr//AttachDownload") == 2     # FID001, FID003만 받음
    assert posts[0][2] == b"file=FID001&path=001&downFile=x"


def test_court_notices_2025_two_courts(tmp_path, monkeypatch):
    monkeypatch.setattr(court, "hwp5_text", lambda b: TEXT_2025)
    d = _raw(tmp_path, "공탁금 보관은행 지정계획 공고", "2025-07-29")
    ns = notices_from_raw(d, "r")
    assert [n.institution_name_ko for n in ns] == ["광주지방법원 순천지원", "광주지방법원 목포지원"]
    n = ns[0]
    assert n.notice_id == "scourt.go.kr#seq2622#광주지방법원 순천지원" and n.institution_type == "법원"
    f = n.candidate["fields"]
    assert f == {"contract_start": "2026-01-01", "contract_end": "2030-12-31", "term": 5, "last_bid": "2025-07-29"}
    assert n.notice_info["kind"] == "계획" and n.notice_info["number"] == "제2025-197호"
    assert "2026-04-04" in n.evidence_note and "3480-1234" not in n.evidence_note
    assert list(n.attachments) == [] and n.contract_end is None and n.confirmed is False


def test_court_notices_2021_appendix_17_rows_validate(tmp_path, monkeypatch):
    monkeypatch.setattr(court, "hwp5_text", lambda b: TEXT_2021)
    ns = notices_from_raw(_raw(tmp_path, "공탁금 보관은행 지정계획 공고", "2021-07-26", number="seq1637"), "r")
    assert len(ns) == 17 and len({n.notice_id for n in ns}) == 17
    by = {n.institution_name_ko: n.candidate["fields"] for n in ns}
    assert by["춘천지방법원 강릉지원"]["contract_start"] == "2022-03-12"
    assert by["전주지방법원 군산지원 익산시법원"]["contract_end"] == "2026-12-31"
    assert all("term" not in f and f["last_bid"] == "2021-07-26" for f in by.values())
    result = write_batch(ScourtSource(), ns, tmp_path / "out")
    assert validate_batch(result.path) == [] and result.record_count == 17


def test_court_notices_result_uses_notice_at_not_last_bid(tmp_path, monkeypatch):
    monkeypatch.setattr(court, "hwp5_text", lambda b: TEXT_RESULT)
    ns = notices_from_raw(_raw(tmp_path, "공탁금 보관은행 지정 결과 공고", "2026-11-12", number="seq2592"), "r")
    f = ns[0].candidate["fields"]
    assert ns[0].notice_info["kind"] == "지정" and f["notice_at"] == "2026-11-12" and "last_bid" not in f
    assert f["contract_end"] == "2031-12-31"


def test_marker_block_stops_at_next_heading_and_numbered_courts():
    assert court.marker_courts("【공개경쟁 대상법원】\n1. 인천지방법원\n2. 수원지방법원\n3. 지정기간\n서울중앙지방법원") \
        == ["인천지방법원", "수원지방법원"]
    assert court.marker_courts("본문 없음") == []


def test_unreadable_is_recorded_once_not_failure(tmp_path, monkeypatch):
    store, state = RawStore(tmp_path / "raw"), State(tmp_path / "s.json")
    d = store.write("scourt", "scourt.go.kr", "seq270", "■■ 깨진 글 ■■".encode("utf-8"), [], {
        "source": "scourt", "host": "scourt.go.kr", "number": "seq270", "title": "공탁금 보관은행 지정계획 공고",
        "posted_at": "2017-07-25", "detail_url": VIEW.format("270"), "encoding": "utf-8",
        "attachment_errors": [{"name": "", "error": "첨부 없음"}]})
    state.mark_seen("scourt", "scourt.go.kr|seq270", raw=store.rel(d))
    out = extract_and_pack(ScourtSource(), state, store, tmp_path / "out")
    assert out["records"] == 0 and out["extract_errors"] == [] and out["unreadable"][0]["key"] == "scourt.go.kr|seq270"
    assert "첨부 없음" in out["unreadable"][0]["reason"]
    assert "unreadable" not in extract_and_pack(ScourtSource(), state, store, tmp_path / "out")     # 다시 시도하지 않음
    assert extract_and_pack(ScourtSource(), state, store, tmp_path / "out", redo_all=True)["unreadable"]


def test_run_end_to_end_excludes_court_deposit_notice(tmp_path, capsys, monkeypatch):
    monkeypatch.setattr(court, "hwp5_text", lambda b: TEXT_2025)
    detail = ("<html><body>공고 문의 02-3480-1234 <a href=\"javascript:download('FID001','공고문.hwp')\">a</a></body></html>")
    api = FakeScourt(pages={1: [_row(2622, "공탁금 보관은행 지정계획 공고(제2025-197호)", "2025.07.29"),
                                _row(2700, "법원보관금 취급은행 지정 공고", "2025.09.01")]},
                     details={"2622": detail}, files={"FID001": OLE})
    out = tmp_path / "out"
    assert main(["run", "--source", "scourt", "--since", "2025-07-01", "--out-root", str(out)], http=api) == 0
    summary = json.loads(capsys.readouterr().out)
    assert summary["collect"]["new"] == 1 and summary["pack"]["records"] == 2
    assert not any(c[0] == "GET" and "seqnum=2700" in c[1] for c in api.calls)
    batch = out / summary["pack"]["batch_id"]
    assert validate_batch(batch) == []
    blob = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in out.rglob("*") if p.suffix in (".json", ".html", ".csv"))
    assert "3480-1234" not in blob


def test_httpclient_post_sends_form_body(monkeypatch):
    seen = {}

    class Resp:
        def __init__(self):
            self.b, self.headers = "공고".encode("cp949"), types.SimpleNamespace(get_content_charset=lambda: "euc-kr")

        def read(self, n=-1):
            out, self.b = self.b, b""
            return out

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

    class Opener:
        def open(self, req, timeout=None):
            seen["req"] = req
            return Resp()

    monkeypatch.setattr(httpclient.urllib.request, "build_opener", lambda *a, **k: Opener())
    data, cs = HttpClient(delay=0).post("https://file.scourt.go.kr//AttachDownload", b"file=A&path=001&downFile=x")
    req = seen["req"]
    assert req.get_method() == "POST" and req.data == b"file=A&path=001&downFile=x"
    assert req.get_header("Content-type") == "application/x-www-form-urlencoded" and data.decode("cp949") == "공고"
    with pytest.raises(httpclient.FetchError):
        HttpClient(delay=0).post("https://x.go.kr/", "문자열")           # 바이트가 아니면 거부


def test_attachment_path_outside_raw_dir_rejected(tmp_path):
    from collector.extract.build import attachment_path
    d = tmp_path / "raw"
    d.mkdir()
    assert attachment_path(d, "attachments/01_a.hwp") == (d / "attachments" / "01_a.hwp").resolve()
    with pytest.raises(ValueError):
        attachment_path(d, "../secret.txt")
