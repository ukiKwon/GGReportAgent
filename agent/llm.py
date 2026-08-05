"""LLM 백엔드 어댑터 — 상위 E2E 스펙 §⑥.

이 시스템은 **폐쇄망**에서 돈다. 운영에서 OpenAI로 나갈 수 없으므로 모델·엔드포인트·
키를 전부 환경변수로 받고, 코드에는 어느 특정 사업자도 박아두지 않는다. OpenAI-호환
엔드포인트(vLLM·Ollama·TGI 등)면 `LLM_BASE_URL` 교체만으로 붙는다.

폴백: 1순위 모델이 실패하면 2순위로 한 번 더 시도한다. 자체호스팅 엔드포인트는
모델이 안 올라와 있거나 컨텍스트가 넘쳐 죽는 일이 흔한데, 그때 파이프라인 전체가
멈추는 것보다 작은 모델로라도 끝내고 사람이 검수하는 편이 낫다.
"""

from __future__ import annotations

import os
import sys
import time

from langchain_openai import ChatOpenAI

from agent.model_select import detect_resources, installed_models, pick_model

DEFAULT_MODEL = "gpt-oss-120b"
DEFAULT_FALLBACK_MODEL = "llama-4-scout-17b-16e-instruct"
# 로컬 Ollama의 OpenAI-호환 경로. 폐쇄망 LAN 엔드포인트로 바꾸면 그대로 붙는다.
DEFAULT_BASE_URL = "http://localhost:11434/v1"

AUTO = "auto"
# 판정 실패(Ollama 무응답 등)를 재시도하기까지의 유예 시간(초). 짧은 TTL인 이유:
# 무기한으로 캐시하면 systemd에서 이 앱이 Ollama보다 먼저 뜨는(기동 순서) 경우
# 지금은 다음 요청 때 자연히 재시도해 자가복구되는데, 그 경로가 막힌다. 60초면
# 매 추론 호출마다 왕복하는 지연은 없애면서도 기동 순서 문제는 곧 스스로 낫는다.
AUTO_FAIL_TTL = 60.0

# LLM_MODEL=auto 판정 결과의 프로세스 캐시 — 매 호출마다 Ollama를 찌르면
# 추론 왕복마다 지연이 붙는다. 성공은 무기한, 실패는 위 TTL만큼만 캐시한다.
_auto_cache: str | None = None
_auto_warned = False
_auto_fail_at: float | None = None
# 그 판정 때 실제로 본 설치 목록. `model_info()`가 재사용한다 — 예전엔 여기서
# `installed_models()`를 한 번 더 불러 auto 판정 1회에 Ollama 왕복이 2회 붙었다.
# 캐시와 항상 함께 채워지고 함께 비워지므로 "그 결정의 근거"로서 일관된다.
_auto_installed: list[str] = []


def _now() -> float:
    """단조 시계 — 테스트에서 monkeypatch로 시간 경과를 흉내낼 수 있게 함수로 뺀다."""
    return time.monotonic()


def _env(name: str, default: str) -> str:
    """빈 문자열도 미설정으로 본다 — `LLM_BASE_URL=`만 남은 .env가 흔하다."""
    return os.environ.get(name) or default


def _is_auto(value: str) -> bool:
    return value.strip().lower() == AUTO


def reset_model_cache() -> None:
    """테스트 격리용 — 프로세스 캐시를 비운다."""
    global _auto_cache, _auto_warned, _auto_fail_at, _auto_installed
    _auto_cache = None
    _auto_warned = False
    _auto_fail_at = None
    _auto_installed = []


def resolve_auto_model() -> str | None:
    """지금 하드웨어·설치목록으로 다시 판정한다(캐시 무시). 테스트·`GET /llm/status`용.

    본 설치 목록을 `_auto_installed`에 남긴다 — 같은 판정을 설명하려고 목록을 한 번
    더 조회하는 왕복을 없애기 위해서다.
    """
    global _auto_installed
    ram_gb, cpu_count = detect_resources()
    _auto_installed = installed_models(current_base_url())
    return pick_model(_auto_installed, ram_gb, cpu_count)


def current_model() -> str:
    """지금 쓰기로 돼 있는 1순위 모델. 실패를 사람에게 설명할 때도 쓴다.

    `LLM_MODEL=auto`면 하드웨어와 설치 목록을 보고 고른다. 성공하면 프로세스
    캐시에 무기한 보관한다(매 호출마다 Ollama를 찌르면 추론마다 왕복이 붙는다).
    실패하면 `AUTO_FAIL_TTL`초만 짧게 캐시한다 — 무기한이면 기동 순서 문제의
    자가복구 경로가 막히므로(모듈 상단 주석 참고), TTL이 지나면 다시 시도한다.
    `LLM_MODEL`이 없거나 구체 모델명이면 지금까지와 동일하게 그 값을 그대로
    돌려준다(옵트인 불변식).
    """
    global _auto_cache, _auto_warned, _auto_fail_at
    requested = _env("LLM_MODEL", DEFAULT_MODEL)
    if not _is_auto(requested):
        return requested
    if _auto_cache:
        return _auto_cache
    if _auto_fail_at is not None and _now() - _auto_fail_at < AUTO_FAIL_TTL:
        return DEFAULT_MODEL   # TTL 안 — 재조회하지 않고 조용히 기본값을 쓴다
    picked = resolve_auto_model()
    if picked:
        _auto_cache = picked
        _auto_fail_at = None
        print(f"[llm] auto 선택: {picked}", file=sys.stderr)
        return picked
    _auto_fail_at = _now()
    if not _auto_warned:
        _auto_warned = True
        print(
            "[llm] LLM_MODEL=auto인데 쓸 모델을 못 찾았습니다 — Ollama가 떠 있는지,"
            " 후보(llama3.1:8b / llama3.2:3b / llama3.2:1b) 중 하나를 pull 했는지"
            f" 확인하세요. 우선 기본값 {DEFAULT_MODEL}로 진행합니다"
            f"({AUTO_FAIL_TTL:.0f}초 뒤 재시도).",
            file=sys.stderr,
        )
    return DEFAULT_MODEL


def model_info() -> dict:
    """화면에 '지금 무슨 모델을 쓰는지' 보여주기 위한 요약. `GET /llm/status`가 그대로 내보낸다.

    `resolved`: auto가 실제로 하드웨어·설치목록으로 모델을 골랐으면 True, 판정이
    실패해 DEFAULT_MODEL로 폴백했으면 False. non-auto(명시 지정)는 언제나 True —
    화면이 "자동 선택"이라는 근거(RAM/vCPU)를 실제로 고른 적 없는 모델에 잘못
    붙이지 않도록 이 값으로 구분한다.

    `installed`는 **판정 때 본 목록을 재사용**한다(`_auto_installed`). 여기서 다시
    조회하면 auto 판정 한 번에 Ollama 왕복이 2회 붙고, 그 값이 판정 근거와 어긋날
    수도 있다. non-auto는 목록을 볼 이유가 없으므로 빈 목록 그대로다.
    """
    requested = _env("LLM_MODEL", DEFAULT_MODEL)
    ram_gb, cpu_count = detect_resources()
    auto = _is_auto(requested)
    model = current_model()          # auto면 이 호출이 _auto_installed를 채운다
    resolved = (not auto) or (_auto_cache == model)
    return {
        "model": model,
        "requested": requested,
        "auto": auto,
        "resolved": resolved,
        "base_url": current_base_url(),
        "ram_gb": ram_gb,
        "cpu_count": cpu_count,
        "installed": list(_auto_installed) if auto else [],
    }


def current_base_url() -> str:
    return _env("LLM_BASE_URL", DEFAULT_BASE_URL)


def get_llm(temperature: float = 0.0, model: str | None = None) -> ChatOpenAI:
    return ChatOpenAI(
        model=model or current_model(),
        base_url=_env("LLM_BASE_URL", DEFAULT_BASE_URL),
        # 자체호스팅 엔드포인트는 대개 키를 안 본다. langchain은 빈 값이면 예외를 내므로
        # 자리표시자를 넣는다.
        api_key=_env("LLM_API_KEY", "not-needed"),
        temperature=temperature,
    )


def structured_llm(schema, temperature: float = 0.0):
    """구조화 출력 러너블. 1순위가 실패하면 폴백 모델로 한 번 더 시도한다.

    폴백을 `with_structured_output` **뒤에** 거는 이유: 스키마 강제 방식이 모델마다
    달라서(툴콜/json_schema), 1순위가 구조화 단계에서 실패하는 경우까지 폴백이
    받아내야 하기 때문이다.
    """
    primary = get_llm(temperature).with_structured_output(schema)

    fallback_model = _env("LLM_FALLBACK_MODEL", DEFAULT_FALLBACK_MODEL)
    if not fallback_model or fallback_model == current_model():
        return primary

    fallback = get_llm(temperature, model=fallback_model).with_structured_output(schema)
    return primary.with_fallbacks([fallback])
