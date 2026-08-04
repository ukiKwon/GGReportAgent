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

from langchain_openai import ChatOpenAI

from agent.model_select import detect_resources, installed_models, pick_model

DEFAULT_MODEL = "gpt-oss-120b"
DEFAULT_FALLBACK_MODEL = "llama-4-scout-17b-16e-instruct"
# 로컬 Ollama의 OpenAI-호환 경로. 폐쇄망 LAN 엔드포인트로 바꾸면 그대로 붙는다.
DEFAULT_BASE_URL = "http://localhost:11434/v1"

AUTO = "auto"
# LLM_MODEL=auto 판정 결과의 프로세스 1회 캐시 — 매 호출마다 Ollama를 찌르면
# 추론 왕복마다 지연이 붙는다.
_auto_cache: str | None = None
_auto_warned = False


def _env(name: str, default: str) -> str:
    """빈 문자열도 미설정으로 본다 — `LLM_BASE_URL=`만 남은 .env가 흔하다."""
    return os.environ.get(name) or default


def _is_auto(value: str) -> bool:
    return value.strip().lower() == AUTO


def reset_model_cache() -> None:
    """테스트 격리용 — 프로세스 캐시를 비운다."""
    global _auto_cache, _auto_warned
    _auto_cache = None
    _auto_warned = False


def resolve_auto_model() -> str | None:
    """지금 하드웨어·설치목록으로 다시 판정한다(캐시 무시). 테스트·`GET /llm/status`용."""
    ram_gb, cpu_count = detect_resources()
    return pick_model(installed_models(current_base_url()), ram_gb, cpu_count)


def current_model() -> str:
    """지금 쓰기로 돼 있는 1순위 모델. 실패를 사람에게 설명할 때도 쓴다.

    `LLM_MODEL=auto`면 하드웨어와 설치 목록을 보고 고른다(프로세스 1회 캐시 —
    매 호출마다 Ollama를 찌르면 추론마다 왕복이 붙는다). `LLM_MODEL`이 없거나
    구체 모델명이면 지금까지와 동일하게 그 값을 그대로 돌려준다(옵트인 불변식).
    """
    global _auto_cache, _auto_warned
    requested = _env("LLM_MODEL", DEFAULT_MODEL)
    if not _is_auto(requested):
        return requested
    if _auto_cache:
        return _auto_cache
    picked = resolve_auto_model()
    if picked:
        _auto_cache = picked
        print(f"[llm] auto 선택: {picked}", file=sys.stderr)
        return picked
    if not _auto_warned:
        _auto_warned = True
        print(
            "[llm] LLM_MODEL=auto인데 쓸 모델을 못 찾았습니다 — Ollama가 떠 있는지,"
            " 후보(llama3.1:8b / llama3.2:3b / llama3.2:1b) 중 하나를 pull 했는지"
            f" 확인하세요. 우선 기본값 {DEFAULT_MODEL}로 진행합니다.",
            file=sys.stderr,
        )
    return DEFAULT_MODEL


def model_info() -> dict:
    """화면에 '지금 무슨 모델을 쓰는지' 보여주기 위한 요약. `GET /llm/status`가 그대로 내보낸다."""
    requested = _env("LLM_MODEL", DEFAULT_MODEL)
    ram_gb, cpu_count = detect_resources()
    auto = _is_auto(requested)
    return {
        "model": current_model(),
        "requested": requested,
        "auto": auto,
        "base_url": current_base_url(),
        "ram_gb": ram_gb,
        "cpu_count": cpu_count,
        "installed": installed_models(current_base_url()) if auto else [],
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
