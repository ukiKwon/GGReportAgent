"""나라장터 낙찰·개찰 연결(NEXT 79) — 가짜 HTTP. 키 비노출·연락처 칸 제거·후보 규칙·번호 일치만 받음·옛 공고 보강."""
import datetime
import json

import pytest

from collector.cli import main
from collector.sources.base import RunReport
from collector.sources import g2b_results
from collector.sources.g2b import G2bSource
from collector.tests.test_g2b import ENV, ITEM, SECRET, FakeApi
from contract.batch_schema import validate_batch

CLOSED = dict(ITEM, opengDt="2026-11-10 10:00:00")
AWARD = {"bidNtceNo": "R26BK01805831", "bidNtceOrd": "000", "bidwinnrNm": "가나은행", "fnlSucsfDate": "2026-11-10",
         "prtcptCnum": "2", "bidwinnrTelNo": "02-111-2222", "bidwinnrCeoNm": "박대표", "fnlSucsfCorpOfcl": "이담당",
         "bidwinnrAdrs": "서울시 어디구 1", "bidwinnrBizno": "1234567890"}
OTHER = dict(AWARD, bidNtceNo="R26BK99999999", bidwinnrNm="엉뚱은행")
FAILED = {"bidNtceNo": "R26BK01805831", "bidNtceOrd": "000", "progrsDivCdNm": "유찰",
          "opengCorpInfo": "비밀업체^010-0000-0000", "opengRsltNtcCntnts": "담당 02-999-8888"}


@pytest.fixture(autouse=True)
def _test_host(monkeypatch):
    # 실제는 apis.data.go.kr만 허용 — 시험 주소(apis.example.invalid)를 이 파일에서만 더한다
    monkeypatch.setattr(g2b_results, "ALLOWED_HOSTS", {"apis.data.go.kr", "apis.example.invalid"})


class ResultApi(FakeApi):
    def __init__(self, award=(AWARD, OTHER), opening=(), error=False):
        super().__init__(items=(CLOSED,))
        self.award, self.opening, self.error = list(award), list(opening), error

    def get(self, url, verify=True):
        for op, rows in (("getScsbidListSttusServc", self.award), ("getOpengResultListInfoServc", self.opening)):
            if op in url:
                self.urls.append(url)
                assert "inqryDiv=4&bidNtceNo=" in url
                if self.error:
                    return json.dumps({"nkoneps.com.response.ResponseError": {"header": {
                        "resultCode": "07", "resultMsg": "입력범위값 초과"}}}).encode("utf-8"), "utf-8"
                body = {"response": {"header": {"resultCode": "00"}, "body": {"items": rows, "totalCount": len(rows)}}}
                return json.dumps(body, ensure_ascii=False).encode("utf-8"), "utf-8"
        return super().get(url, verify)


def _src(api, **cfg):
    return G2bSource().with_config(http=api, env=ENV, today=datetime.date(2026, 11, 11), keywords=("주거래",), **cfg)


def _main(monkeypatch, src, *argv):
    monkeypatch.setattr("collector.cli.get_source", lambda slug: src)
    return main(list(argv))


def _run(tmp_path, monkeypatch, api):
    out = tmp_path / "out"
    assert _main(monkeypatch, _src(api), "run", "--source", "g2b", "--since", "2026-11-01", "--out-root", str(out)) == 0
    return out


def _latest(out):
    batches = sorted(p for p in out.iterdir() if (p / "manifest.json").is_file())
    assert validate_batch(batches[-1]) == []
    rec = json.loads((batches[-1] / "manifest.json").read_text(encoding="utf-8"))["records"][0]
    blob = "".join(p.read_text(encoding="utf-8", errors="ignore") for p in out.rglob("*")
                   if p.is_file() and p.suffix in (".json", ".html", ".csv"))
    return rec, blob


def test_award_becomes_result_candidate_without_contacts(tmp_path, monkeypatch):
    api = ResultApi()
    rec, blob = _latest(_run(tmp_path, monkeypatch, api))
    f = rec["candidate"]["fields"]
    assert rec["notice"]["kind"] == "결과" and f["last_bid"] == "2026-11-03"
    assert f["bank"] == "가나은행" and f["award_at"] == "2026-11-10" and f["bank_status"] == "우선협상, 계약 미확인"
    assert rec["candidate"]["status"] == "후보"
    for secret in (SECRET, "박대표", "이담당", "02-111-2222", "서울시 어디구", "1234567890", "엉뚱은행"):
        assert secret not in blob, secret
    assert sum("getOpengResultListInfoServc" in u for u in api.urls) == 0      # 낙찰이 있으면 개찰은 묻지 않는다


def test_no_award_keeps_open_notice_and_notes_failed_bid(tmp_path, monkeypatch):
    rec, blob = _latest(_run(tmp_path, monkeypatch, ResultApi(award=(OTHER,), opening=(FAILED,))))
    assert rec["notice"]["kind"] == "계획" and "bank" not in rec["candidate"]["fields"]
    assert "개찰결과: 유찰" in (rec.get("evidence_note") or json.dumps(rec, ensure_ascii=False))
    assert "비밀업체" not in blob and "02-999-8888" not in blob


def test_error_response_does_not_stop_collection(tmp_path, monkeypatch):
    rec, blob = _latest(_run(tmp_path, monkeypatch, ResultApi(error=True)))
    assert rec["notice"]["kind"] == "계획" and SECRET not in blob
    assert "결과 조회 실패" in json.dumps(rec, ensure_ascii=False)


def test_open_notice_not_queried_and_call_cap(tmp_path):
    api = ResultApi()
    src = _src(api, max_result_calls=1)
    src._report = RunReport()
    assert src._result_for("R26BK01805831", "000", "2026-11-20") == (None, None) and api.urls == []
    res, err = src._result_for("R26BK01805831", "000", "2026-11-10")
    assert res["award"]["bidwinnrNm"] == "가나은행" and err is None
    assert src._result_for("R26BK01805831", "001", "2026-11-10")[0]["award"]   # 같은 번호 다른 차수 — 캐시, 호출 없음
    res, err = src._result_for("R26BK00000001", "000", "2026-11-10")
    assert res is None and "상한" in err and src._capped and len(api.urls) == 1


def test_refresh_results_backfills_old_notice(tmp_path, monkeypatch, capsys):
    api = ResultApi(award=(), opening=())                 # 처음 수집 때는 결과가 아직 없다
    out = _run(tmp_path, monkeypatch, api)
    assert _latest(out)[0]["notice"]["kind"] == "계획"
    for b in [p for p in out.iterdir() if (p / "manifest.json").is_file()]:
        b.rename(out / f"0000_old_{b.name}")          # 같은 분에 다시 포장하면 batch_id가 겹친다(시험 전용)
    api.award = [AWARD]                                   # 그 뒤 낙찰이 올라옴
    src = _src(api)
    capsys.readouterr()
    assert _main(monkeypatch, src, "results", "--source", "g2b", "--out-root", str(out)) == 0
    summary = json.loads(capsys.readouterr().out)["results"]
    assert summary["award"] == 1 and summary["calls"] == 1 and SECRET not in json.dumps(summary)
    assert _main(monkeypatch, src, "extract", "--source", "g2b", "--all", "--out-root", str(out)) == 0
    rec, blob = _latest(out)
    assert rec["notice"]["kind"] == "결과" and rec["candidate"]["fields"]["bank"] == "가나은행"
    assert "박대표" not in blob and SECRET not in blob
    capsys.readouterr()
    assert _main(monkeypatch, _src(api), "results", "--source", "g2b", "--out-root", str(out)) == 0
    again = json.loads(capsys.readouterr().out)["results"]
    assert again["calls"] == 0 and again["skipped"] == 1                     # 낙찰이 붙은 공고는 다시 묻지 않는다


def test_award_of_amended_round_promotes_original_000(tmp_path, monkeypatch):
    rec, _ = _latest(_run(tmp_path, monkeypatch, ResultApi(award=(dict(AWARD, bidNtceOrd="002"),))))
    assert rec["notice"]["kind"] == "결과" and rec["candidate"]["fields"]["bank"] == "가나은행"
    assert "공고 차수 002" in json.dumps(rec, ensure_ascii=False)


def test_award_of_other_round_is_note_only_for_non_original(tmp_path, monkeypatch):
    item = dict(CLOSED, bidNtceOrd="001")
    api = ResultApi(award=(dict(AWARD, bidNtceOrd="002"),))
    api.items = [item]
    rec, _ = _latest(_run(tmp_path, monkeypatch, api))
    assert rec["notice"]["kind"] != "결과" and "bank" not in (rec.get("candidate") or {}).get("fields", {})
    assert "같은 공고 차수 002" in json.dumps(rec, ensure_ascii=False)


def test_host_must_be_data_go_kr(monkeypatch):
    monkeypatch.setattr(g2b_results, "ALLOWED_HOSTS", {"apis.data.go.kr"})
    with pytest.raises(g2b_results.SourceError):
        g2b_results.ResultLookup(None, "https://evil.example/1230000/x", SECRET)
    with pytest.raises(g2b_results.SourceError):
        g2b_results.ResultLookup(None, "https://u:p@apis.data.go.kr/1230000/x", SECRET)


def test_refresh_skips_failed_bid_and_keeps_result_on_error(tmp_path, monkeypatch, capsys):
    api = ResultApi(award=(), opening=(dict(FAILED, progrsDivCdNm="개찰완료"),))
    out = _run(tmp_path, monkeypatch, api)
    meta_path = next(out.glob("_raw/g2b/**/meta.json"))
    assert json.loads(meta_path.read_text(encoding="utf-8"))["g2b_result"]["opening"]["progrsDivCdNm"] == "개찰완료"
    api.error = True                                       # 다음 조회는 오류 — 이전 결과는 남는다
    capsys.readouterr()
    assert _main(monkeypatch, _src(api), "results", "--source", "g2b", "--out-root", str(out)) == 3
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["g2b_result"]["opening"]["progrsDivCdNm"] == "개찰완료" and "07" in meta["g2b_result_error"]
    api.error, api.opening = False, [FAILED]               # 유찰로 끝남 → 그 뒤로는 묻지 않는다
    assert _main(monkeypatch, _src(api), "results", "--source", "g2b", "--out-root", str(out)) == 0
    n = len(api.urls)
    capsys.readouterr()
    assert _main(monkeypatch, _src(api), "results", "--source", "g2b", "--out-root", str(out)) == 0
    assert len(api.urls) == n and json.loads(capsys.readouterr().out)["results"]["skipped"] == 1
