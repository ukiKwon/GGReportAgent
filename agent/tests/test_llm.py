"""LLM 백엔드 어댑터 — 폐쇄망 배포에 사업자를 박아두지 않는다는 계약."""

from pydantic import BaseModel

from agent.llm import DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, get_llm, structured_llm


class _Schema(BaseModel):
    value: str


def _clear(monkeypatch):
    for name in ("LLM_MODEL", "LLM_FALLBACK_MODEL", "LLM_BASE_URL", "LLM_API_KEY"):
        monkeypatch.delenv(name, raising=False)


def test_defaults_to_operational_model_and_local_endpoint(monkeypatch):
    _clear(monkeypatch)
    llm = get_llm()
    assert llm.model_name == DEFAULT_MODEL == "gpt-oss-120b"
    assert "11434" in str(llm.openai_api_base)


def test_env_overrides_model_and_endpoint(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "gemma-3-27b-it")
    monkeypatch.setenv("LLM_BASE_URL", "http://lan-gpu:8000/v1")
    llm = get_llm()
    assert llm.model_name == "gemma-3-27b-it"
    assert "lan-gpu" in str(llm.openai_api_base)


def test_no_api_key_needed(monkeypatch):
    """자체호스팅 엔드포인트는 키를 안 본다. 예전 getpass 프롬프트가 없어야 한다."""
    _clear(monkeypatch)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert get_llm() is not None  # 프롬프트 없이 그냥 만들어져야 한다


def test_blank_env_falls_back_to_default(monkeypatch):
    """`LLM_BASE_URL=`만 남은 .env가 흔하다 — 빈 문자열은 미설정으로 본다."""
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_BASE_URL", "")
    assert "11434" in str(get_llm().openai_api_base)


def test_temperature_is_passed_through(monkeypatch):
    _clear(monkeypatch)
    assert get_llm(temperature=0.7).temperature == 0.7


def test_structured_llm_has_a_fallback(monkeypatch):
    """1순위가 죽어도 파이프라인 전체가 멈추지 않아야 한다."""
    _clear(monkeypatch)
    runnable = structured_llm(_Schema)
    assert hasattr(runnable, "fallbacks"), "폴백이 걸려 있지 않다"
    assert len(runnable.fallbacks) == 1


def test_fallback_model_defaults_to_llama4(monkeypatch):
    _clear(monkeypatch)
    assert DEFAULT_FALLBACK_MODEL == "llama-4-scout-17b-16e-instruct"


def test_no_fallback_when_it_would_be_the_same_model(monkeypatch):
    """같은 모델로 두 번 부르는 것은 폴백이 아니라 낭비다."""
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "solar-pro")
    monkeypatch.setenv("LLM_FALLBACK_MODEL", "solar-pro")
    assert not hasattr(structured_llm(_Schema), "fallbacks")
