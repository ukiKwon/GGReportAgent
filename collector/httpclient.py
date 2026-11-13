"""표준 라이브러리 HTTP 클라이언트. TLS 검증은 항상 ON — 검증 끄기는 지원하지 않는다(security 11-12).

호스트별 TLS 예외는 TlsPolicy 하나로만: 중간 CA 추가(ca_file)·암호 묶음 허용 목록(ciphers)·공개키 지문 고정(pins).
재시도는 하지 않는다(소스가 FetchConnError·FetchTlsHandshakeError를 보고 결정).
"""

from __future__ import annotations

import functools
import http.client
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

from collector.tlscert import check_pinned

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TLS_MSG_LEN = 160          # 자체 서명 종류를 구분할 수 있게 80→160(security 11-12)
# 허용 목록은 실측한 서버 묶음만 좁게(security 11-12 — DEFAULT:@SECLEVEL=1은 너무 넓어 뺐다). SECLEVEL은 기본값(2) 유지.
CIPHERS_DHE_SHA = "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE-RSA-AES256-SHA:DHE-RSA-AES128-SHA"   # 청주·정읍·영동: DHE-RSA-AES256-SHA만
CIPHERS_RSA_GCM = "ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:AES256-GCM-SHA384:AES128-GCM-SHA256"   # 속초·의성: AES256-GCM-SHA384(RSA 키 교환)만
ALLOWED_CIPHERS = frozenset({CIPHERS_DHE_SHA, CIPHERS_RSA_GCM})   # SECLEVEL=0·min_tls(TLS1.0/1.1)는 미지원


class FetchError(Exception):
    pass


class FetchHttpError(FetchError):
    """서버가 응답한 오류(4xx/5xx) — 스킴을 바꿔 재시도해도 소용없다."""


class FetchTlsError(FetchError):
    """인증서·TLS 오류 — http로 내려가 재시도하면 안 된다(중간자 강등 방지, security 7d2ac90 지적)."""


class FetchTlsHandshakeError(FetchTlsError):
    """인증서 검증이 아닌 핸드셰이크 실패(SSLV3_ALERT_HANDSHAKE_FAILURE·EOF 등). 부하분산 뒤 일부 서버 설정 차이로
    간헐 발생(메인 실측 11-12) — 소스가 1회까지 재시도할 수 있다. http 강등은 여전히 금지."""


class FetchTlsConfigError(FetchTlsError):
    """우리 쪽 TLS 설정 오류(검증 끄기 요청·컨텍스트 생성 실패) — 서버 인증서 문제(tls_verify)와 구분(qa P3-B)."""


class FetchConnError(FetchError):
    """연결 실패(DNS·거부 등) — 재시도하지 않고 실행 끝 2nd pass에서 1회 더 본다."""


class FetchTimeoutError(FetchConnError):
    """시간 초과 — 소스가 백오프 후 재시도할 수 있다(security 11-12: 재시도는 시간 초과만)."""


def _conn_error(exc: BaseException, msg: str) -> FetchConnError:
    timed_out = isinstance(exc, TimeoutError) or "timed out" in str(exc).lower()
    return (FetchTimeoutError if timed_out else FetchConnError)(msg)


# 실패 종류(qa P3-B): 알려진 실패는 호스트+종류가 모두 맞을 때만. 하위 클래스를 먼저 본다.
FAIL_KINDS = ("tls_config", "tls_handshake", "tls_verify", "http", "timeout", "conn", "other")


def error_kind(exc: BaseException) -> str:
    for cls, kind in ((FetchTlsConfigError, "tls_config"), (FetchTlsHandshakeError, "tls_handshake"),
                      (FetchTlsError, "tls_verify"), (FetchHttpError, "http"),
                      (FetchTimeoutError, "timeout"), (FetchConnError, "conn")):
        if isinstance(exc, cls):
            return kind
    return "other"


@dataclass(frozen=True)
class TlsPolicy:
    ca_file: Path | None = None
    ciphers: str | None = None
    pins: tuple[str, ...] = ()

    @property
    def relaxed(self) -> bool:
        return bool(self.ca_file or self.ciphers or self.pins)


def build_context(tls: TlsPolicy | None = None) -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    if ctx.verify_flags & ssl.VERIFY_X509_PARTIAL_CHAIN:      # 3.13+ 기본값 — 추가 중간 CA가 신뢰 앵커가 되지 않게
        ctx.verify_flags ^= ssl.VERIFY_X509_PARTIAL_CHAIN
    if tls is None:
        return ctx
    if tls.ciphers is not None:
        if tls.ciphers not in ALLOWED_CIPHERS:
            raise ValueError("허용하지 않는 ciphers")
        ctx.set_ciphers(tls.ciphers)
    if tls.pins:
        if tls.ca_file is not None:
            raise ValueError("pins와 ca_file은 함께 쓸 수 없습니다")
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE        # 검증은 _PinnedHTTPSConnection이 지문·호스트명·유효기간으로 직접
    elif tls.ca_file is not None:
        ctx.load_verify_locations(cafile=str(tls.ca_file))   # 이 호스트 컨텍스트에만
    return ctx


def _tls_error(exc: Exception) -> FetchTlsError:
    msg = f"TLS 오류: {str(exc)[:TLS_MSG_LEN]}"
    if isinstance(exc, ssl.SSLCertVerificationError):      # = ssl.CertificateError
        return FetchTlsError(msg)
    return FetchTlsHandshakeError(msg)


SECRET_PARAMS = {"servicekey", "key", "apikey", "api_key", "token", "access_token"}


def redact_url(url: str) -> str:
    """기록용 URL — 키·토큰 같은 질의 값은 ***로(나라장터 serviceKey 등). 해석 못 하면 경로까지만."""
    try:
        p = urllib.parse.urlsplit(url)
        q = [(k, "***" if k.lower() in SECRET_PARAMS else v)
             for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=True)]
        return urllib.parse.urlunsplit((p.scheme, p.hostname or "", p.path, urllib.parse.urlencode(q, safe="*,%"), ""))
    except ValueError:
        return url.split("?", 1)[0]


def _origin(url: str):
    p = urllib.parse.urlsplit(url)
    return (p.scheme, p.hostname, p.port or (443 if p.scheme == "https" else 80))


class _SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urllib.parse.urljoin(req.full_url, newurl)
        if _origin(newurl) != _origin(req.full_url):
            raise urllib.error.HTTPError(req.full_url, code, "다른 출처(스킴·호스트·포트)로의 리다이렉트 차단", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class _PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, *args, pins: tuple[str, ...], **kwargs):
        super().__init__(*args, **kwargs)
        self._pins = pins

    def connect(self):
        super().connect()
        try:   # 요청을 보내기 전(=응답 본문을 읽기 전)에 지문·호스트명·유효기간 대조
            check_pinned(self.sock.getpeercert(binary_form=True), self._pins, self.host)
        except ssl.SSLCertVerificationError:
            self.close()
            raise


class _PinnedHTTPSHandler(urllib.request.HTTPSHandler):
    def __init__(self, context: ssl.SSLContext, pins: tuple[str, ...]):
        super().__init__(context=context)
        self._pins = pins

    def https_open(self, req):
        return self.do_open(functools.partial(_PinnedHTTPSConnection, pins=self._pins), req, context=self._context)


READ_CHUNK = 64 * 1024     # 본문을 나눠 읽으며 요청 전체 마감 시각을 확인(qa 11-12 P2-3)


class HttpClient:
    def __init__(self, timeout: float = 20.0, max_bytes: int = 20 * 1024 * 1024,
                 delay: float = 1.0, sleep=time.sleep, deadline: float | None = None,
                 clock=time.monotonic) -> None:
        self.timeout, self.max_bytes, self.delay, self._sleep = timeout, max_bytes, delay, sleep
        self.deadline = deadline if deadline is not None else timeout * 3   # 요청 시작~본문 끝 전체 상한(초)
        self._clock = clock
        self._first = True
        self._contexts: dict = {}

    def _context(self, tls: TlsPolicy | None) -> ssl.SSLContext:
        if tls not in self._contexts:
            self._contexts[tls] = build_context(tls)
        return self._contexts[tls]

    def get(self, url: str, verify: bool = True, tls: TlsPolicy | None = None) -> tuple[bytes, str | None]:
        return self._open(url, None, verify, tls)

    def post(self, url: str, body: bytes, verify: bool = True,
             tls: TlsPolicy | None = None) -> tuple[bytes, str | None]:
        """application/x-www-form-urlencoded POST. 본문은 호출자가 퍼센트 인코딩한 바이트(작은 크기만)."""
        if not isinstance(body, (bytes, bytearray)) or len(body) > 4096:
            raise FetchError("POST 본문은 4KB 이하 바이트여야 합니다")
        return self._open(url, bytes(body), verify, tls)

    def _open(self, url: str, body: bytes | None, verify: bool, tls: TlsPolicy | None) -> tuple[bytes, str | None]:
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            raise FetchError("http/https만 허용합니다")
        if not verify:
            raise FetchTlsConfigError("TLS 검증 끄기는 지원하지 않습니다(설정 오류)")
        try:
            ctx = self._context(tls)
        except (ValueError, ssl.SSLError, OSError) as exc:
            raise FetchTlsConfigError(f"TLS 설정 오류: {type(exc).__name__}") from exc
        if not self._first:
            self._sleep(self.delay)        # 기관 서버에 부담을 주지 않는 간격
        self._first = False
        https = (_PinnedHTTPSHandler(ctx, tls.pins) if tls is not None and tls.pins
                 else urllib.request.HTTPSHandler(context=ctx))
        opener = urllib.request.build_opener(_SameHostRedirect, https)
        headers = {"User-Agent": UA, "Accept": "*/*", "Accept-Language": "ko-KR,ko;q=0.9"}
        if body is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        req = urllib.request.Request(url, data=body, headers=headers)
        started = self._clock()
        try:
            with opener.open(req, timeout=self.timeout) as resp:   # http.client = HTTP/1.1
                charset = resp.headers.get_content_charset()
                chunks: list[bytes] = []
                total = 0
                # read1: 소켓을 한 번만 읽고 돌아온다 — read(n)은 n바이트를 채울 때까지 안에서 여러 번 기다려
                # 마감 검사를 건너뛴다(qa 11-12 P2-A). read1이 없는 응답 객체(시험 가짜)는 read로.
                read = getattr(resp, "read1", None) or resp.read
                while total <= self.max_bytes:
                    if self._clock() - started > self.deadline:
                        raise FetchTimeoutError("요청 전체 마감 시간 초과")
                    chunk = read(min(READ_CHUNK, self.max_bytes + 1 - total))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    total += len(chunk)
                data = b"".join(chunks)
        except urllib.error.HTTPError as exc:          # URLError보다 먼저
            raise FetchHttpError(f"HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, ssl.SSLError):
                raise _tls_error(exc.reason) from exc
            raise _conn_error(exc.reason, f"연결 실패: {type(exc).__name__} {str(exc.reason)[:80]}") from exc
        except ssl.SSLError as exc:
            raise _tls_error(exc) from exc
        except http.client.HTTPException as exc:       # 응답이 중간에 끊김 등
            raise FetchError(f"응답 오류: {type(exc).__name__}") from exc
        except OSError as exc:                         # socket.timeout = TimeoutError ⊂ OSError
            raise _conn_error(exc, f"연결 실패: {type(exc).__name__} {str(getattr(exc, 'reason', exc))[:80]}") from exc
        if len(data) > self.max_bytes:
            raise FetchError("응답이 너무 큽니다")
        return data, charset
