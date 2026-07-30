"""테스트 전용 보정.

httpx/httpx2(Starlette TestClient가 쓰는 클라이언트)는 헤더 "값"을 기본 ascii로만
인코딩한다 — X-User-Id에 한글("영업팀" 등)을 실으면 클라이언트 쪽(요청 조립 단계,
서버 코드 도달 전)에서 UnicodeEncodeError로 죽는다. 실제 서비스 코드의 버그가
아니라 TestClient가 붙잡고 있는 라이브러리의 기본 인코딩 문제이므로, 여기서만
전역 기본값을 utf-8로 넉넉하게 바꿔 우회한다(운영 경로에는 영향 없음 — 이 conftest는
테스트 세션에서만 임포트된다).
"""

try:
    import httpx2._models as _header_models
except ImportError:  # pragma: no cover - httpx2 미설치 환경 대비
    import httpx._models as _header_models

_orig_normalize_header_value = _header_models._normalize_header_value


def _utf8_fallback_normalize_header_value(value, encoding=None):
    return _orig_normalize_header_value(value, encoding or "utf-8")


_header_models._normalize_header_value = _utf8_fallback_normalize_header_value
