"""표준 라이브러리 HTTP 클라이언트. TLS 검증은 기본 ON — 끄는 것은 호스트별 설정으로만."""

from __future__ import annotations

import http.client
import socket
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")


class FetchError(Exception):
    pass


class FetchHttpError(FetchError):
    """서버가 응답한 오류(4xx/5xx) — 스킴을 바꿔 재시도해도 소용없다."""


class FetchTlsError(FetchError):
    """인증서·TLS 오류 — http로 내려가 재시도하면 안 된다(중간자 강등 방지, security 7d2ac90 지적)."""


def _origin(url: str):
    p = urllib.parse.urlsplit(url)
    return (p.scheme, p.hostname, p.port or (443 if p.scheme == "https" else 80))


class _SameHostRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        newurl = urllib.parse.urljoin(req.full_url, newurl)
        if _origin(newurl) != _origin(req.full_url):
            raise urllib.error.HTTPError(req.full_url, code, "다른 출처(스킴·호스트·포트)로의 리다이렉트 차단", headers, fp)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class HttpClient:
    def __init__(self, timeout: float = 20.0, max_bytes: int = 20 * 1024 * 1024,
                 delay: float = 1.0, sleep=time.sleep) -> None:
        self.timeout, self.max_bytes, self.delay, self._sleep = timeout, max_bytes, delay, sleep
        self._first = True

    def get(self, url: str, verify: bool = True) -> tuple[bytes, str | None]:
        if urllib.parse.urlsplit(url).scheme not in ("http", "https"):
            raise FetchError("http/https만 허용합니다")
        if not self._first:
            self._sleep(self.delay)        # 기관 서버에 부담을 주지 않는 간격
        self._first = False
        ctx = ssl.create_default_context() if verify else ssl._create_unverified_context()
        opener = urllib.request.build_opener(_SameHostRedirect, urllib.request.HTTPSHandler(context=ctx))
        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "*/*", "Accept-Language": "ko-KR,ko;q=0.9"})
        try:
            with opener.open(req, timeout=self.timeout) as resp:   # http.client = HTTP/1.1
                data = resp.read(self.max_bytes + 1)
                charset = resp.headers.get_content_charset()
        except urllib.error.HTTPError as exc:          # URLError보다 먼저
            raise FetchHttpError(f"HTTP {exc.code}") from exc
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, (ssl.SSLError, ssl.CertificateError)):
                raise FetchTlsError(f"TLS 오류: {str(exc.reason)[:80]}") from exc
            raise FetchError(f"연결 실패: {type(exc).__name__} {str(exc.reason)[:80]}") from exc
        except (ssl.SSLError, ssl.CertificateError) as exc:
            raise FetchTlsError(f"TLS 오류: {str(exc)[:80]}") from exc
        except http.client.HTTPException as exc:       # 응답이 중간에 끊김 등
            raise FetchError(f"응답 오류: {type(exc).__name__}") from exc
        except (socket.timeout, OSError) as exc:
            raise FetchError(f"연결 실패: {type(exc).__name__} {str(getattr(exc, 'reason', exc))[:80]}") from exc
        if len(data) > self.max_bytes:
            raise FetchError("응답이 너무 큽니다")
        return data, charset
