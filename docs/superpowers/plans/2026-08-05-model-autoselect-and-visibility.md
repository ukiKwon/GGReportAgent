# 모델 자동선택 + 사용 모델 가시화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ① `LLM_MODEL=auto`일 때 실제 하드웨어(RAM·vCPU)와 **Ollama에 설치된 목록**을 함께 보고 모델을 고른다. ② 대화 탭·지식 탭에 **지금 어떤 모델이 쓰이는지** 화면에 띄운다. ③ 워크플로 수행 이력에 subagent가 쓴 **모델 이름을 함께 기록·표시**한다.

**Architecture:** 자동선택은 **옵트인**(`LLM_MODEL=auto`)이라 미설정·명시 지정 시 동작이 지금과 100% 같다 — 폐쇄망 운영의 `gpt-oss-120b`가 조용히 뒤집히지 않는다. 하드웨어 감지는 표준 라이브러리만 쓴다(새 의존성 0). 모델명 가시화는 두 층으로: 화면 상단 배지는 `GET /llm/status`(신규)가 주고, 이력 기록은 `messages.model` 컬럼(기존 `MIGRATIONS` 관행)에 남긴다.

**Tech Stack:** Python 3.11+(표준 라이브러리 `ctypes`·`urllib`·`os`), FastAPI, vanilla JS(IIFE), pytest, node:test.

## Global Constraints

- **새 의존성 금지** — `requirements.txt` 무변경. RAM 감지는 리눅스 `/proc/meminfo`, 윈도우 `ctypes.GlobalMemoryStatusEx`, vCPU는 `os.cpu_count()`.
- **옵트인 원칙**: `LLM_MODEL`이 없거나 구체 모델명이면 **기존 동작 그대로**. 오직 정확히 `"auto"`(대소문자 무시·공백 제거)일 때만 자동선택.
- **후보는 3종 고정**(사용자 확정): `llama3.1:8b` / `llama3.2:3b` / `llama3.2:1b`. qwen 등 추가 금지.
- **네트워크 호출은 임포트 시점에 하지 않는다** — `agent/llm.py` import가 Ollama를 찌르면 테스트·폐쇄망 기동이 느려지고 깨진다. 지연 호출 + 프로세스 1회 캐시.
- agent 층은 backend를 import하지 않는다. LLM 접근은 `agent/llm.py` 경유만.
- 출력은 `logic.esc` 이스케이프, fetch는 `r.ok` 검사 + `.catch`(계획 B 최종리뷰에서 확립).
- `dashboard/js/render.js`·지도 무수정. 주석·커밋 한국어(끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`), UTF-8, `py -3` 런처, TDD.
- 전체 `py -3 -m pytest -q` 기준선 **526 passed** 유지 + 신규, `node --test dashboard/test/*.test.js` **123** + 신규 통과.

---

### Task 1: `agent/model_select.py` — 하드웨어 감지 + 모델 선택 순수 로직

**Files:**
- Create: `agent/model_select.py`
- Test: `agent/tests/test_model_select.py`

**Interfaces:**
- Produces:
  - `MODEL_TIERS: tuple[tuple[str, float, int], ...]` — `(모델명, 최소 RAM GB, 최소 vCPU)` 큰 것부터: `(("llama3.1:8b", 7.0, 4), ("llama3.2:3b", 3.5, 2), ("llama3.2:1b", 1.8, 1))`.
  - `pick_model(installed, ram_gb, cpu_count) -> str | None` — **순수 함수.** `installed`(설치된 모델명 목록) 중 하드웨어 요건을 만족하는 **가장 큰** 티어를 고른다. 요건 미달이거나 설치된 게 없으면 `None`.
  - `detect_resources() -> tuple[float, int]` — `(ram_gb, cpu_count)`. 측정 불가면 `(0.0, os.cpu_count() or 1)`.
  - `installed_models(base_url, timeout=2.0) -> list[str]` — Ollama `/api/tags` 조회. 실패(연결 거부·타임아웃·형식 이상)면 `[]`.
- Task 2가 이 셋을 조합해 쓴다.

- [ ] **Step 1: Write the failing tests**

`agent/tests/test_model_select.py`:

```python
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
```

- [ ] **Step 2: Run to verify fail** — `py -3 -m pytest agent/tests/test_model_select.py -v` → ModuleNotFoundError.

- [ ] **Step 3: Implement `agent/model_select.py`**

```python
"""하드웨어와 설치 목록을 보고 모델을 고른다 — `LLM_MODEL=auto`일 때만 쓰인다.

**왜 하드웨어만으로는 부족한가**: RAM이 8GB여도 Ollama가 그 모델을 안 받아놨으면 못
쓴다(실제로 기본값 `gpt-oss-120b`가 어디에도 설치돼 있지 않아 404로 죽는 일이 있었다).
그래서 `설치된 목록 ∩ 하드웨어가 감당하는 티어` 중 가장 큰 것을 고른다.

**왜 vCPU도 보는가**: CPU 추론 속도는 코어 수에 거의 비례한다. RAM 8GB·2 vCPU인
m7i-flex.large는 8b를 *올릴 수는* 있지만 답변 1건에 수 분이 걸려 시연이 불가능하다.
"올라가는가"(RAM)와 "쓸 만한가"(vCPU)는 다른 벽이라 둘 다 본다.

새 의존성을 쓰지 않는다(폐쇄망 반입 비용) — 표준 라이브러리만.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

# (모델명, 최소 RAM GB, 최소 vCPU) — 큰 것부터. 사용자 확정 3종 고정.
MODEL_TIERS: tuple[tuple[str, float, int], ...] = (
    ("llama3.1:8b", 7.0, 4),
    ("llama3.2:3b", 3.5, 2),
    ("llama3.2:1b", 1.8, 1),
)


def pick_model(installed, ram_gb: float, cpu_count: int) -> str | None:
    """설치돼 있고 하드웨어가 감당하는 가장 큰 모델. 없으면 None."""
    # Ollama는 태그를 붙여 돌려주기도 한다(`llama3.2:3b` vs `llama3.2:3b-instruct-q4`).
    # 정확 일치를 우선하고, 없으면 접두사 일치까지 허용한다.
    names = list(installed or [])
    for model, min_ram, min_cpu in MODEL_TIERS:
        if ram_gb < min_ram or cpu_count < min_cpu:
            continue
        if model in names:
            return model
        for n in names:
            if n.startswith(model):
                return model
    return None


def detect_resources() -> tuple[float, int]:
    """(RAM GB, vCPU). 측정에 실패하면 RAM은 0.0으로 — 그러면 아무 티어도 안 걸린다."""
    cpu = os.cpu_count() or 1
    ram_bytes = 0
    try:
        if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names:
            ram_bytes = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        else:                                   # Windows
            import ctypes

            class _Mem(ctypes.Structure):
                _fields_ = [
                    ("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong),
                    ("ullTotalPhys", ctypes.c_ulonglong), ("ullAvailPhys", ctypes.c_ulonglong),
                    ("ullTotalPageFile", ctypes.c_ulonglong),
                    ("ullAvailPageFile", ctypes.c_ulonglong),
                    ("ullTotalVirtual", ctypes.c_ulonglong),
                    ("ullAvailVirtual", ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            m = _Mem(); m.dwLength = ctypes.sizeof(_Mem)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            ram_bytes = int(m.ullTotalPhys)
    except Exception:
        ram_bytes = 0
    return (round(ram_bytes / (1024 ** 3), 1) if ram_bytes else 0.0, cpu)


def installed_models(base_url: str, timeout: float = 2.0) -> list[str]:
    """Ollama `/api/tags`의 모델명 목록. 못 닿으면 빈 목록(호출부가 폴백을 정한다).

    `base_url`은 OpenAI-호환 경로(`…/v1`)로 들어오므로 그 꼬리를 떼고 native API를 부른다.
    """
    root = (base_url or "").rstrip("/")
    if root.endswith("/v1"):
        root = root[: -len("/v1")]
    try:
        with urllib.request.urlopen(f"{root}/api/tags", timeout=timeout) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, OSError, ValueError, TimeoutError):
        return []
    models = data.get("models") if isinstance(data, dict) else None
    if not isinstance(models, list):
        return []
    return [m.get("name") for m in models if isinstance(m, dict) and m.get("name")]
```

- [ ] **Step 4: Run to verify pass** — 8 passed.
- [ ] **Step 5: Commit** — `feat(agent): 모델 자동선택 순수 로직 — 하드웨어+설치목록 교집합 (Task 1)`

---

### Task 2: `agent/llm.py` — `LLM_MODEL=auto` 해석

**Files:**
- Modify: `agent/llm.py`
- Test: `agent/tests/test_llm.py`(추가 — 기존 테스트 무수정 통과가 요구사항)

**Interfaces:**
- Consumes: Task 1의 `detect_resources`·`installed_models`·`pick_model`.
- Produces:
  - `AUTO = "auto"`; `current_model()` — `LLM_MODEL`이 `auto`면 **해석된 모델명**을 돌려준다(프로세스 1회 캐시). 해석 실패 시 `DEFAULT_MODEL`을 돌려주고 경고를 stderr에 1회 남긴다(조용한 실패 금지).
  - `resolve_auto_model() -> str | None` — 캐시를 무시하고 지금 다시 판정(테스트·`GET /llm/status`용).
  - `model_info() -> dict` — `{"model": str, "requested": str, "auto": bool, "base_url": str, "ram_gb": float, "cpu_count": int, "installed": list[str]}`. Task 3의 API가 그대로 내보낸다.
  - `reset_model_cache() -> None` — 테스트 격리용.
- `get_llm()`·`structured_llm()`은 내부적으로 `current_model()`을 쓰도록 바꾼다 — 지금은 `_env("LLM_MODEL", DEFAULT_MODEL)`을 직접 부르는데, 그러면 `auto`가 그대로 모델명으로 나간다.

- [ ] **Step 1: Write the failing tests** (`agent/tests/test_llm.py` 하단에 추가 — 기존 테스트의 목 패턴을 먼저 읽고 맞출 것)

```python
import agent.llm as llm_mod


def _clear(monkeypatch):
    llm_mod.reset_model_cache()
    for k in ("LLM_MODEL", "LLM_FALLBACK_MODEL", "LLM_BASE_URL"):
        monkeypatch.delenv(k, raising=False)


def test_explicit_model_is_untouched(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    assert llm_mod.current_model() == "gpt-oss-120b"


def test_unset_model_keeps_default(monkeypatch):
    _clear(monkeypatch)
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL


def test_auto_resolves_from_hardware_and_installed(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (7.6, 2))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b", "llama3.2:3b"])
    assert llm_mod.current_model() == "llama3.2:3b"      # 2 vCPU → 3b


def test_auto_is_case_and_space_insensitive(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", " AUTO ")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.1:8b"])
    assert llm_mod.current_model() == "llama3.1:8b"


def test_auto_falls_back_to_default_when_nothing_installed(monkeypatch, capsys):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: [])
    assert llm_mod.current_model() == llm_mod.DEFAULT_MODEL
    assert "auto" in capsys.readouterr().err        # 조용히 넘어가지 않는다


def test_auto_result_is_cached(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    calls = []
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (16.0, 8))
    def spy(url):
        calls.append(url); return ["llama3.1:8b"]
    monkeypatch.setattr(llm_mod, "installed_models", spy)
    llm_mod.current_model(); llm_mod.current_model(); llm_mod.current_model()
    assert len(calls) == 1          # 매 호출마다 Ollama를 찌르면 안 된다


def test_model_info_shape(monkeypatch):
    _clear(monkeypatch)
    monkeypatch.setenv("LLM_MODEL", "auto")
    monkeypatch.setattr(llm_mod, "detect_resources", lambda: (7.6, 2))
    monkeypatch.setattr(llm_mod, "installed_models", lambda url: ["llama3.2:3b"])
    info = llm_mod.model_info()
    assert info["auto"] is True and info["requested"] == "auto"
    assert info["model"] == "llama3.2:3b" and info["cpu_count"] == 2
```

- [ ] **Step 2: Run to verify fail.**

- [ ] **Step 3: Implement** — `agent/llm.py`에 추가/변경:

```python
from agent.model_select import detect_resources, installed_models, pick_model

AUTO = "auto"
_auto_cache: str | None = None
_auto_warned = False


def reset_model_cache() -> None:
    """테스트 격리용 — 프로세스 캐시를 비운다."""
    global _auto_cache, _auto_warned
    _auto_cache = None
    _auto_warned = False


def _is_auto(value: str) -> bool:
    return value.strip().lower() == AUTO


def resolve_auto_model() -> str | None:
    """지금 하드웨어·설치목록으로 다시 판정한다(캐시 무시)."""
    ram_gb, cpu_count = detect_resources()
    return pick_model(installed_models(current_base_url()), ram_gb, cpu_count)


def current_model() -> str:
    """지금 쓰기로 돼 있는 1순위 모델. 실패를 사람에게 설명할 때도 쓴다.

    `LLM_MODEL=auto`면 하드웨어와 설치 목록을 보고 고른다(프로세스 1회 캐시 —
    매 호출마다 Ollama를 찌르면 추론마다 왕복이 붙는다).
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
    """화면에 '지금 무슨 모델을 쓰는지' 보여주기 위한 요약."""
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
```

`import sys` 추가. **`get_llm`·`structured_llm`의 `_env("LLM_MODEL", DEFAULT_MODEL)` 호출을 전부 `current_model()`로 교체**한다(그러지 않으면 `auto`가 모델명으로 나간다). `structured_llm`의 폴백 비교도 `current_model()` 기준으로.

- [ ] **Step 4: Run** — 신규 7 + 기존 `agent/tests/test_llm.py` 무수정 통과 + `py -3 -m pytest agent -q`.
- [ ] **Step 5: Commit** — `feat(agent): LLM_MODEL=auto 옵트인 — 하드웨어·설치목록 기반 선택 (Task 2)`

---

### Task 3: `GET /llm/status` + 대화 탭 모델 배지

**Files:**
- Create: `backend/routers/llm_status.py`
- Modify: `backend/main.py`(라우터 등록), `dashboard/js/chat.js`, `dashboard/index.html`(배지 자리)
- Test: `backend/tests/test_api_llm_status.py`, `dashboard/test/chat.test.js`(추가)

**Interfaces:**
- Produces: `GET /llm/status` → `agent.llm.model_info()` 그대로 + `"reachable": bool`(installed가 비었고 auto가 아니어도 판정 가능하게 `installed_models` 결과 유무로). 대화 탭이 열릴 때 1회 호출해 상단에 배지 표시: `🧠 llama3.2:3b` (auto면 `🧠 llama3.2:3b (자동 선택 · RAM 7.6GB / 2 vCPU)`).
- 순수 로직 `chat.modelBadgeText(info)`를 `chat.js`에 두고 node 테스트로 고정.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_api_llm_status.py`:

```python
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import create_app


def _client(tmp_path):
    return TestClient(create_app(str(tmp_path / "r.db"), output_root=str(tmp_path / "out"),
                                 graph_db_path=str(tmp_path / "g.db")))


@patch("agent.llm.installed_models", lambda url: ["llama3.2:3b"])
@patch("agent.llm.detect_resources", lambda: (7.6, 2))
def test_status_reports_resolved_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "auto")
    import agent.llm as m; m.reset_model_cache()
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "llama3.2:3b"
    assert body["auto"] is True and body["cpu_count"] == 2


def test_status_with_explicit_model(tmp_path, monkeypatch):
    monkeypatch.setenv("LLM_MODEL", "gpt-oss-120b")
    import agent.llm as m; m.reset_model_cache()
    body = _client(tmp_path).get("/llm/status").json()
    assert body["model"] == "gpt-oss-120b" and body["auto"] is False
```

`dashboard/test/chat.test.js`에 추가:

```js
test('modelBadgeText: 자동 선택이면 근거(RAM·vCPU)까지 보여준다', function () {
  const t = chat.modelBadgeText({ model: 'llama3.2:3b', auto: true, ram_gb: 7.6, cpu_count: 2 });
  assert.ok(t.indexOf('llama3.2:3b') >= 0);
  assert.ok(t.indexOf('자동') >= 0 && t.indexOf('7.6') >= 0 && t.indexOf('2') >= 0);
});

test('modelBadgeText: 명시 지정이면 모델명만', function () {
  const t = chat.modelBadgeText({ model: 'gpt-oss-120b', auto: false });
  assert.strictEqual(t.indexOf('자동'), -1);
  assert.ok(t.indexOf('gpt-oss-120b') >= 0);
});

test('modelBadgeText: 정보가 없으면 빈 문자열(배지를 숨긴다)', function () {
  assert.strictEqual(chat.modelBadgeText(null), '');
});
```

- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** — 라우터는 `from agent.llm import model_info`를 그대로 반환(backend→agent import는 허용된 방향). `index.html`에 대화 탭 헤더 영역 `<span id="chat-model-badge"></span>` 추가(추가만), `chat.js`가 `mount` 시 `GET /llm/status`를 `r.ok` 검사·`.catch`와 함께 호출해 `modelBadgeText()` 결과를 `logic.esc`로 넣는다. 실패하면 배지를 숨긴다(대화 자체는 계속 동작해야 한다).
- [ ] **Step 4: Run** — 신규 pytest 2 + node 3, 전체 통과.
- [ ] **Step 5: Commit** — `feat: GET /llm/status + 대화 탭 모델 배지 (Task 3)`

---

### Task 4: 지식 탭 — 검색이 임베딩 모델을 썼는지 표시

**Files:**
- Modify: `backend/routers/search.py`(응답 확장), `dashboard/js/knowledge.js`
- Test: `backend/tests/test_api_search_meta.py`, `dashboard/test/knowledge.test.js`(추가)

**Interfaces:**
- 현재 `GET /search`는 `list[dict]`를 그대로 돌려주고 `knowledge.js`가 `score_kind`로 rrf/bm25를 표시한다. **응답 형태를 바꾸면 프런트가 깨지므로**, 배열은 그대로 두고 **HTTP 응답 헤더**로 메타를 싣는다: `X-Search-Mode: rrf|bm25`, `X-Embed-Model: bge-m3`(rrf일 때만).
  - 이유: 기존 `knowledge.js`·테스트가 배열을 전제로 쓰여 있고, 헤더는 추가만이라 하위 호환이 깨지지 않는다.
- `knowledge.js`: 결과 상단 요약에 rrf면 `의미검색 사용 · bge-m3`, bm25면 `키워드 검색(FTS)`을 덧붙인다. 순수 함수 `knowledge.searchModeText(mode, embedModel)`로 분리해 테스트.

- [ ] **Step 1: Write the failing tests** — pytest는 rrf/bm25 각각에서 헤더가 맞게 나오는지(검색은 목), node는 `searchModeText` 문구.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** — 라우터에서 `chunks[0].score_kind`로 모드를 정하고(빈 결과면 헤더 생략), 임베딩 모델명은 `agent.retrieval.embedder`의 현재 모델 함수(`embedder` 모듈의 모델명 반환 함수 — 실제 이름을 코드에서 확인해 쓸 것)로.
- [ ] **Step 4: Run** — 전체 통과.
- [ ] **Step 5: Commit** — `feat: 지식 탭에 검색 모드·임베딩 모델 표시 (Task 4)`

---

### Task 5: `messages.model` — subagent가 쓴 모델을 이력에 기록

**Files:**
- Modify: `backend/db.py`(`MESSAGE_MIGRATIONS`), `backend/models.py`(`Message`), `backend/task_repository.py`(`add_message`), `agent/orchestrator/ports.py`(Recorder), `backend/orchestrator_recorder.py`, `agent/orchestrator/subagents.py`
- Test: `backend/tests/test_task_repository.py`·`test_orchestrator_recorder.py` 추가, `agent/tests/test_orchestrator_subagents.py` 추가

**Interfaces:**
- `MESSAGE_MIGRATIONS`에 `"model": "TEXT"` 추가(기존 멱등 마이그레이션이 기존 DB에 자동 적용).
- `add_message(conn, task_id, role, content, author=None, model=None)` — 기존 호출부 무영향(기본값 None).
- `Recorder.message(team, role, content, author=None, model=None)` / `NullRecorder`·`DbRecorder` 동일 확장.
- `agent/orchestrator/subagents.py`: LLM을 쓴 노드(`rfi_agent`·`draft_team`·`verifier`)가 보고를 남길 때 `model=llm.current_model()`을 함께 넘긴다. **LLM을 쓰지 않는 기록에는 넣지 않는다**(그래야 화면에서 "이 단계는 모델을 썼다"가 의미를 갖는다).
- `Message` 모델에 `model: str | None = None`.

- [ ] **Step 1: Write the failing tests** — ① `add_message(..., model="llama3.2:3b")` 후 조회에 실린다 ② `DbRecorder.message(..., model=…)`가 DB에 남는다 ③ `draft_team`이 recorder에 `model` 키워드를 넘긴다(목으로 호출 인자 단언) ④ 기존 호출(모델 없이)은 `None`으로 남는다.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `py -3 -m pytest -q` 전체.
- [ ] **Step 5: Commit** — `feat: 수행 이력에 사용 모델 기록 — messages.model (Task 5)`

---

### Task 6: 워크플로 로그에 모델 표시 + 문서 갱신

**Files:**
- Modify: `backend/routers/tasks.py`(TaskDetail 응답에 model 포함 확인 — `Message` 모델 확장으로 자동), `dashboard/js/workflow.js`(`logRows`·렌더), `docs/실행가이드_backend-agent.md`, `INSTALL.md`
- Test: `dashboard/test/workflow.test.js` 추가

**Interfaces:**
- `workflow.logRows(detail)`가 `{role, content, at, model}`을 돌려주고, 렌더가 `model`이 있을 때만 `· 🧠 llama3.2:3b`를 덧붙인다(없으면 아무것도 안 붙는다 — 사람 발화·비LLM 기록이 지저분해지지 않게).
- 문서: 실행가이드에 "화면에서 사용 모델 확인하는 법"(대화 탭 배지·지식 탭 모드·워크플로 로그) 한 절, `INSTALL.md` §6 서비스 파일에 **`LLM_MODEL=auto` 사용법**을 대안으로 추가(기본은 명시값 유지 — 폐쇄망 운영은 명시가 원칙).

- [ ] **Step 1~5**: 위와 동일 패턴(테스트 → 실패 확인 → 구현 → 전체 통과 → 커밋).
- 커밋: `feat+docs: 워크플로 로그에 사용 모델 표시 + 가이드·INSTALL 갱신 (Task 6)`

---

## Self-Review 결과

- **요구 coverage**: 자동선택 옵트인=T1·T2, 대화 탭 표시=T3, 지식 탭 표시=T4, 워크플로 이력 모델명=T5·T6. 후보 3종 고정·옵트인은 Global Constraints에 못박음.
- **Placeholder scan**: T4의 임베딩 모델명 접근자와 T6의 세부 스텝은 "코드에서 실제 이름을 확인해 쓸 것"으로 지시(추측 코드 금지). 그 외 코드 블록은 전부 실물.
- **Type consistency**: `pick_model(installed, ram_gb, cpu_count)`(T1 정의 = T2 사용), `model_info()` 키(T2 정의 = T3 API·배지 사용), `message(..., model=None)`(T5 정의 = T6 표시), 헤더명 `X-Search-Mode`/`X-Embed-Model`(T4 내 일관).
