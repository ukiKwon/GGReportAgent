"""대법원 새소식(gubun=3) — 공탁금 보관은행 공고 소스(S5, NEXT 81).

실측(2026-11-13): 목록 POST NewsListAction.work?gubun=3 (본문 searchWord=cp949 퍼센트 인코딩), 응답 cp949,
상세 GET NewsViewAction.work, 첨부는 페이지의 download('<fid>','<name>') → POST file.scourt.go.kr//AttachDownload.
키 없음. https만, 요청 주소는 www.scourt.go.kr·file.scourt.go.kr 두 호스트로만 만든다(목록·상세에서 읽은 값은
주소로 쓰지 않고 숫자 seqnum과 fid 문자 검사를 거친 값만 본문·질의에 넣는다).
수집기는 판단하지 않는다 — 종류 판정(classify_court)과 법원별 후보 추출은 extract/court.py.
"""

from __future__ import annotations

import datetime
import html
import re
import time
from dataclasses import dataclass, replace
from typing import Iterator
from urllib.parse import quote_plus, urlsplit

from collector.extract.classify import classify_court
from collector.extract.terms import iso
from collector.httpclient import FetchError, FetchTimeoutError, HttpClient, error_kind
from collector.privacy import mask_contacts, mask_hwpx, vaccine_policy
from collector.sources.base import NoticeRef, RawNotice, RunReport, SourceError, register
from collector.sources.eminwon import ALLOWED_EXT, MAX_ATTACHMENT_BYTES, signature_ok
from collector.sources.eminwon_parse import CELL_RE, DATE_RE, NUMBER_RE, ROW_RE, clean, decode_body

LIST_URL = "https://www.scourt.go.kr/portal/news/NewsListAction.work?gubun=3"
VIEW_URL = "https://www.scourt.go.kr/portal/news/NewsViewAction.work"
FILE_URL = "https://file.scourt.go.kr//AttachDownload"      # 슬래시 두 개는 원래 주소 그대로
HOST = "scourt.go.kr"                                       # 증분 키의 host 칸
ALLOWED_HOSTS = {"www.scourt.go.kr", "file.scourt.go.kr"}
ANCHOR_RE = re.compile(r"<a\b[^>]{0,500}seqnum=(\d{1,9})(?!\d)[^>]{0,500}>(.{0,2000}?)</a>", re.S | re.I)   # 길이 상한(security 11-13)
DOWNLOAD_RE = re.compile(r"download\(\s*['\"]([^'\"]*)['\"]\s*,\s*['\"]([^'\"]*)['\"]\s*\)")
FID_RE = re.compile(r"^[A-Za-z0-9_.\-]{1,120}$")


@dataclass(frozen=True)
class ScourtConfig:
    keyword: str = "공탁금 보관은행"
    page_size: int = 20
    max_pages: int = 5                  # 100건 — 연 몇 건뿐인 공고를 2020년분까지 한 번에 거슬러 받기에 충분
    max_attachments: int = 5
    delay_sec: float = 1.0
    timeout: float = 45.0
    retry_backoff: tuple[float, ...] = (30.0, 90.0)     # 시간 초과만 재시도(eminwon과 같은 규칙)


@dataclass(frozen=True)
class ListRow:
    seqnum: str
    title: str
    posted_at: str | None


def parse_list(text: str) -> list[ListRow]:
    """목록 HTML → 행. seqnum이 든 링크가 있는 <tr>만. 날짜는 날짜 모양의 칸."""
    rows: list[ListRow] = []
    seen: set[str] = set()
    for row in ROW_RE.findall(text):
        a = ANCHOR_RE.search(row)
        if not a or a.group(1) in seen:
            continue
        title = clean(a.group(2))
        if not title:
            continue
        date = None
        for cell in CELL_RE.findall(row):
            c = clean(cell)
            d = DATE_RE.match(c) if len(c) <= 14 else None
            if d:
                date = iso(*d.groups())
                break
        seen.add(a.group(1))
        rows.append(ListRow(a.group(1), title, date))
    return rows


def parse_downloads(text: str) -> list[tuple[str, str]]:
    return [(m.group(1), html.unescape(m.group(2)).strip()) for m in DOWNLOAD_RE.finditer(text)]


class ScourtSource:
    slug = "scourt"
    name_ko = "대법원 새소식(공탁금 보관은행)"
    base_url = LIST_URL

    def __init__(self, config: ScourtConfig | None = None, http=None, sleep=None) -> None:
        self.config = config or ScourtConfig()
        self._injected_http = http is not None
        self.http = http or HttpClient(timeout=self.config.timeout, delay=self.config.delay_sec)
        self._sleep = sleep or time.sleep
        self._report: RunReport | None = None

    def with_config(self, http=None, sleep=None, hosts_file=None, today=None, **config) -> "ScourtSource":
        # 주지 않은 연결은 기존 값을 유지한다(g2b와 같은 규칙 — 시험용 가짜 HTTP가 실제 호출로 바뀌지 않게).
        return ScourtSource(replace(self.config, **config),
                            http if http is not None else (self.http if self._injected_http else None),
                            sleep if sleep is not None else self._sleep)

    def fetch(self):
        raise SourceError("scourt는 CLI로 실행합니다: python -m collector run --source scourt")

    # ── 요청: https + 두 호스트만, 시간 초과만 백오프 재시도, 마지막 실패는 fetch_failures에 기록 ──
    @staticmethod
    def _guard(url: str) -> None:
        p = urlsplit(url)
        if p.scheme != "https" or p.hostname not in ALLOWED_HOSTS:
            raise SourceError("허용하지 않는 주소입니다")

    def _request(self, method: str, url: str, purpose: str, body: bytes | None = None):
        self._guard(url)
        backoff = tuple(self.config.retry_backoff)
        for attempt in range(len(backoff) + 1):
            try:
                if method == "POST":
                    return self.http.post(url, body, verify=True)
                return self.http.get(url, verify=True)
            except FetchTimeoutError as exc:
                if attempt >= len(backoff):
                    self._record(url, purpose, attempt + 1, exc)
                    raise
            except FetchError as exc:
                self._record(url, purpose, attempt + 1, exc)
                raise
            self._sleep(backoff[attempt])
        raise FetchError("연결 실패")                    # 도달하지 않음

    def _record(self, url, purpose, attempts, exc) -> None:
        if self._report is not None:
            self._report.record_failure(url, purpose, attempts, exc, host=urlsplit(url).hostname or HOST)

    def _list_body(self, page: int) -> bytes:
        kw = quote_plus(self.config.keyword, encoding="cp949")      # 검색어는 cp949(응답도 cp949)
        return f"searchOption=&searchWord={kw}&pageIndex={page}&pageSize={self.config.page_size}".encode("ascii")

    @staticmethod
    def _detail_url(seqnum: str) -> str:
        if not seqnum.isdigit():
            raise SourceError("공고 번호 형식이 올바르지 않습니다")
        return f"{VIEW_URL}?pageIndex=1&searchWord=&searchOption=&seqnum={seqnum}&gubun=3"

    def list_new(self, seen, since=None, report=None, hosts=None) -> Iterator[NoticeRef]:
        """hosts는 쓰지 않는다(단일 사이트). 목록은 최신순이라 since보다 오래된 쪽이 나오면 멈춘다."""
        report = report if report is not None else RunReport()
        self._report = report
        kw = self.config.keyword.replace(" ", "")
        rows: list[ListRow] = []
        failed = False
        for page in range(1, self.config.max_pages + 1):
            try:
                data, charset = self._request("POST", LIST_URL, f"목록 {page}쪽", self._list_body(page))
            except FetchError as exc:
                report.hosts_failed[HOST] = str(exc)[:200]
                report.hosts_failed_kind[HOST] = error_kind(exc)
                failed = True
                break
            page_rows = parse_list(decode_body(data, charset)[0])
            if page == 1 and not page_rows:
                report.warnings.append("scourt: 목록 1쪽에서 공고를 찾지 못함(검색 결과 없음이거나 화면 형식이 바뀜 — 확인 필요)")
            rows.extend(page_rows)
            if len(page_rows) < self.config.page_size:
                break
            if since and page_rows and all(r.posted_at and r.posted_at < since for r in page_rows):
                break
        if not failed:
            report.hosts_ok.append(HOST)
        local: set[str] = set()
        for r in rows:
            if kw not in r.title.replace(" ", ""):
                continue
            if since and r.posted_at and r.posted_at < since:
                continue
            ref = NoticeRef(source=self.slug, host=HOST, number=f"seq{r.seqnum}", title=r.title,
                            detail_url=self._detail_url(r.seqnum), posted_at=r.posted_at, native_id=r.seqnum)
            if ref.key in local or seen.is_seen(ref.key):
                continue
            local.add(ref.key)
            yield ref

    def accepts(self, ref: NoticeRef) -> bool:
        return classify_court(ref.title) in ("계획", "지정", "기타")

    def fetch_raw(self, ref: NoticeRef, store) -> RawNotice:
        url = self._detail_url(ref.native_id or "")
        try:
            data, charset = self._request("GET", url, f"상세 {ref.number}")
        except FetchError as exc:
            raise SourceError(f"상세 조회 실패(scourt): {exc}") from exc
        text, encoding = decode_body(data, charset)
        masked_text, masked_n = mask_contacts(text)                 # 사용자 결정 11-12: 연락처 전부 가림
        files: list[tuple[str, bytes]] = []
        errors: list[dict] = []
        unmaskable: list[str] = []
        links = parse_downloads(text)
        if not links:
            errors.append({"name": "", "error": "첨부 없음"})        # 2017~2019 공고 — 읽기 불가 기록의 근거
        for fid, name in links[: self.config.max_attachments]:
            if not name.lower().endswith(ALLOWED_EXT):
                errors.append({"name": name[:80], "error": "허용하지 않는 확장자"})
                continue
            if not FID_RE.match(fid):
                errors.append({"name": name[:80], "error": "첨부 식별자 형식이 올바르지 않음(받지 않음)"})
                continue
            try:
                blob, _ = self._request("POST", FILE_URL, mask_contacts(f"첨부 {ref.number} {name}")[0][:120],
                                        f"file={quote_plus(fid)}&path=001&downFile=x".encode("ascii"))
            except FetchError as exc:
                errors.append({"name": name[:80], "error": str(exc)[:120]})
                continue
            if len(blob) > MAX_ATTACHMENT_BYTES:
                errors.append({"name": name[:80], "error": "첨부가 너무 큽니다"})
                continue
            if not signature_ok(name, blob):
                errors.append({"name": name[:80], "error": "파일 서명이 확장자와 다릅니다(받지 않음)"})
                continue
            if name.lower().endswith(".hwpx"):
                try:
                    blob, n = mask_hwpx(blob)
                    masked_n += n
                except ValueError as exc:
                    errors.append({"name": name[:80], "error": str(exc)})
                    continue
            else:
                unmaskable.append(name)                              # 구형 HWP·PDF — 망 안 배치에는 싣지 않는다
            files.append((name, blob))
        number_m = NUMBER_RE.search(ref.title)
        meta = {
            "source": self.slug, "host": HOST, "number": ref.number, "title": ref.title,
            "posted_at": ref.posted_at, "department": None, "native_id": ref.native_id,
            "detail_url": url, "encoding": "utf-8", "source_encoding": encoding,
            "contacts_masked": masked_n, "unmaskable_attachments": unmaskable,
            "vaccine": vaccine_policy(url, relaxed=False),           # https + go.kr → 생략
            "notice_no": f"제{number_m.group(1)}-{number_m.group(2)}호" if number_m else None,
            "institution": {"key": None, "name_ko": "법원행정처", "region_code": None, "type": "법원"},
            "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "attachment_errors": errors,
        }
        raw_dir = store.write(self.slug, HOST, ref.number, masked_text.encode("utf-8"), files, meta)
        return RawNotice(ref=ref, raw_dir=raw_dir, rel=store.rel(raw_dir))


register(ScourtSource())
