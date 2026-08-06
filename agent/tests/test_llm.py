"""LLM 백엔드 어댑터 — 폐쇄망 배포에 사업자를 박아두지 않는다는 계약."""

from pydantic import BaseModel

import agent.llm as llm_mod
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


def _clear_auto(monkeypatch):
    llm_mod.reset_model_cache()
    for k in ("LLM_MODEL", "LLM_FALLBACK_MODEL", "LLM_BASE_URL"):
        monkeypatch.delenv(k, raising=False)


def test_explicit_model_is_untouched(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    assert llm_mod.current_model() == "gpt-oss-120b"


def test_unset_model_keeps_default(monkeypatch):
    _clear_auto(monkeypatch)
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL


def test_auto_resolves_from_hardware_and_installed(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (7.6, 2))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b", "llama3.2:3b"])
    assert llm_mod.current_model() == "llama3.2:3b"      # 2 vCPU → 3b


def test_auto_is_case_and_space_insensitive(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", " AUTO ")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b"])
    assert llm_mod.current_model() == "llama3.1:8b"


def test_auto_falls_back_to_default_when_nothing_installed(monkeypatch, capsys):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert "auto" in capsys.readouterr().err        # 조용히 넘어가지 않는다


def test_auto_result_is_cached(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    calls = []
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))

    def spy(url):
        calls.append(url)
        return ["llama3.1:8b"]

    monkeypatch.setattr(llm_mod, "installed_models", spy)
    llm_mod.current_model()
    llm_mod.current_model()
    llm_mod.current_model()
    assert len(calls) == 1          # 매 호출마다 Ollama를 찌르면 안 된다


def test_model_info_shape(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (7.6, 2))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.2:3b"])
    info = llm_mod.model_info()
    assert info["auto"] is True and info["requested"] == "auto"
    assert info["model"] == "llama3.2:3b" and info["cpu_count"] == 2
    assert info["resolved"] is True   # 실제로 골랐다


# ── F2: auto 판정 실패의 짧은 TTL 캐시 ──────────────────────────────────

def test_auto_failure_is_cached_within_ttl(monkeypatch):
    """판정 실패 직후 연속 호출이면 TTL 안에서는 installed_models를 다시 부르지 않는다."""
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    calls = []

    def spy(url):
        calls.append(url)
        return []   # 설치된 모델 없음 → 판정 실패

    monkeypatch.setattr(llm_mod, "installed_models", spy)
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert len(calls) == 1


def test_auto_failure_cache_expires_after_ttl(monkeypatch):
    """TTL이 지나면 다시 조회한다 — 무기한 캐시가 아니어야 기동 순서 문제가 자가복구된다."""
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    calls = []

    def spy(url):
        calls.append(url)
        return []

    monkeypatch.setattr(llm_mod, "installed_models", spy)
    fake_now = [1000.0]
    monkeypatch.setattr(llm_mod, "_now", lambda: fake_now[0])

    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert len(calls) == 1

    fake_now[0] += llm_mod.AUTO_FAIL_TTL + 1   # TTL 경과를 흉내낸다
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert len(calls) == 2


def test_auto_recovers_once_a_model_is_installed_after_a_failure(monkeypatch):
    """TTL이 지난 뒤 설치 목록이 채워지면 다음 호출에서 곧바로 그 모델을 고른다(자가복구)."""
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    fake_now = [1000.0]
    monkeypatch.setattr(llm_mod, "_now", lambda: fake_now[0])
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])

    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL

    fake_now[0] += llm_mod.AUTO_FAIL_TTL + 1
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b"])
    assert llm_mod.current_model() == "llama3.1:8b"


# ── F3: resolved — 실제로 고른 적 없는 모델에 근거를 붙이지 않는다 ──────

def test_model_info_resolved_false_when_auto_fails(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])
    info = llm_mod.model_info()
    assert info["auto"] is True
    assert info["model"] == llm_mod.DEFAULT_MODEL
    assert info["resolved"] is False


def test_model_info_resolved_true_when_not_auto(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    info = llm_mod.model_info()
    assert info["auto"] is False
    assert info["resolved"] is True


# ── model_info가 설치 목록을 다시 묻지 않는다 (후속 정리) ───────────────
# auto 판정 1회에 Ollama 왕복이 2회 붙던 것을 없앤다 — current_model()이 본 목록을
# 그대로 재사용한다. 왕복 자체도 비용이지만, 두 번 물으면 "판정 근거"와 "화면에
# 보여주는 목록"이 서로 다른 시점의 값이 될 수 있다는 쪽이 더 큰 문제다.

def test_model_info는_설치_목록을_한_번만_조회한다(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    calls = []

    def spy(url):
        calls.append(url)
        return ["llama3.1:8b"]

    monkeypatch.setattr(llm_mod, "installed_models", spy)
    info = llm_mod.model_info()
    assert info["installed"] == ["llama3.1:8b"]
    assert len(calls) == 1


def test_캐시된_뒤에는_아예_조회하지_않는다(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    calls = []

    def spy(url):
        calls.append(url)
        return ["llama3.1:8b"]

    monkeypatch.setattr(llm_mod, "installed_models", spy)
    llm_mod.model_info()
    llm_mod.model_info()
    llm_mod.model_info()
    assert len(calls) == 1          # 판정 때 한 번뿐


def test_non_auto는_설치_목록을_조회하지_않는다(monkeypatch):
    """명시 모델 지정이면 목록을 볼 이유가 없다 — 폐쇄망에서 불필요한 왕복이다."""
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    calls = []
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: calls.append(url) or [])
    info = llm_mod.model_info()
    assert info["installed"] == [] and calls == []


def test_판정_실패면_installed도_비어_있다(monkeypatch):
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])
    assert llm_mod.model_info()["installed"] == []


def test_reset_model_cache가_설치_목록도_비운다(monkeypatch):
    """캐시만 비우고 목록이 남으면, 다음 판정 전에 model_info가 옛 목록을 보여준다."""
    _clear_auto(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b"])
    llm_mod.model_info()

    llm_mod.reset_model_cache()
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])
    assert llm_mod.model_info()["installed"] == []


# ── 실제로 답을 만든 모델 추적 (NEXT.md 항목 8) ─────────────────────────
# `structured_llm`은 1순위가 실패하면 **조용히** 2순위로 넘어간다(의도된 설계).
# 그런데 기록에는 `current_model()`(= 쓰기로 한 1순위)이 남아, 폴백이 도는 순간
# 화면의 🧠 표시와 실제로 답을 만든 모델이 어긋났다.

def _fire_end(model_name):
    """그 모델의 콜백이 성공으로 끝난 상황을 흉내 낸다."""
    llm_mod._ModelTracker(model_name).on_llm_end()


def test_아무것도_안_돌면_None이다(monkeypatch):
    """LLM을 안 쓴 기록에 모델명이 붙지 않게 하는 근거다."""
    llm_mod.reset_last_model()
    assert llm_mod.last_used_model() is None


def test_성공한_모델이_기록된다():
    llm_mod.reset_last_model()
    _fire_end("gpt-oss-120b")
    assert llm_mod.last_used_model() == "gpt-oss-120b"


def test_폴백이_돌면_폴백_모델이_남는다():
    """1순위도 on_llm_start는 찍고 실패한다 — **끝난 것**만 적어야 답을 만든 모델이 된다."""
    llm_mod.reset_last_model()
    _fire_end(DEFAULT_FALLBACK_MODEL)          # 1순위는 실패해 end가 안 온다
    assert llm_mod.last_used_model() == DEFAULT_FALLBACK_MODEL
    assert llm_mod.last_used_model() != DEFAULT_MODEL


def test_reset이_앞_작업의_값을_지운다():
    """안 지우면 앞 노드가 남긴 값이 다음 노드 기록에 붙는다."""
    _fire_end("gpt-oss-120b")
    llm_mod.reset_last_model()
    assert llm_mod.last_used_model() is None


def test_get_llm이_자기_모델을_묶은_추적기를_단다(monkeypatch):
    """langchain이 주는 serialized/invocation_params는 래핑을 거치며 모양이 달라진다 —
    이 인스턴스가 어느 모델인지는 생성 시점에 이미 확실하므로 그것을 묶는다."""
    _clear(monkeypatch)
    trackers = [c for c in (get_llm(model="어떤모델").callbacks or [])
                if isinstance(c, llm_mod._ModelTracker)]
    assert [t.model for t in trackers] == ["어떤모델"]


def test_다른_스레드의_기록은_섞이지_않는다():
    """그래프는 기관당 스레드 하나로 돈다 — 동시에 두 기관이 돌아도 서로의 모델명을
    집어오면 안 된다."""
    import threading

    llm_mod.reset_last_model()
    _fire_end("이쪽모델")
    seen = {}

    def other():
        llm_mod.reset_last_model()
        _fire_end("저쪽모델")
        seen["value"] = llm_mod.last_used_model()

    t = threading.Thread(target=other)
    t.start(); t.join()

    assert seen["value"] == "저쪽모델"
    assert llm_mod.last_used_model() == "이쪽모델"
