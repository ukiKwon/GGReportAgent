"""나라장터(조달청 입찰공고정보서비스 OpenAPI) — 공공기관·공기업·지방공기업 '주거래은행·금고' 선정 공고.

조건(collector/SOURCES.md S9, 2026-11-11 실측):
- 주소 G2B_ENDPOINT_URL(…/1230000/ad/BidPublicInfoService02), 기능 이름도 끝에 02.
- 용역 검색 getBidPblancListInfoServcPPSSrch02, 제목 검색 bidNtceNm, **조회 기간 7일 이내**, numOfRows 100, type=json.
- **하루 호출 1000회**(사용자) — 한 번 실행에 max_calls(기본 200)를 넘기지 않는다.
보안(security 11-11): 인증키(serviceKey)는 요청 URL에만 쓰고 원문·배치·로그·오류 메시지에 싣지 않는다.
detail_url은 공고의 공개 링크(bidNtceDtlUrl)를 쓴다. https만 허용(평문 강등 없음).
개인정보(사용자 결정 11-12): 담당자 이름·전화·이메일 칸은 보관 전에 지우고, 남은 글도 연락처를 가린다.
"""

from __future__ import annotations

import datetime
import re
import json
import os
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterator
from urllib.parse import quote, urlsplit

from collector.httpclient import FetchError, HttpClient
from collector.privacy import mask_contacts, mask_hwpx, vaccine_policy
from collector.sources.base import NoticeRef, RawNotice, RunReport, SourceError, register
from collector.sources.g2b_results import CapReached, ResultLookup

ENV_FILE = Path(__file__).resolve().parents[1] / ".env.local"
OPERATION = "getBidPblancListInfoServcPPSSrch02"
# 개인정보(11-12): 남길 칸만 고른다 — 담당자 이름·전화·이메일 칸은 이름이 바뀌거나 늘어도 보관되지 않는다.
KEEP_FIELDS = ("bidNtceNo", "bidNtceOrd", "reNtceYn", "bidNtceNm", "ntceInsttNm", "ntceInsttCd", "dminsttNm",
               "dminsttCd", "bidNtceDt", "bidClseDt", "opengDt", "bidNtceDtlUrl", "cntrctCnclsMthdNm",
               "srvceDivNm", "presmptPrce", "asignBdgtAmt", "ntceKindNm", "bidMethdNm")
KEEP_PREFIX = ("ntceSpecDocUrl", "ntceSpecFileNm")
ALLOWED_DOC_HOST = "www.g2b.go.kr"
MAX_WINDOW_DAYS = 7
# '금고' 검색은 잡음이 많다(오금고등학교·새마을금고·요금고지서 — 2026-11-12 실측 76건). 금고 지정·주거래은행 문맥만 받는다.
RELEVANT = re.compile(r"주거래|지정금융기관|금고\(?(?:은행|지정|선정|업무|취급|사업자|운영|약정|입찰|관리)|\(금고\)")
NOISE = re.compile(r"요금고지|금고등학교|시스템|구축|유지보수|전산|감리|연계")


def relevant(title: str) -> bool:
    t = re.sub(r"\s+", "", title or "")
    return bool(RELEVANT.search(t)) and not NOISE.search(t)


def _load_env(path: Path = ENV_FILE) -> dict:
    env = {}
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    for k in ("G2B_ENDPOINT_URL", "G2B_SERVICE_KEY"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    return env


@dataclass(frozen=True)
class G2bConfig:
    keywords: tuple[str, ...] = ("주거래", "금고", "지정금융기관")
    lookback_days: int = 14             # --since가 없을 때 오늘부터 거꾸로
    max_calls: int = 200                # 하루 1000회 한도 안(실행당 상한)
    max_attachments: int = 5
    max_result_calls: int = 150         # 낙찰·개찰 조회 상한(목록 상한과 따로, 합쳐도 하루 1000회 안)
    delay_sec: float = 0.5
    timeout: float = 30.0
    env_file: Path = ENV_FILE


def _windows(since: datetime.date, until: datetime.date):
    start = since
    while start <= until:
        end = min(start + datetime.timedelta(days=MAX_WINDOW_DAYS - 1), until)
        yield start, end
        start = end + datetime.timedelta(days=1)


def _ymd(s: str | None) -> str | None:
    return s[:10] if s and len(s) >= 10 and s[4] == "-" else None


class G2bSource:
    slug = "g2b"
    name_ko = "나라장터 입찰공고(주거래은행·금고)"
    base_url = "https://apis.data.go.kr/1230000/ad/BidPublicInfoService02"

    def __init__(self, config: G2bConfig | None = None, http=None, env: dict | None = None,
                 today: datetime.date | None = None) -> None:
        self.config = config or G2bConfig()
        self._injected_http = http is not None
        self.http = http or HttpClient(timeout=self.config.timeout, delay=self.config.delay_sec)
        self._env = env
        self._today = today
        self._items: dict[str, dict] = {}
        self.calls = 0
        self._report: RunReport | None = None
        self._lookup: ResultLookup | None = None
        self._capped = False

    def with_config(self, http=None, env=None, today=None, hosts_file=None, **config) -> "G2bSource":
        # 주지 않은 연결·설정은 기존 값을 유지한다(시험용 가짜 API가 실제 호출로 바뀌지 않게).
        return G2bSource(replace(self.config, **config),
                         http if http is not None else (self.http if self._injected_http else None),
                         env if env is not None else self._env,
                         today if today is not None else self._today)

    def fetch(self):
        raise SourceError("g2b는 CLI로 실행합니다: python -m collector run --source g2b")

    def _endpoint(self) -> tuple[str, str]:
        env = self._env if self._env is not None else _load_env(self.config.env_file)
        base, key = env.get("G2B_ENDPOINT_URL", ""), env.get("G2B_SERVICE_KEY", "")
        if not base or not key:
            raise SourceError("나라장터 설정이 없습니다(collector/.env.local의 G2B_ENDPOINT_URL·G2B_SERVICE_KEY)")
        if urlsplit(base).scheme != "https":
            raise SourceError("나라장터 주소는 https여야 합니다")
        return base.rstrip("/"), key

    def _call(self, base: str, key: str, keyword: str, b: datetime.date, e: datetime.date, page: int) -> dict:
        if self.calls >= self.config.max_calls:
            raise SourceError(f"실행당 호출 상한({self.config.max_calls})에 닿았습니다 — 하루 1000회 한도 보호")
        self.calls += 1
        q = (f"serviceKey={quote(key, safe='')}&numOfRows=100&pageNo={page}&inqryDiv=1"
             f"&inqryBgnDt={b:%Y%m%d}0000&inqryEndDt={e:%Y%m%d}2359&bidNtceNm={quote(keyword, safe='')}&type=json")
        url = f"{base}/{OPERATION}?{q}"
        try:
            data, _ = self.http.get(url, verify=True)
        except FetchError as exc:          # 오류 문구에 URL(=키)을 싣지 않는다 — 기록은 키를 가린 URL(redact_url)
            if self._report is not None:
                self._report.record_failure(url, f"검색 '{keyword}' {b}~{e} {page}쪽", 1, exc, host="g2b")
            raise SourceError(f"나라장터 조회 실패: {exc}") from None
        try:
            resp = json.loads(data.decode("utf-8"))["response"]
            header = resp["header"]
            if header.get("resultCode") != "00":
                raise SourceError(f"나라장터 오류 {header.get('resultCode')}: {str(header.get('resultMsg'))[:80]}")
            body = resp["body"]
            items = body.get("items") or []
            if isinstance(items, dict):
                items = items.get("item") or []
            items = items if isinstance(items, list) else [items]
            return {"items": [i for i in items if isinstance(i, dict)], "totalCount": int(body.get("totalCount") or 0)}
        except (ValueError, KeyError, TypeError, AttributeError):
            raise SourceError("나라장터 응답 형식이 다릅니다(키 만료·서비스 변경 확인)") from None

    def list_new(self, seen, since=None, report=None, hosts=None) -> Iterator[NoticeRef]:
        report = report if report is not None else RunReport()
        self._report = report
        base, key = self._endpoint()
        today = self._today or datetime.date.today()
        start = (datetime.date.fromisoformat(since) if since
                 else today - datetime.timedelta(days=self.config.lookback_days))
        local: set[str] = set()
        for keyword in self.config.keywords:
            try:
                for b, e in _windows(start, today):
                    page = 1
                    while True:
                        body = self._call(base, key, keyword, b, e, page)
                        for it in body["items"]:
                            number = f"{it.get('bidNtceNo')}-{it.get('bidNtceOrd')}"
                            title = it.get("bidNtceNm") or ""
                            if keyword not in title.replace(" ", ""):
                                continue
                            dtl = it.get("bidNtceDtlUrl") or ""
                            p = urlsplit(dtl)
                            if p.scheme != "https" or p.hostname != ALLOWED_DOC_HOST:   # P3: 링크도 g2b https만
                                report.hosts_failed.setdefault("g2b:링크", f"공고 링크가 g2b https가 아님: {number}")
                                continue
                            ref = NoticeRef(source=self.slug, host="g2b", number=number, title=title,
                                            detail_url=it.get("bidNtceDtlUrl") or "",
                                            posted_at=_ymd(it.get("bidNtceDt")),
                                            department=it.get("ntceInsttNm"), native_id=it.get("bidNtceNo"))
                            if ref.key in local or seen.is_seen(ref.key) or not ref.detail_url:
                                continue
                            local.add(ref.key)
                            self._items[ref.key] = it
                            yield ref
                        total = body["totalCount"]
                        if page * 100 >= total:
                            break
                        page += 1
                report.hosts_ok.append(f"g2b:{keyword}")
            except SourceError as exc:
                report.hosts_failed[f"g2b:{keyword}"] = str(exc)[:200]

    def accepts(self, ref: NoticeRef) -> bool:
        return relevant(ref.title)          # 금고 지정·주거래은행 문맥만(잡음 제목은 원문을 받지 않는다)

    def _result_for(self, bid_no, bid_ord, opened: str | None) -> tuple[dict | None, str | None]:
        """개찰일이 지난 공고만 낙찰·개찰을 찾는다. 실패는 문구만 남기고 수집을 멈추지 않는다."""
        today = self._today or datetime.date.today()
        if not opened or opened >= today.isoformat() or not bid_no:
            return None, None
        try:
            if self._lookup is None:
                base, key = self._endpoint()
                self._lookup = ResultLookup(self.http, base, key, self._report, self.config.max_result_calls)
            return self._lookup.lookup(bid_no, bid_ord), None
        except CapReached as exc:
            self._capped = True
            return None, str(exc)[:120]
        except SourceError as exc:
            return None, str(exc)[:120]

    def refresh_results(self, state, store, report: RunReport | None = None) -> dict:
        """이미 받은 공고(원문 보관소)의 결과를 다시 찾는다 — 개찰 뒤 낙찰이 올라온 옛 공고 보강(NEXT 79).
        건너뜀: 낙찰이 이미 붙은 것, 유찰로 끝난 것(재공고는 새 번호로 따로 받는다), 개찰 전.
        덜 최근에 조회한 원문부터 돈다(상한에 닿아도 뒤쪽 원문이 굶지 않게 — security 11-13).
        meta.json만 원자적으로 고치고, 후보는 extract --all로 다시 만든다."""
        self._report = report if report is not None else RunReport()
        done = {"checked": 0, "award": 0, "opening": 0, "error": 0, "skipped": 0, "not_opened": 0}
        root = store.root.resolve()
        todo = []
        for _key, info in state.with_raw(self.slug, include_packed=True):
            raw_dir = (store.root / info["raw"]).resolve()
            meta_path, detail_path = raw_dir / "meta.json", raw_dir / "detail.html"
            try:
                if not raw_dir.is_relative_to(root) or meta_path.is_symlink() or detail_path.is_symlink():
                    raise ValueError("원문 폴더 밖")
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                item = json.loads(detail_path.read_text(encoding="utf-8"))
                if not isinstance(meta, dict) or not isinstance(item, dict):
                    raise ValueError("형식")
            except (OSError, ValueError):
                done["skipped"] += 1
                continue
            res = meta.get("g2b_result") or {}
            if res.get("award") or (res.get("opening") or {}).get("progrsDivCdNm") == "유찰":
                done["skipped"] += 1
                continue
            todo.append((str(meta.get("g2b_result_checked_at") or ""), meta_path, meta, item))
        todo.sort(key=lambda t: t[0])
        for _checked, meta_path, meta, item in todo:
            opened = _ymd(item.get("opengDt"))
            result, err = self._result_for(item.get("bidNtceNo"), item.get("bidNtceOrd"), opened)
            if result is None and err is None:
                done["not_opened"] += 1                # 개찰 전·개찰일 없음·공고번호 없음
                continue
            if self._capped:
                break                                  # 상한 — 이 원문은 고치지 않고 다음 실행에(조회가 덜 최근인 순)
            done["checked"] += 1
            meta["opened_at"] = opened
            meta["g2b_result_error"] = err
            if err:
                done["error"] += 1                     # 일시 오류 — 이전 결과(개찰완료 등)는 지우지 않는다
            else:
                meta["g2b_result"] = result
                meta["g2b_result_checked_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
                if result.get("award"):
                    done["award"] += 1
                elif result.get("opening"):
                    done["opening"] += 1
            tmp = meta_path.with_name("meta.json.tmp")   # 원자적 교체 — 중간에 끊겨도 meta.json이 잘리지 않는다
            tmp.write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
            os.replace(tmp, meta_path)
        done["calls"] = self._lookup.calls if self._lookup else 0
        done["fetch_failures"] = list(self._report.fetch_failures)
        return done

    def fetch_raw(self, ref: NoticeRef, store) -> RawNotice:
        src = self._items.get(ref.key)
        if not src:
            raise SourceError("목록 응답이 없는 공고입니다(list_new 뒤 같은 인스턴스로 받아야 함)")
        item = {k: v for k, v in src.items() if k in KEEP_FIELDS or k.startswith(KEEP_PREFIX)}
        text, masked = mask_contacts(json.dumps(item, ensure_ascii=False, indent=1))
        files: list[tuple[str, bytes]] = []
        errors: list[dict] = []
        unmaskable: list[str] = []
        for i in range(1, 11):
            if len(files) >= self.config.max_attachments:
                break
            url, name = item.get(f"ntceSpecDocUrl{i}"), item.get(f"ntceSpecFileNm{i}")
            if not url or not name:
                continue
            p = urlsplit(url)
            if p.scheme != "https" or p.hostname != ALLOWED_DOC_HOST:
                errors.append({"name": name, "error": "허용하지 않는 첨부 주소"})
                continue
            from collector.sources.eminwon import ALLOWED_EXT, MAX_ATTACHMENT_BYTES, signature_ok
            if not name.lower().endswith(ALLOWED_EXT):
                errors.append({"name": name, "error": "허용하지 않는 확장자"})
                continue
            try:
                blob, _ = self.http.get(url, verify=True)
            except FetchError as exc:
                if self._report is not None:
                    self._report.record_failure(url, f"첨부 {ref.number} {name}"[:120], 1, exc, host="g2b")
                errors.append({"name": name, "error": str(exc)[:120]})
                continue
            if len(blob) > MAX_ATTACHMENT_BYTES or not signature_ok(name, blob):
                errors.append({"name": name, "error": "크기 초과 또는 파일 서명 불일치(받지 않음)"})
                continue
            if name.lower().endswith(".hwpx"):
                try:
                    blob, n = mask_hwpx(blob)
                    masked += n
                except ValueError as exc:
                    errors.append({"name": name, "error": str(exc)})
                    continue
            else:
                unmaskable.append(name)
            files.append((name, blob))
        inst = item.get("dminsttNm") or item.get("ntceInsttNm") or "미상"
        opened = _ymd(item.get("opengDt"))
        result, result_error = self._result_for(item.get("bidNtceNo"), item.get("bidNtceOrd"), opened)
        meta = {
            "source": self.slug, "host": "g2b", "number": ref.number, "title": ref.title,
            "posted_at": ref.posted_at, "department": item.get("ntceInsttNm"), "native_id": ref.native_id,
            "detail_url": ref.detail_url, "encoding": "utf-8", "contacts_masked": masked,
            "unmaskable_attachments": unmaskable, "vaccine": vaccine_policy(ref.detail_url, relaxed=False),
            "deadline_at": _ymd(item.get("bidClseDt")), "re_notice": item.get("reNtceYn") == "Y",
            "institution": {"key": None, "name_ko": inst, "region_code": None, "type": "공공기관",
                            "org_code_g2b": item.get("dminsttCd")},
            "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "attachment_errors": errors,
            "opened_at": opened, "g2b_result": result, "g2b_result_error": result_error,
        }
        raw_dir = store.write(self.slug, "g2b", ref.number, text.encode("utf-8"), files, meta)
        return RawNotice(ref=ref, raw_dir=raw_dir, rel=store.rel(raw_dir))


register(G2bSource())
