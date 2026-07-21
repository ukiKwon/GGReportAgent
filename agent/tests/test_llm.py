import os

from agent.llm import get_llm


def test_get_llm_uses_env_var_without_prompting(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    llm = get_llm()
    assert llm.model_name == "gpt-4o-mini"
    assert os.environ["OPENAI_API_KEY"] == "test-key-not-real"


def test_get_llm_respects_temperature(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-not-real")
    llm = get_llm(temperature=0.7)
    assert llm.temperature == 0.7
