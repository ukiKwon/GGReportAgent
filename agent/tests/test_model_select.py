from unittest.mock import patch

from agent.model_select import MODEL_TIERS, detect_resources, installed_models, pick_model


def test_picks_largest_model_the_hardware_can_run():
    installed = ["llama3.2:1b", "llama3.2:3b", "llama3.1:8b"]
    assert pick_model(installed, ram_gb=16.0, cpu_count=8) == "llama3.1:8b"


def test_vcpu_shortage_downgrades_even_with_enough_ram():
    """m7i-flex.large(2 vCPU/8GB) — RAM은 8b를 담지만 2코어라 3b가 맞다."""
    installed = ["llama3.2:3b", "llama3.1:8b"]
    assert pick_model(installed, ram_gb=7.6, cpu_count=2) == "llama3.2:3b"


def test_only_installed_models_are_considered():
    """하드웨어가 8b를 감당해도 안 받아놨으면 못 쓴다 — 설치 목록이 상한이다."""
    assert pick_model(["llama3.2:1b"], ram_gb=16.0, cpu_count=8) == "llama3.2:1b"


def test_returns_none_when_nothing_fits():
    assert pick_model([], ram_gb=16.0, cpu_count=8) is None
    assert pick_model(["llama3.2:1b"], ram_gb=0.5, cpu_count=1) is None


def test_prefix_match_returns_the_installed_name_not_the_tier_name():
    """접두사 일치는 실제 설치돼 있는 이름을 돌려줘야 한다 — 티어명은 정의상 미설치다.
    (회귀: `return model`이었을 때 `llama3.2:3b-instruct-q4`만 있는 서버에서
    `llama3.2:3b`를 골라 로그까지 찍고 추론에서 404가 났다.)
    """
    assert pick_model(["llama3.2:3b-instruct-q4"], ram_gb=16.0, cpu_count=8) == "llama3.2:3b-instruct-q4"


def test_unknown_models_are_ignored():
    """후보 3종 밖의 모델은 등급을 모르므로 고르지 않는다(사용자 확정 범위)."""
    assert pick_model(["qwen2.5:7b", "mistral:latest"], ram_gb=16.0, cpu_count=8) is None


def test_tiers_are_ordered_largest_first():
    rams = [t[1] for t in MODEL_TIERS]
    assert rams == sorted(rams, reverse=True)


def test_detect_resources_returns_sane_values():
    ram, cpu = detect_resources()
    assert ram >= 0.0 and cpu >= 1


@patch("agent.model_select.urllib.request.urlopen")
def test_installed_models_parses_tags(mock_open):
    class R:
        def read(self): return b'{"models":[{"name":"llama3.2:3b"},{"name":"bge-m3:latest"}]}'
        def __enter__(self): return self
        def __exit__(self, *a): return False
    mock_open.return_value = R()
    assert installed_models("http://localhost:11434/v1") == ["llama3.2:3b", "bge-m3:latest"]


@patch("agent.model_select.urllib.request.urlopen", side_effect=OSError("refused"))
def test_installed_models_returns_empty_when_unreachable(mock_open):
    assert installed_models("http://localhost:11434/v1") == []
