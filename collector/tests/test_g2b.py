"""나라장터 소스(NEXT 80) — 가짜 API로 1주 창·키 비노출·담당자 칸 제거·후보 생성을 검증한다."""

import datetime
import json
from pathlib import Path

import pytest

from collector.cli import main
from collector.extract.classify import classify
from collector.sources.base import RunReport, SourceError
from collector.sources.g2b import G2bSource, _windows
from collector.state import State
from contract.batch_schema import validate_batch

SECRET = "f" * 64
ENV = {"G2B_ENDPOINT_URL": "https://apis.example.invalid/1230000/ad/BidPublicInfoService02",
       "G2B_SERVICE_KEY": SECRET}
HWPX = (Path(__file__).parent / "fixtures" / "eminwon" / "sunchang_32708.hwpx").read_bytes()

ITEM = {
    "bidNtceNo": "R26BK01805831", "bidNtceOrd": "000", "reNtceYn": "N",
    "bidNtceNm": "송파문화재단 주거래 은행 사업자 선정 입찰 공고", "ntceInsttNm": "재단법인 송파문화재단",
    "dminsttNm": "재단법인 송파문화재단", "dminsttCd": "B550123", "bidNtceDt": "2026-11-03 10:00:00",
    "bidClseDt": "2026-11-20 10:00:00",
    "bidNtceDtlUrl": "https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=R26BK01805831&bidPbancOrd=000",
    "ntceInsttOfclNm": "홍길동", "ntceInsttOfclTelNo": "02-2147-1234", "ntceInsttOfclEmailAdrs": "hong@example.or.kr",
    "ntceSpecDocUrl1": "https://www.g2b.go.kr/pn/pnp/pnpe/UntyAtchFile/downloadFile.do?bidPbancNo=R26BK01805831&fileSeq=1",
    "ntceSpecFileNm1": "제안요청서.hwpx",
    "ntceSpecDocUrl2": "https://evil.example/x.pdf", "ntceSpecFileNm2": "악성.pdf",
}


class FakeApi:
    def __init__(self, items=(ITEM,)):
        self.items = list(items)
        self.urls = []

    def get(self, url, verify=True):
        self.urls.append(url)
        if "downloadFile.do" in url:
            return HWPX, None
        body = {"response": {"header": {"resultCode": "00", "resultMsg": "정상"},
                             "body": {"items": self.items, "totalCount": len(self.items)}}}
        return json.dumps(body, ensure_ascii=False).encode("utf-8"), "utf-8"


def test_windows_are_at_most_7_days():
    ws = list(_windows(datetime.date(2026, 1, 1), datetime.date(2026, 1, 20)))
    assert all((e - b).days <= 6 for b, e in ws) and ws[-1][1] == datetime.date(2026, 1, 20)


def test_classify_is_source_neutral():
    # '선정'만으로 진행 중이라 보지 않는다 — 구청 고시공고의 결과 공고가 후보로 잘못 들어가지 않게(qa P1-1)
    assert classify("OO군 금고 선정 공고") == "기타"
    assert classify("(재공고)국토연구원 주거래 은행 사업자 선정") == "재공고"


def test_run_end_to_end_no_key_leak_and_contacts_dropped(tmp_path, capsys, monkeypatch):
    api = FakeApi()
    src = G2bSource().with_config(http=api, env=ENV, today=datetime.date(2026, 11, 11), keywords=("주거래",))
    monkeypatch.setattr("collector.cli.get_source", lambda slug: src)
    out = tmp_path / "out"
    code = main(["run", "--source", "g2b", "--since", "2026-11-01", "--out-root", str(out)])
    stdout = capsys.readouterr().out
    assert code == 0 and SECRET not in stdout
    summary = json.loads(stdout)
    assert summary["collect"]["new"] == 1
    # 키는 요청 URL에만 있고, 보관·배치 어디에도 없다
    blob = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in out.rglob("*") if p.is_file()
                   and p.suffix in (".json", ".html", ".csv"))
    assert SECRET not in blob and "홍길동" not in blob and "02-2147-1234" not in blob and "hong@" not in blob
    # 허용 밖 첨부 주소는 받지 않는다
    assert not any("evil.example" in u for u in api.urls)
    batch = out / summary["pack"]["batch_id"]
    assert validate_batch(batch) == []
    rec = json.loads((batch / "manifest.json").read_text(encoding="utf-8"))["records"][0]
    assert rec["notice"]["kind"] == "계획" and rec["notice"]["vaccine"] == "생략"
    assert rec["candidate"]["fields"]["notice_at"] == "2026-11-03"
    assert rec["institution"]["name_ko"] == "재단법인 송파문화재단"


def test_missing_key_is_reported_without_details(tmp_path):
    src = G2bSource().with_config(http=FakeApi(), env={})
    with pytest.raises(SourceError) as exc:
        list(src.list_new(State(tmp_path / "s.json").index("g2b"), None, RunReport(), None))
    assert ".env.local" in str(exc.value)


def test_call_cap_protects_daily_quota(tmp_path):
    src = G2bSource().with_config(http=FakeApi(items=()), env=ENV, today=datetime.date(2026, 11, 11),
                                  keywords=("주거래",), max_calls=2)
    report = RunReport()
    list(src.list_new(State(tmp_path / "s.json").index("g2b"), "2026-10-01", report, None))
    assert "g2b:주거래" in report.hosts_failed and src.calls == 2


def test_relevant_filters_noise():
    from collector.sources.g2b import relevant
    assert relevant("송파문화재단 주거래 은행 사업자 선정 입찰 공고")
    assert relevant("국민연금공단 외화금고은행 선정")
    assert relevant("부산교통공사 주거래은행(금고) 선정 공고")
    assert relevant("○○공사 금고 지정 신청 공고")
    assert not relevant("2026학년도 오금고등학교 학교급식 일부위탁 용역 입찰 공고")
    assert not relevant("2026년 새마을금고 SNS 운영 용역")
    assert not relevant("상하수도 요금고지서 인쇄 및 데이터 출력 용역")
    assert not relevant("[차세대 통합금고시스템 구축] 사업 외주 감리")
    assert relevant("○○공사 금고(은행) 선정") and relevant("금고 운영 기관 선정") and relevant("새마을금고중앙회 주거래은행 선정")
    assert not relevant("주거래은행 펌뱅킹 연계 시스템 구축") and not relevant("금고업무 시스템 유지보수")


def test_unknown_person_fields_are_not_kept(tmp_path, capsys, monkeypatch):
    item = dict(ITEM, dminsttOfclNm="김철수", newOfclTel="0221471234")
    src = G2bSource().with_config(http=FakeApi(items=(item,)), env=ENV, today=datetime.date(2026, 11, 11),
                                  keywords=("주거래",))
    monkeypatch.setattr("collector.cli.get_source", lambda slug: src)
    out = tmp_path / "out"
    assert main(["collect", "--source", "g2b", "--since", "2026-11-01", "--out-root", str(out)]) == 0
    blob = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in out.rglob("*.html"))
    assert "김철수" not in blob and "0221471234" not in blob and "bidNtceNm" in blob


def test_malformed_response_is_reported_not_raised(tmp_path):
    class Broken(FakeApi):
        def get(self, url, verify=True):
            return b'{"response":{"header":{"resultCode":"00"}}}', "utf-8"
    src = G2bSource().with_config(http=Broken(), env=ENV, today=datetime.date(2026, 11, 11), keywords=("주거래",))
    report = RunReport()
    assert list(src.list_new(State(tmp_path / "s.json").index("g2b"), "2026-11-05", report, None)) == []
    assert "형식" in report.hosts_failed["g2b:주거래"] and SECRET not in str(report.hosts_failed)


def test_with_config_keeps_injected_http_only():
    fake = FakeApi()
    assert G2bSource(http=fake).with_config(env=ENV).http is fake
    assert G2bSource().with_config(env=ENV).http is not fake


def test_bid_source_titles_are_open_notices(tmp_path):
    from collector.extract.build import notice_from_raw
    for i, (title, want) in enumerate((("경기환경에너지진흥원 금고 지정", "계획"), ("국립창원대학교 금고지정 입찰 공고", "계획"),
                        ("2026년 경기도시장상권진흥원 금고지정 재공고", "재공고"))):
        d = tmp_path / f"n{i}"
        (d / "attachments").mkdir(parents=True)
        (d / "detail.html").write_text("{}", encoding="utf-8")
        (d / "meta.json").write_text(json.dumps({
            "source": "g2b", "host": "g2b", "number": "X-000", "title": title, "posted_at": "2026-11-03",
            "detail_url": "https://www.g2b.go.kr/x", "encoding": "utf-8", "attachments": [],
            "institution": {"key": None, "name_ko": "기관", "region_code": None, "type": "공공기관"}},
            ensure_ascii=False), encoding="utf-8")
        assert notice_from_raw(d, "g2b/g2b/X-000").notice_info["kind"] == want, title


def test_bid_kind_uses_raw_flags(tmp_path):
    from collector.extract.build import notice_from_raw
    cases = (({"ntceKindNm": "취소공고"}, "기타"), ({"ntceKindNm": "변경공고"}, "기타"),
             ({"ntceKindNm": "등록공고", "reNtceYn": "Y"}, "재공고"), ({"ntceKindNm": "등록공고", "reNtceYn": "N"}, "계획"))
    for i, (item, want) in enumerate(cases):
        d = tmp_path / f"k{i}"
        (d / "attachments").mkdir(parents=True)
        (d / "detail.html").write_text(json.dumps(item, ensure_ascii=False), encoding="utf-8")
        (d / "meta.json").write_text(json.dumps({
            "source": "g2b", "host": "g2b", "number": "X-000", "title": "해양환경공단 주거래은행 사업자 선정",
            "posted_at": "2026-05-18", "detail_url": "https://www.g2b.go.kr/x", "encoding": "utf-8",
            "attachments": [], "institution": {"key": None, "name_ko": "기관", "region_code": None, "type": "공공기관"}},
            ensure_ascii=False), encoding="utf-8")
        assert notice_from_raw(d, "g2b/g2b/X-000").notice_info["kind"] == want, item
