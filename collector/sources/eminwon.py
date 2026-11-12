"""eminwon(새올 고시공고) 금고 공고 소스. 사이트 차이는 config/eminwon_hosts.json 한 곳에만 둔다.

조회 요령(collector/SOURCES.md S1): HTTP/1.1 + 브라우저 UA, 목록 제목 검색 '금고'(UTF-8 퍼센트 인코딩),
상세 not_ancmt_mgt_no, 첨부 FileDown.jsp. https가 안 되는 호스트는 설정의 schemes로 http를 허용한다.
"""

from __future__ import annotations

import datetime
import json
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Iterator
from urllib.parse import quote

from collector.extract.classify import classify, is_watch_kind
from collector.httpclient import FetchError, FetchHttpError, FetchTlsError, HttpClient
from collector.privacy import mask_contacts, mask_hwpx, vaccine_policy
from collector.sources.base import NoticeRef, RawNotice, RunReport, SourceError, register
from collector.sources.eminwon_parse import decode_body, parse_attachments, parse_list

LIST_PATH = "/emwp/gov/mogaha/ntis/web/ofr/action/OfrAction.do"
FILE_PATH = "/emwp/jsp/ofr/FileDown.jsp"
DEFAULT_HOSTS_FILE = Path(__file__).resolve().parents[1] / "config" / "eminwon_hosts.json"
HOST_RE = re.compile(r"^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$")
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
    tls_verify: bool = True        # 끄는 것은 호스트 단위 명시 설정으로만
    schemes: tuple[str, ...] = ("https", "http")


@dataclass(frozen=True)
class EminwonConfig:
    hosts_file: Path = DEFAULT_HOSTS_FILE
    keyword: str = "금고"
    page_size: int = 50
    max_pages: int = 3
    max_attachments: int = 5
    delay_sec: float = 1.0
    timeout: float = 20.0


def load_hosts(path: Path) -> tuple[HostEntry, ...]:
    try:
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        items = raw["hosts"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise SourceError(f"호스트 설정을 읽을 수 없습니다: {Path(path).name}") from exc
    out: dict[str, HostEntry] = {}
    for item in items:
        host = str(item.get("host", "")).strip().lower()
        schemes = tuple(item.get("schemes") or ("https", "http"))
        if not HOST_RE.match(host) or not set(schemes) <= {"https", "http"}:
            raise SourceError(f"호스트 설정이 올바르지 않습니다: {host!r}")
        out[host] = HostEntry(host, item.get("key") or host, item.get("name_ko") or host,
                              item.get("region_code"), item.get("type"),
                              bool(item.get("tls_verify", True)), schemes)
    return tuple(out.values())


def _query(params) -> str:
    return "&".join(f"{k}={quote(v, safe=',')}" for k, v in params)


class EminwonSource:
    slug = "eminwon"
    name_ko = "eminwon 고시공고(금고)"
    base_url = "urn:eminwon:multi-host"

    def __init__(self, config: EminwonConfig | None = None, http=None,
                 hosts: tuple[HostEntry, ...] | None = None) -> None:
        self.config = config or EminwonConfig()
        self.http = http or HttpClient(timeout=self.config.timeout, delay=self.config.delay_sec)
        self._hosts = hosts
        self._scheme: dict[str, str] = {}

    def with_config(self, hosts_file=None, http=None, hosts=None, **config) -> "EminwonSource":
        cfg = replace(self.config, **config)
        if hosts_file:
            cfg = replace(cfg, hosts_file=Path(hosts_file))
        return EminwonSource(cfg, http, hosts)

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

    def _get(self, entry: HostEntry, path_query: str):
        order = list(entry.schemes)
        pref = self._scheme.get(entry.host)
        if pref in order:
            order.remove(pref)
            order.insert(0, pref)
        last: FetchError | None = None
        for scheme in order:
            url = f"{scheme}://{entry.host}{path_query}"
            try:
                data, charset = self.http.get(url, verify=entry.tls_verify)
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

    def _list_host(self, entry: HostEntry):
        rows, seen_ids = [], set()
        for page in range(1, self.config.max_pages + 1):
            _, data, charset = self._get(entry, f"{LIST_PATH}?{self._list_query(page)}")
            page_rows = [r for r in parse_list(decode_body(data, charset)[0]) if r.mgt_no not in seen_ids]
            seen_ids.update(r.mgt_no for r in page_rows)
            rows.extend(page_rows)
            if len(page_rows) < self.config.page_size:
                break
        kw = self.config.keyword
        return [r for r in rows if kw in r.title.replace(" ", "")]

    def list_new(self, seen, since=None, report=None, hosts=None) -> Iterator[NoticeRef]:
        report = report if report is not None else RunReport()
        for entry in self._select(hosts):
            try:
                rows = self._list_host(entry)
            except FetchError as exc:
                report.hosts_failed[entry.host] = str(exc)[:200]
                continue
            report.hosts_ok.append(entry.host)
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
            "vaccine": vaccine_policy(entry.host, scheme),
            "institution": {"key": entry.key, "name_ko": entry.name_ko,
                            "region_code": entry.region_code, "type": entry.type},
            "fetched_at": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
            "attachment_errors": errors,
        }
        raw_dir = store.write(self.slug, ref.host, ref.number, detail_bytes, files, meta)
        return RawNotice(ref=ref, raw_dir=raw_dir, rel=store.rel(raw_dir))


register(EminwonSource())
