"""나라장터 낙찰·개찰 조회(NEXT 79) — 공고번호로 결과를 찾는다(backend-dev 11-13 설계, 메인 시험으로 파라미터 확정).

실측(2026-11-13, 해양환경공단 R26BK01528483): 낙찰 getScsbidListSttusServc·개찰 getOpengResultListInfoServc는
inqryDiv=4&bidNtceNo=<번호>로 단건 조회가 된다(낙찰 0건·개찰 '유찰' 1건). 계약 getCntrctInfoListServc는 공고번호
조회가 안 된다(inqryDiv=4·5 모두 07) — 그래서 계약은 찾지 않고 '우선협상, 계약 미확인'으로 둔다.
보안: 인증키(serviceKey)는 요청 URL에만 쓰고 원문·배치·로그·오류에 싣지 않는다(g2b.py와 같은 규칙).
개인정보: 허용 목록(KEEP)에 있는 칸만 남긴다 — 연락처·대표자·주소·사업자번호·자유 글(opengRsltNtcCntnts)·
개찰 업체 목록(opengCorpInfo)은 이름이 바뀌거나 늘어도 보관되지 않는다.
조회 호스트는 g2b 설정 주소의 호스트로 고정한다(다른 호스트로 키가 나가지 않게).
"""

from __future__ import annotations

import json
from urllib.parse import quote, urlsplit

from collector.httpclient import FetchError
from collector.sources.base import SourceError

SCSBID_OP = "as/ScsbidInfoService/getScsbidListSttusServc"
OPENG_OP = "as/ScsbidInfoService/getOpengResultListInfoServc"
BY_NO = "inqryDiv=4&bidNtceNo={no}"

SCSBID_KEEP = ("bidNtceNo", "bidNtceOrd", "bidNtceNm", "dminsttNm", "dminsttCd", "bidwinnrNm", "fnlSucsfDate",
               "rlOpengDt", "prtcptCnum")
OPENG_KEEP = ("bidNtceNo", "bidNtceOrd", "opengDt", "progrsDivCdNm", "prtcptCnum")
NO_DATA_CODES = ("03",)      # 자료 없음
ALLOWED_HOSTS = {"apis.data.go.kr"}   # 키를 보낼 수 있는 호스트(security 11-13)


class CapReached(SourceError):
    """실행당 결과 조회 상한 도달 — 남은 원문은 다음 실행에(문구가 아니라 형으로 구분, qa 11-13 P3-3)."""


class ResultLookup:
    def __init__(self, http, endpoint_base: str, key: str, report=None, max_calls: int = 150) -> None:
        p = urlsplit(endpoint_base)
        if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS or p.username or p.port:
            raise SourceError("나라장터 결과 조회 주소는 https://apis.data.go.kr 만 허용합니다")
        self.root = f"https://{p.hostname}/1230000"
        self.http, self.key, self.report, self.max_calls, self.calls = http, key, report, max_calls, 0
        self._cache: dict[tuple[str, str], list[dict]] = {}     # 같은 공고번호의 다른 차수는 한 번만 묻는다

    def _call(self, op: str, query: str, purpose: str, want: str) -> list[dict]:
        if (op, want) in self._cache:
            return self._cache[(op, want)]
        if self.calls >= self.max_calls:
            raise CapReached(f"결과 조회 호출 상한({self.max_calls})에 닿았습니다 — 하루 1000회 한도 보호")
        self.calls += 1
        url = f"{self.root}/{op}?serviceKey={quote(self.key, safe='')}&numOfRows=100&pageNo=1&{query}&type=json"
        try:
            data, _ = self.http.get(url, verify=True)
        except FetchError as exc:
            if self.report is not None:
                self.report.record_failure(url, purpose, 1, exc, host="g2b")
            raise SourceError(f"나라장터 결과 조회 실패: {exc}") from None
        try:
            doc = json.loads(data.decode("utf-8"))
            if "response" not in doc:        # 오류 응답 {"nkoneps.com.response.ResponseError":{"header":…}}
                header = next(iter(doc.values()))["header"]
                code = header.get("resultCode")
                if code in NO_DATA_CODES:
                    return []
                raise SourceError(f"나라장터 오류 {code}: {str(header.get('resultMsg'))[:80]}")
            resp = doc["response"]
            if resp["header"].get("resultCode") != "00":
                raise SourceError(f"나라장터 오류 {resp['header'].get('resultCode')}: "
                                  f"{str(resp['header'].get('resultMsg'))[:80]}")
            items = resp["body"].get("items") or []
            if isinstance(items, dict):
                items = items.get("item") or []
            items = items if isinstance(items, list) else [items]
        except SourceError:
            raise
        except (ValueError, KeyError, TypeError, AttributeError, StopIteration):
            raise SourceError("나라장터 응답 형식이 다릅니다(키 만료·서비스 변경 확인)") from None
        # 필터를 무시하는 응답이어도 남의 공고가 섞이지 않게 번호가 정확히 같은 항목만 받는다
        rows = [i for i in items if isinstance(i, dict) and str(i.get("bidNtceNo")) == want]
        self._cache[(op, want)] = rows
        return rows

    @staticmethod
    def _keep(item: dict, keep: tuple) -> dict:
        # 문자열·숫자만 — 응답 형식이 바뀌어 객체·목록이 오면 버린다(그 안의 연락처가 통째로 들어오지 않게)
        return {k: str(item[k])[:100] for k in keep
                if isinstance(item.get(k), (str, int, float)) and not isinstance(item.get(k), bool) and item[k] != ""}

    def lookup(self, bid_no: str, bid_ord: str | None = None) -> dict:
        no = quote(str(bid_no), safe="")
        out: dict = {"award": None, "opening": None}

        def pick(rows, fallback):   # 차수가 같은 항목. 낙찰만 다른 차수로 대신한다 — 붙일지는 build가 차수를 보고 정한다
            same = [r for r in rows if bid_ord is None or str(r.get("bidNtceOrd")) == str(bid_ord)]
            if same:
                return same[-1]
            return sorted(rows, key=lambda r: str(r.get("bidNtceOrd")).zfill(3))[-1] if rows and fallback else None

        win = pick([r for r in self._call(SCSBID_OP, BY_NO.format(no=no), f"낙찰 {bid_no}", str(bid_no))
                    if r.get("bidwinnrNm")], True)
        if win:
            out["award"] = self._keep(win, SCSBID_KEEP)
            return out
        op = pick(self._call(OPENG_OP, BY_NO.format(no=no), f"개찰 {bid_no}", str(bid_no)), False)
        if op:
            out["opening"] = self._keep(op, OPENG_KEEP)
        return out
