"""eminwon(새올 고시공고) 금고 공고 소스. 사이트 차이는 config/eminwon_hosts.json 한 곳에만 둔다.

조회 요령(collector/SOURCES.md S1): HTTP/1.1 + 브라우저 UA, 목록 제목 검색 '금고'(UTF-8 퍼센트 인코딩),
상세 not_ancmt_mgt_no, 첨부 FileDown.jsp. https가 안 되는 호스트는 설정의 schemes로 http를 허용한다.
"""

from __future__ import annotations

import datetime
import json
import re
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterator
from urllib.parse import quote

from collector.extract.classify import classify, is_watch_kind
from collector.httpclient import (ALLOWED_CIPHERS, FetchConnError, FetchError, FetchHttpError, FetchTimeoutError,
                                  FetchTlsError, FetchTlsHandshakeError, HttpClient, TlsPolicy)
from collector.privacy import mask_contacts, mask_hwpx, vaccine_policy
from collector.sources.base import NoticeRef, RawNotice, RunReport, SourceError, register
from collector.sources.eminwon_parse import decode_body, parse_attachments, parse_list
from collector.tlscert import PIN_RE, parse_cert, pem_certs

LIST_PATH = "/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do"
FILE_PATH = "/emwp/jsp/ofr/FileDown.jsp"
DEFAULT_HOSTS_FILE = Path(__file__).resolve().parents[1] / "config" / "eminwon_hosts.json"
HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$")
CA_DIR = Path(__file__).resolve().parents[1] / "config" / "ca"   # ca_extra는 이 폴더의 .pem만(security 11-12)
CA_PREFIX = "collector/config/ca/"
CA_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,80}\.pem$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_REVIEW_DAYS = 366
ALLOWED_EXT = (".hwpx", ".pdf", ".hwp")
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
# 확장자별 파일 서명(내용 확인) — 이름만 .pdf인 바이너리가 망 안으로 들어가지 않게(security 7d2ac90).
SIGNATURES = {".pdf": (b"%PDF-",), ".hwpx": (b"PK\x03\x04",), ".hwp": (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)}


def signature_ok(name: str, blob: bytes) -> bool:
    ext = "." + name.lower().rsplit(".", 1)[-1] if "." in name else ""
    return any(blob.startswith(sig) for sig in SIGNATURES.get(ext, ()))


@dataclass(frozen=True)
class HostEntry:
    host: str
    key: str                       # "region|name" — frontend/data 기관 key
    name_ko: str
    region_code: str | None = None
    type: str | None = None
    tls_verify: bool = True        # 항상 True — false는 로더가 거부(security 11-12)
    schemes: tuple[str, ...] = ("https",)
    tls: TlsPolicy | None = None   # 호스트 단위 TLS 예외(ca_extra·ciphers·pin_sha256). 없으면 기본 검증
    tls_reason: str | None = None  # 실측 오류 문구
    tls_measured: str | None = None
    tls_review_by: str | None = None   # 지나면 실행 보고 warnings
    known_failing: str | None = None       # 늘 실패하는 호스트의 사유(알려진 실패 — 종료 코드 3 제외)
    known_failing_since: str | None = None # 표시 등록일 YYYY-MM-DD

    @property
    def tls_relaxed(self) -> bool:
        return bool(self.tls and self.tls.relaxed)


@dataclass(frozen=True)
class EminwonConfig:
    hosts_file: Path = DEFAULT_HOSTS_FILE
    keyword: str = "금고"
    page_size: int = 50
    max_pages: int = 3
    max_attachments: int = 5
    delay_sec: float = 1.0
    timeout: float = 45.0                              # security 11-12: 단일 45초(urllib은 연결·읽기를 못 나눈다)
    retry_backoff: tuple[float, ...] = (30.0, 90.0)    # 시간 초과·연결 실패 재시도 간격(최대 2회)
    handshake_retries: int = 1                         # 인증서 검증이 아닌 핸드셰이크 실패(메인 실측 11-12)
    second_pass: bool = True                           # 실행 끝에 일시 실패 호스트만 1회 더(재시도 없이)
    max_run_sec: float = 3 * 3600                      # 이 시간을 넘기면 백오프·2nd pass 생략(잠금 6시간 안, qa 11-12 P2-1)


def _bad(host: str, why: str) -> SourceError:
    return SourceError(f"호스트 설정이 올바르지 않습니다: {host!r} — {why}")


def _date(item: dict, name: str, host: str) -> str | None:
    v = item.get(name)
    if v is None:
        return None
    try:
        if not isinstance(v, str) or not DATE_RE.match(v):
            raise ValueError
        datetime.date.fromisoformat(v)
    except ValueError:
        raise _bad(host, f"{name}는 YYYY-MM-DD") from None
    return v


def _ca_file(value, host: str, ca_dir: Path) -> Path:
    name = value[len(CA_PREFIX):] if isinstance(value, str) and value.startswith(CA_PREFIX) else value
    if not isinstance(name, str) or not CA_NAME_RE.match(name) or ".." in name:
        raise _bad(host, "ca_extra는 collector/config/ca/ 안의 .pem 파일 이름만")
    base = Path(ca_dir).resolve()
    path = (base / name).resolve()
    if path.parent != base or not path.is_file():
        raise _bad(host, f"ca_extra 파일이 없습니다({name})")
    try:
        infos = [parse_cert(d) for d in pem_certs(path.read_text(encoding="ascii"))]
    except (OSError, ValueError) as exc:
        raise _bad(host, f"ca_extra를 읽을 수 없습니다({name})") from exc
    if len(infos) > 3 or not all(i.is_ca and not i.self_issued for i in infos):
        raise _bad(host, "ca_extra에는 중간 CA 인증서만(루트·서버 인증서 불가)")
    return path


def _tls_policy(item: dict, host: str, schemes: tuple[str, ...], ca_dir: Path) -> TlsPolicy | None:
    if "min_tls" in item:
        raise _bad(host, "min_tls는 지원하지 않습니다")
    ca, ciphers, pins = item.get("ca_extra"), item.get("ciphers"), item.get("pin_sha256")
    if ca is None and ciphers is None and pins is None:
        return None
    if schemes != ("https",):
        raise _bad(host, "TLS 예외 호스트는 schemes가 https 하나여야 합니다")
    if ciphers is not None and ciphers not in ALLOWED_CIPHERS:
        raise _bad(host, "ciphers는 허용 목록 값만(httpclient.ALLOWED_CIPHERS)")
    pin_t: tuple[str, ...] = ()
    if pins is not None:
        if (not isinstance(pins, list) or not 1 <= len(pins) <= 2
                or not all(isinstance(p, str) and PIN_RE.match(p.lower()) for p in pins)):
            raise _bad(host, "pin_sha256은 SPKI sha256 hex 64자 1~2개")
        if ca is not None:
            raise _bad(host, "pin_sha256과 ca_extra는 함께 쓸 수 없습니다")
        pin_t = tuple(p.lower() for p in pins)
    return TlsPolicy(ca_file=_ca_file(ca, host, ca_dir) if ca is not None else None,
                     ciphers=ciphers, pins=pin_t)


def load_hosts(path: Path, ca_dir: Path = CA_DIR) -> tuple[HostEntry, ...]:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        items = raw["hosts"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SourceError(f"호스트 설정을 읽을 수 없습니다: {Path(path).name}") from exc
    out: dict[str, HostEntry] = {}
    for item in items:
        host = str(item.get("host", "")).strip().lower()
        schemes = tuple(item.get("schemes") or ("https",))     # 기본 https만 — 일반 실패 시 http 강등 없음(security 11-12)
        if not HOST_RE.match(host) or not set(schemes) <= {"https", "http"}:
            raise SourceError(f"호스트 설정이 올바르지 않습니다: {host!r}")
        if item.get("tls_verify", True) is not True:
            raise _bad(host, "tls_verify false는 허용하지 않습니다(검증 끄기 금지 — ca_extra·pin_sha256으로)")
        tls = _tls_policy(item, host, schemes, ca_dir)
        reason = item.get("tls_reason")
        if reason is not None and (not isinstance(reason, str) or not reason.strip() or len(reason) > 300):
            raise _bad(host, "tls_reason은 300자 이내 글")
        measured, review = _date(item, "tls_measured", host), _date(item, "tls_review_by", host)
        if tls is not None and not (reason and measured and review):
            raise _bad(host, "TLS 예외에는 tls_reason·tls_measured·tls_review_by가 필요합니다")
        known = item.get("known_failing")
        if known is not None and (not isinstance(known, str) or not known.strip() or len(known) > 300):
            raise _bad(host, "known_failing은 300자 이내 사유 글")
        known_since = _date(item, "known_failing_since", host)
        if known is not None and not known_since:
            raise _bad(host, "known_failing에는 known_failing_since(YYYY-MM-DD)가 필요합니다")
        if measured and review:
            d0, d1 = datetime.date.fromisoformat(measured), datetime.date.fromisoformat(review)
            if not d0 < d1 <= d0 + datetime.timedelta(days=MAX_REVIEW_DAYS):
                raise _bad(host, "tls_review_by는 tls_measured 뒤 1년 안")
        out[host] = HostEntry(host=host, key=item.get("key") or host, name_ko=item.get("name_ko") or host,
                              region_code=item.get("region_code"), type=item.get("type"),
                              tls_verify=True, schemes=schemes, tls=tls, tls_reason=reason,
                              tls_measured=measured, tls_review_by=review,
                              known_failing=known, known_failing_since=known_since)
    return tuple(out.values())


def _query(params) -> str:
    return "&".join(f"{k}={quote(v, safe=',')}" for k, v in params)


class EminwonSource:
    slug = "eminwon"
    name_ko = "eminwon 고시공고(금고)"
    base_url = "urn:eminwon:multi-host"

    def __init__(self, config: EminwonConfig | None = None, http=None,
                 hosts: tuple[HostEntry, ...] | None = None, sleep=None,
                 today: datetime.date | None = None) -> None:
        self.config = config or EminwonConfig()
        self.http = http or HttpClient(timeout=self.config.timeout, delay=self.config.delay_sec)
        self._hosts = hosts
        self._scheme: dict[str, str] = {}
        self._sleep = sleep or time.sleep          # 재시도 백오프(시험에서 주입)
        self._today = today
        self._deadline: float | None = None       # list_new 시작 때 정함(time.monotonic 기준)

    def with_config(self, hosts_file=None, http=None, hosts=None, sleep=None, today=None,
                    **config) -> "EminwonSource":
        cfg = replace(self.config, **config)
        if hosts_file:
            cfg = replace(cfg, hosts_file=Path(hosts_file))
        return EminwonSource(cfg, http, hosts, sleep, today)

    def hosts(self) -> tuple[HostEntry, ...]:
        if self._hosts is None:
            self._hosts = load_hosts(self.config.hosts_file)
        return self._hosts

    def _select(self, wanted: list[str] | None) -> list[HostEntry]:
        if not wanted:
            return list(self.hosts())
        by = {}
        for e in self.hosts():
            by[e.host] = e
            by[e.key] = e
        unknown = [w for w in wanted if w not in by]
        if unknown:
            raise SourceError(f"설정에 없는 호스트/기관: {', '.join(unknown)}")
        return list(dict.fromkeys(by[w] for w in wanted))

    def _entry(self, host: str) -> HostEntry:
        return self._select([host])[0]

    # 기존 Source 계약(웹 API /collect) — 이 소스는 CLI 전용이라 막는다.
    def fetch(self):
        raise SourceError("eminwon은 CLI로 실행합니다: python -m collector run --source eminwon")

    def _fetch(self, entry: HostEntry, url: str, retries: bool):
        """시간 초과·연결 실패는 backoff 간격으로 최대 len(backoff)회, 핸드셰이크 실패는 handshake_retries회 재시도.
        인증서 검증 오류·HTTP 오류는 재시도하지 않는다(security 11-12)."""
        if self._deadline is not None and time.monotonic() > self._deadline:
            retries = False                    # 실행 전체 상한을 넘김 — 더 기다리지 않는다
        backoff = tuple(self.config.retry_backoff) if retries else ()
        handshake_left = self.config.handshake_retries if retries else 0
        for attempt in range(len(backoff) + 1):
            try:
                if entry.tls is None:
                    return self.http.get(url, verify=True)          # 가짜 HTTP(시험)와 같은 시그니처 유지
                return self.http.get(url, verify=True, tls=entry.tls)
            except FetchTlsHandshakeError:
                if handshake_left <= 0 or attempt >= len(backoff):
                    raise
                handshake_left -= 1
            except FetchTimeoutError:
                if attempt >= len(backoff):
                    raise
            self._sleep(backoff[attempt])
        raise FetchError("연결 실패")                               # 도달하지 않음

    def _get(self, entry: HostEntry, path_query: str, retries: bool = True):
        order = list(entry.schemes)
        pref = self._scheme.get(entry.host)
        if pref in order:
            order.remove(pref)
            order.insert(0, pref)
        last: FetchError | None = None
        for scheme in order:
            url = f"{scheme}://{entry.host}{path_query}"
            try:
                data, charset = self._fetch(entry, url, retries)
            except (FetchHttpError, FetchTlsError):
                raise                      # 서버 응답 오류·인증서 오류는 http로 내려가 재시도하지 않는다
            except FetchError as exc:
                last = exc
                continue
            self._scheme[entry.host] = scheme
            return url, data, charset
        raise last or FetchError("연결 실패")

    def _list_query(self, page: int) -> str:
        c = self.config
        return _query([
            ("context", "NTIS"), ("jndinm", "OfrNotAncmtEJB"), ("method", "selectListOfrNotAncmt"),
            ("methodnm", "selectListOfrNotAncmtHomepage"), ("homepage_pbs_yn", "Y"), ("subCheck", "Y"),
            ("not_ancmt_se_code", "01,02,03,04,05,06,07"), ("not_ancmt_sj", c.keyword),
            ("s_gubun", "글제목"), ("ofr_pageSize", str(c.page_size)), ("pageIndex", str(page)),
            ("initValue", "Y"), ("countYn", "Y"), ("dep_se", "%")])

    @staticmethod
    def _detail_query(mgt_no: str) -> str:
        return _query([("context", "NTIS"), ("jndinm", "OfrNotAncmtEJB"),
                       ("method", "selectOfrNotAncmt"), ("methodnm", "selectOfrNotAncmtRegst"),
                       ("homepage_pbs_yn", "Y"), ("subCheck", "Y"),
                       ("not_ancmt_se_code", "01,02,03,04,05,06,07"), ("initValue", "Y"),
                       ("countYn", "Y"), ("pageIndex", "1"), ("not_ancmt_mgt_no", mgt_no)])

    def _list_host(self, entry: HostEntry, retries: bool = True):
        rows, seen_ids = [], set()
        for page in range(1, self.config.max_pages + 1):
            _, data, charset = self._get(entry, f"{LIST_PATH}?{self._list_query(page)}", retries)
            page_rows = [r for r in parse_list(decode_body(data, charset)[0]) if r.mgt_no not in seen_ids]
            seen_ids.update(r.mgt_no for r in page_rows)
            rows.extend(page_rows)
            if len(page_rows) < self.config.page_size:
                break
        kw = self.config.keyword
        return [r for r in rows if kw in r.title.replace(" ", "")]

    def _refs(self, entry: HostEntry, rows, seen, since) -> Iterator[NoticeRef]:
        scheme = self._scheme.get(entry.host, "https")
        local: set[str] = set()
        for r in rows:
            if since and r.posted_at and r.posted_at < since:
                continue
            number = r.number or f"mgt{r.mgt_no}"
            ref = NoticeRef(
                source=self.slug, host=entry.host, number=number, title=r.title,
                detail_url=f"{scheme}://{entry.host}{LIST_PATH}?{self._detail_query(r.mgt_no)}",
                posted_at=r.posted_at, department=r.department, native_id=r.mgt_no)
            if ref.key in local or seen.is_seen(ref.key):
                continue
            local.add(ref.key)
            yield ref

    @staticmethod
    def _mark_ok(entry: HostEntry, report: RunReport) -> None:
        report.hosts_ok.append(entry.host)
        if entry.known_failing:
            report.warnings.append(f"{entry.host}: 알려진 실패 호스트가 성공 — 표시 해제 검토")

    def _review_warnings(self, entries, report: RunReport) -> None:
        today = (self._today or datetime.date.today()).isoformat()
        for e in entries:
            if e.tls_review_by and e.tls_review_by < today:
                report.warnings.append(f"{e.host}: TLS 예외 재검토일({e.tls_review_by}) 지남 — 다시 실측해 설정을 갱신하세요")

    def list_new(self, seen, since=None, report=None, hosts=None) -> Iterator[NoticeRef]:
        report = report if report is not None else RunReport()
        entries = self._select(hosts)
        self._review_warnings(entries, report)
        report.known_failing.update({e.host: e.known_failing for e in entries if e.known_failing})
        self._deadline = time.monotonic() + self.config.max_run_sec
        retry_later: list[HostEntry] = []
        for entry in entries:
            try:
                rows = self._list_host(entry)
            except FetchError as exc:
                report.hosts_failed[entry.host] = str(exc)[:200]
                if isinstance(exc, (FetchConnError, FetchTlsHandshakeError)):
                    retry_later.append(entry)
                continue
            self._mark_ok(entry, report)
            yield from self._refs(entry, rows, seen, since)
        if not self.config.second_pass:
            return
        if retry_later and time.monotonic() > self._deadline:
            report.warnings.append(f"실행 상한({int(self.config.max_run_sec // 60)}분) 초과 — 2nd pass 생략 {len(retry_later)}곳")
            return
        for entry in retry_later:          # 2nd pass: 일시 실패 호스트만, 재시도 없이 1회(시간 상한)
            try:
                rows = self._list_host(entry, retries=False)
            except FetchError as exc:
                report.hosts_failed[entry.host] = f"재수거도 실패: {exc}"[:200]
                continue
            del report.hosts_failed[entry.host]
            self._mark_ok(entry, report)
            yield from self._refs(entry, rows, seen, since)

    def accepts(self, ref: NoticeRef) -> bool:
        return is_watch_kind(classify(ref.title))

    def fetch_raw(self, ref: NoticeRef, store) -> RawNotice:
        entry = self._entry(ref.host)
        try:
            _, data, charset = self._get(entry, f"{LIST_PATH}?{self._detail_query(ref.native_id or '')}")
        except FetchError as exc:
            raise SourceError(f"상세 조회 실패({ref.host}): {exc}") from exc
        text, encoding = decode_body(data, charset)
        files: list[tuple[str, bytes]] = []
        errors: list[dict] = []
        masked_text, masked_n = mask_contacts(text)          # 사용자 결정 11-12: 연락처 전부 가림
        detail_bytes = masked_text.encode("utf-8")
        unmaskable: list[str] = []
        for link in parse_attachments(text)[: self.config.max_attachments]:
            name = link.user_file_nm
            if not name.lower().endswith(ALLOWED_EXT):
                errors.append({"name": name, "error": "허용하지 않는 확장자"})
                continue
            path_q = (f"{FILE_PATH}?user_file_nm={quote(link.user_file_nm, safe='')}"
                      f"&sys_file_nm={quote(link.sys_file_nm, safe='')}"
                      f"&file_path={quote(link.file_path, safe='')}")
            try:
                _, blob, _ = self._get(entry, path_q)
            except FetchError as exc:
                errors.append({"name": name, "error": str(exc)[:120]})
                continue
            if len(blob) > MAX_ATTACHMENT_BYTES:
                errors.append({"name": name, "error": "첨부가 너무 큽니다"})
                continue
            if not signature_ok(name, blob):
                errors.append({"name": name, "error": "파일 서명이 확장자와 다릅니다(받지 않음)"})
                continue
            if name.lower().endswith(".hwpx"):
                try:
                    blob, n = mask_hwpx(blob)
                    masked_n += n
                except ValueError as exc:
                    errors.append({"name": name, "error": str(exc)})
                    continue
            else:
                unmaskable.append(name)                     # PDF·구형 HWP — 망 안 배치에는 싣지 않는다
            files.append((name, blob))
        scheme = self._scheme.get(entry.host, entry.schemes[0])
        meta = {
            "source": self.slug, "host": ref.host, "number": ref.number, "title": ref.title,
            "posted_at": ref.posted_at, "department": ref.department, "native_id": ref.native_id,
            "detail_url": ref.detail_url, "encoding": "utf-8", "source_encoding": encoding,
            "contacts_masked": masked_n, "unmaskable_attachments": unmaskable,
            "vaccine": vaccine_policy(entry.host, scheme, relaxed=entry.tls_relaxed),
            "institution": {"key": entry.key, "name_ko": entry.name_ko,
                            "region_code": entry.region_code, "type": entry.type},
            "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "attachment_errors": errors,
        }
        raw_dir = store.write(self.slug, ref.host, ref.number, detail_bytes, files, meta)
        return RawNotice(ref=ref, raw_dir=raw_dir, rel=store.rel(raw_dir))


register(EminwonSource())
