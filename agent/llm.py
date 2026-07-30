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

from langchain_openai import ChatOpenAI

DEFAULT_MODEL = "gpt-oss-120b"
DEFAULT_FALLBACK_MODEL = "llama-4-scout-17b-16e-instruct"
# 로컬 Ollama의 OpenAI-호환 경로. 폐쇄망 LAN 엔드포인트로 바꾸면 그대로 붙는다.
DEFAULT_BASE_URL = "http://localhost:11434/v1"


def _env(name: str, default: str) -> str:
    """빈 문자열도 미설정으로 본다 — `LLM_BASE_URL=`만 남은 .env가 흔하다."""
    return os.environ.get(name) or default


def get_llm(temperature: float = 0.0, model: str | None = None) -> ChatOpenAI:
    return ChatOpenAI(
        model=model or _env("LLM_MODEL", DEFAULT_MODEL),
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
    if not fallback_model or fallback_model == _env("LLM_MODEL", DEFAULT_MODEL):
        return primary

    fallback = get_llm(temperature, model=fallback_model).with_structured_output(schema)
    return primary.with_fallbacks([fallback])
